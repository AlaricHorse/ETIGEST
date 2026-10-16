// src/app/api/teacher/attendance/route.ts
// Etapa 6: Envio de chamada, rascunho e limite estrito de 1 única correção pós-envio pelo professor
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedSession } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedSession();
  if (!auth.authorized) return auth.response!;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('classId');
  const classDate = searchParams.get('classDate'); // YYYY-MM-DD

  if (!classId || !classDate) {
    return NextResponse.json({ error: 'Turma (classId) e data da aula (classDate) são obrigatórios.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // 1. Validar vínculo do professor com a turma (se não for ADMIN)
  if (auth.role === 'TEACHER') {
    const { data: assignment } = await supabase
      .from('teacher_classes')
      .select('id')
      .eq('teacher_id', auth.profileId)
      .eq('class_id', classId)
      .single();

    if (!assignment) {
      return NextResponse.json(
        { error: 'ACESSO_RESTRITO: Você não está vinculado a esta turma.' },
        { status: 403 }
      );
    }
  }

  // 2. Buscar alunos ativos matriculados na turma + status configurados pela escola
  const [{ data: students }, { data: statuses }, { data: existingCall }] = await Promise.all([
    supabase
      .from('students')
      .select('id, registration_number, full_name, course_id')
      .eq('class_id', classId)
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
    supabase
      .from('attendance_statuses')
      .select('code, label, counts_as_present, counts_in_total_classes')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('attendance_calls')
      .select('id, status, submitted_at, teacher_id')
      .eq('class_id', classId)
      .eq('class_date', classDate)
      .maybeSingle(),
  ]);

  let recordsMap: Record<string, { id: string; status_code: string; teacher_correction_count: number }> = {};
  if (existingCall) {
    const { data: records } = await supabase
      .from('attendance_records')
      .select('id, student_id, status_code, teacher_correction_count')
      .eq('call_id', existingCall.id);

    (records || []).forEach((r) => {
      recordsMap[r.student_id] = {
        id: r.id,
        status_code: r.status_code,
        teacher_correction_count: r.teacher_correction_count,
      };
    });
  }

  return NextResponse.json({
    call: existingCall || null,
    statuses: statuses || [],
    students: (students || []).map((s) => ({
      ...s,
      record: recordsMap[s.id] || null,
      canTeacherEdit:
        !existingCall ||
        existingCall.status === 'DRAFT' ||
        (existingCall.status === 'SUBMITTED' && (recordsMap[s.id]?.teacher_correction_count ?? 0) < 1),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedSession();
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { classId, classDate, action, entries } = body as {
    classId: string;
    classDate: string;
    action: 'SAVE_DRAFT' | 'SUBMIT_CALL' | 'TEACHER_SINGLE_CORRECTION';
    entries: Array<{ studentId: string; statusCode: string; justification?: string }>;
  };

  if (!classId || !classDate || !Array.isArray(entries)) {
    return NextResponse.json({ error: 'Parâmetros de chamada inválidos.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // Verificar vínculo do professor com a turma no servidor
  if (auth.role === 'TEACHER') {
    const { data: link } = await supabase
      .from('teacher_classes')
      .select('id')
      .eq('teacher_id', auth.profileId)
      .eq('class_id', classId)
      .single();

    if (!link) {
      return NextResponse.json(
        { error: 'ACESSO_NEGADO: Professor não vinculado a esta turma.' },
        { status: 403 }
      );
    }
  }

  const { data: targetClass } = await supabase
    .from('classes')
    .select('id, course_id')
    .eq('id', classId)
    .single();

  if (!targetClass) {
    return NextResponse.json({ error: 'Turma não encontrada.' }, { status: 404 });
  }

  // Verificar se já existe chamada para esta turma e data
  const { data: existingCall } = await supabase
    .from('attendance_calls')
    .select('id, status')
    .eq('class_id', classId)
    .eq('class_date', classDate)
    .maybeSingle();

  // Caso 1: Correção individual pós-envio pelo professor (Regra 7.2: Limite de 1 única vez)
  if (existingCall && existingCall.status === 'SUBMITTED') {
    if (action !== 'TEACHER_SINGLE_CORRECTION' || entries.length !== 1) {
      return NextResponse.json(
        { error: 'Chamada já enviada. Apenas 1 correção individual por aluno é permitida.' },
        { status: 409 }
      );
    }

    const item = entries[0];
    const { data: currentRecord } = await supabase
      .from('attendance_records')
      .select('id, status_code, teacher_correction_count')
      .eq('call_id', existingCall.id)
      .eq('student_id', item.studentId)
      .single();

    if (!currentRecord) {
      return NextResponse.json({ error: 'Registro de frequência não encontrado.' }, { status: 404 });
    }

    if (currentRecord.teacher_correction_count >= 1) {
      return NextResponse.json(
        {
          error:
            'LIMITE_CORRECAO_EXCEDIDO: Você já utilizou a única correção permitida para este aluno nesta data. Solicite ajuste à administração.',
        },
        { status: 403 }
      );
    }

    // O UPDATE aciona a trigger trg_attendance_correction no PostgreSQL, que incrementa
    // teacher_correction_count para 1 e grava o log imutável em audit_logs!
    const { data: updated, error: updateErr } = await supabase
      .from('attendance_records')
      .update({
        status_code: item.statusCode,
        recorded_by: auth.profileId,
        last_justification: item.justification || 'Correção única realizada pelo professor',
      })
      .eq('id', currentRecord.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 403 });
    }

    return NextResponse.json({
      message: 'Frequência corrigida com sucesso. O registro deste aluno agora está bloqueado para novas edições do professor.',
      record: updated,
    });
  }

  // Caso 2: Criação ou atualização de Rascunho (DRAFT) ou Envio Definitivo (SUBMIT_CALL)
  const targetStatus = action === 'SUBMIT_CALL' ? 'SUBMITTED' : 'DRAFT';
  const nowIso = new Date().toISOString();

  let callId = existingCall?.id;
  if (!callId) {
    const { data: createdCall, error: callErr } = await supabase
      .from('attendance_calls')
      .insert({
        class_id: classId,
        course_id: targetClass.course_id,
        teacher_id: auth.profileId,
        class_date: classDate,
        status: targetStatus,
        submitted_at: targetStatus === 'SUBMITTED' ? nowIso : null,
      })
      .select('id')
      .single();

    if (callErr || !createdCall) {
      return NextResponse.json({ error: callErr?.message || 'Erro ao criar chamada.' }, { status: 500 });
    }
    callId = createdCall.id;
  } else {
    await supabase
      .from('attendance_calls')
      .update({
        status: targetStatus,
        submitted_at: targetStatus === 'SUBMITTED' ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', callId);
  }

  const upsertPayload = entries.map((e) => ({
    call_id: callId,
    student_id: e.studentId,
    class_id: classId,
    class_date: classDate,
    status_code: e.statusCode,
    recorded_by: auth.profileId,
    submitted_at: nowIso,
  }));

  const { error: recordsErr } = await supabase
    .from('attendance_records')
    .upsert(upsertPayload, { onConflict: 'student_id,class_id,class_date' });

  if (recordsErr) {
    return NextResponse.json({ error: recordsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    callId,
    status: targetStatus,
    message:
      targetStatus === 'SUBMITTED'
        ? 'Chamada enviada com sucesso!'
        : 'Rascunho salvo com sucesso (não contabilizado nos relatórios até o envio).',
  });
}
