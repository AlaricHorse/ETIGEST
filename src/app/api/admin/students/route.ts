// src/app/api/admin/students/route.ts
// Item 5, 6.2 e 8.4: Cadastro (3 campos obrigatórios), pesquisa (matrícula/nome/curso),
// edição individual com confirmação explícita de troca de curso e histórico individual do aluno
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';
import { calculateStudentAttendance, AttendanceStatusConfig } from '@/lib/reports/attendance-calculator';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim() || '';
  const courseId = searchParams.get('courseId') || '';
  const studentIdForHistory = searchParams.get('studentId') || '';

  const supabase = createAdminSupabaseClient();

  // Caso 1: Consulta do Histórico Individual Completo de um Aluno (Item 8.4)
  if (studentIdForHistory) {
    const [
      { data: student },
      { data: statuses },
      { data: records },
      { data: auditHistory },
    ] = await Promise.all([
      supabase
        .from('students')
        .select('*, courses(id, course_code, name), classes(id, code, name)')
        .eq('id', studentIdForHistory)
        .single(),
      supabase.from('attendance_statuses').select('*'),
      supabase
        .from('attendance_records')
        .select('*, attendance_calls(status, class_date, teacher_id)')
        .eq('student_id', studentIdForHistory)
        .order('class_date', { ascending: false }),
      supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_id', studentIdForHistory)
        .order('performed_at', { ascending: false }),
    ]);

    if (!student) {
      return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    }

    const statusMap = new Map<string, AttendanceStatusConfig>(
      (statuses || []).map((st: any) => [st.code, st])
    );

    const formattedRecords = (records || []).map((r: any) => ({
      ...r,
      call_status: r.attendance_calls?.status || 'SUBMITTED',
    }));

    const summary = calculateStudentAttendance(
      {
        id: student.id,
        registration_number: student.registration_number,
        full_name: student.full_name,
        course_name: student.courses?.name || 'N/A',
      },
      formattedRecords,
      statusMap
    );

    return NextResponse.json({
      student,
      summary,
      historyByDate: formattedRecords,
      auditHistory: auditHistory || [],
    });
  }

  // Caso 2: Listagem e Pesquisa por matrícula, nome ou curso
  let query = supabase
    .from('students')
    .select('id, registration_number, full_name, course_id, class_id, is_active, updated_at, courses(id, course_code, name), classes(id, code, name)')
    .order('full_name', { ascending: true });

  if (courseId) {
    query = query.eq('course_id', courseId);
  }
  if (search) {
    query = query.or(`registration_number.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ students: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  // Item 5: Somente 3 campos obrigatórios (1. Número da matrícula, 2. Nome completo, 3. Curso)
  const { registration_number, full_name, course_id, class_id } = (await req.json()) as {
    registration_number: string;
    full_name: string;
    course_id: string;
    class_id?: string | null;
  };

  if (!registration_number?.trim() || !full_name?.trim() || !course_id) {
    return NextResponse.json(
      { error: 'Os 3 campos obrigatórios são: Número da matrícula, Nome completo e Curso.' },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data: created, error } = await supabase
    .from('students')
    .insert({
      registration_number: registration_number.trim(),
      full_name: full_name.trim().toUpperCase(),
      course_id, // Sempre vinculado ao UUID interno permanente do curso!
      class_id: class_id || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Já existe um aluno cadastrado com este número de matrícula.' },
      { status: 409 }
    );
  }

  await supabase.from('audit_logs').insert({
    entity_type: 'STUDENT',
    entity_id: created.id,
    action: 'CREATE',
    previous_values: null,
    new_values: created,
    performed_by: auth.profileId,
    performed_by_role: 'ADMIN',
  });

  return NextResponse.json({ student: created });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  // Item 6.2: Edição manual de matrícula, nome e curso exigindo confirmação ao alterar o curso
  // e modificando SOMENTE o aluno selecionado (WHERE id = studentId)
  const { id, registration_number, full_name, course_id, class_id, confirmCourseChange } =
    (await req.json()) as {
      id: string;
      registration_number: string;
      full_name: string;
      course_id: string;
      class_id?: string | null;
      confirmCourseChange?: boolean;
    };

  if (!id || !registration_number?.trim() || !full_name?.trim() || !course_id) {
    return NextResponse.json(
      { error: 'ID do aluno, matrícula, nome completo e curso são obrigatórios.' },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data: currentStudent } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();

  if (!currentStudent) {
    return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  }

  if (currentStudent.course_id !== course_id && !confirmCourseChange) {
    return NextResponse.json(
      {
        requiresConfirmation: true,
        error:
          'CONFIRMACAO_NECESSARIA: Você está alterando o curso deste aluno. Confirme explicitamente a operação para prosseguir.',
      },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabase
    .from('students')
    .update({
      registration_number: registration_number.trim(),
      full_name: full_name.trim().toUpperCase(),
      course_id,
      class_id: class_id !== undefined ? class_id : currentStudent.class_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id) // Modifica estritamente o aluno selecionado!
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ student: updated });
}
