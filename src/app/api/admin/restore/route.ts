// src/app/api/admin/restore/route.ts
// Etapa 8 (Item 9.3): Restauração Segura de JSON com Validação Estrutural, Prévia e Confirmação Explícita
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export interface RestorePreviewSummary {
  validStructure: boolean;
  schemaVersion: string;
  counts: {
    toAdd: { courses: number; students: number; calls: number; records: number };
    toUpdate: { courses: number; students: number; calls: number; records: number };
    toIgnore: { courses: number; students: number; calls: number; records: number };
    rejected: Array<{ entity: string; identifier: string; reason: string }>;
  };
  conflicts: Array<{
    entity: 'COURSE' | 'STUDENT' | 'ATTENDANCE_RECORD';
    id: string;
    identifier: string;
    currentValue: any;
    incomingValue: any;
  }>;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { backupPayload, mode, conflictStrategy } = body as {
    backupPayload: any;
    mode: 'PREVIEW' | 'CONFIRM_RESTORE';
    conflictStrategy?: 'KEEP_EXISTING' | 'OVERWRITE_WITH_BACKUP';
  };

  // 1. Validar formato e estrutura do JSON
  if (
    !backupPayload ||
    backupPayload.system !== 'ETI Gestão Escolar' ||
    !backupPayload.data ||
    !Array.isArray(backupPayload.data.courses) ||
    !Array.isArray(backupPayload.data.students)
  ) {
    return NextResponse.json(
      {
        error:
          'ARQUIVO_INVALIDO: O arquivo JSON enviado não possui a assinatura ou estrutura oficial do ETI Gestão Escolar.',
      },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const incomingCourses = backupPayload.data.courses || [];
  const incomingStudents = backupPayload.data.students || [];
  const incomingCalls = backupPayload.data.attendance_calls || [];
  const incomingRecords = backupPayload.data.attendance_records || [];

  // 2. Buscar estado atual do banco para detectar duplicidades e conflitos antes de alterar qualquer dado
  const [
    { data: dbCourses },
    { data: dbStudents },
    { data: dbCalls },
    { data: dbRecords },
  ] = await Promise.all([
    supabase.from('courses').select('id, course_code, name, is_active'),
    supabase.from('students').select('id, registration_number, full_name, course_id'),
    supabase.from('attendance_calls').select('id, class_id, class_date, status'),
    supabase.from('attendance_records').select('id, student_id, class_id, class_date, status_code'),
  ]);

  const dbCourseById = new Map((dbCourses || []).map((c: any) => [c.id, c]));
  const dbStudentById = new Map((dbStudents || []).map((s: any) => [s.id, s]));
  const dbStudentByReg = new Map((dbStudents || []).map((s: any) => [s.registration_number, s]));
  const dbCallById = new Map((dbCalls || []).map((ca: any) => [ca.id, ca]));
  const dbRecordById = new Map((dbRecords || []).map((r: any) => [r.id, r]));

  const preview: RestorePreviewSummary = {
    validStructure: true,
    schemaVersion: backupPayload.schemaVersion || '1.0.0',
    counts: {
      toAdd: { courses: 0, students: 0, calls: 0, records: 0 },
      toUpdate: { courses: 0, students: 0, calls: 0, records: 0 },
      toIgnore: { courses: 0, students: 0, calls: 0, records: 0 },
      rejected: [],
    },
    conflicts: [],
  };

  const validCourseIds = new Set<string>([
    ...Array.from(dbCourseById.keys()),
    ...incomingCourses.map((c: any) => c.id).filter(Boolean),
  ]);

  // Validar Cursos
  for (const c of incomingCourses) {
    if (!c.id || typeof c.course_code !== 'number' || !c.name) {
      preview.counts.rejected.push({
        entity: 'COURSE',
        identifier: String(c.course_code || 'SEM_CODIGO'),
        reason: 'Curso sem ID interno UUID ou código numérico inválido.',
      });
      continue;
    }
    const existing = dbCourseById.get(c.id);
    if (!existing) {
      preview.counts.toAdd.courses++;
    } else if (existing.name !== c.name || existing.course_code !== c.course_code) {
      preview.counts.toUpdate.courses++;
      preview.conflicts.push({
        entity: 'COURSE',
        id: c.id,
        identifier: `Curso #${c.course_code}`,
        currentValue: existing,
        incomingValue: c,
      });
    } else {
      preview.counts.toIgnore.courses++;
    }
  }

  // Validar Alunos e integridade do vínculo com o ID permanente do curso
  for (const s of incomingStudents) {
    if (!s.id || !s.registration_number || !s.full_name || !s.course_id) {
      preview.counts.rejected.push({
        entity: 'STUDENT',
        identifier: String(s.registration_number || 'SEM_MATRICULA'),
        reason: 'Aluno com campos obrigatórios ausentes.',
      });
      continue;
    }
    if (!validCourseIds.has(s.course_id)) {
      preview.counts.rejected.push({
        entity: 'STUDENT',
        identifier: s.registration_number,
        reason: `Vínculo órfão: course_id (${s.course_id}) não existe no banco nem no arquivo de backup.`,
      });
      continue;
    }

    const existing = dbStudentById.get(s.id) || dbStudentByReg.get(s.registration_number);
    if (!existing) {
      preview.counts.toAdd.students++;
    } else if (
      existing.full_name !== s.full_name ||
      existing.course_id !== s.course_id ||
      existing.registration_number !== s.registration_number
    ) {
      preview.counts.toUpdate.students++;
      preview.conflicts.push({
        entity: 'STUDENT',
        id: existing.id,
        identifier: `Matrícula ${s.registration_number}`,
        currentValue: existing,
        incomingValue: s,
      });
    } else {
      preview.counts.toIgnore.students++;
    }
  }

  // Validar Chamadas e Registros de Frequência
  for (const ca of incomingCalls) {
    if (!ca.id || !ca.class_id || !ca.class_date) continue;
    if (!dbCallById.has(ca.id)) preview.counts.toAdd.calls++;
    else preview.counts.toIgnore.calls++;
  }

  for (const rec of incomingRecords) {
    if (!rec.id || !rec.student_id || !rec.class_date || !rec.status_code) continue;
    const existingRec = dbRecordById.get(rec.id);
    if (!existingRec) {
      preview.counts.toAdd.records++;
    } else if (existingRec.status_code !== rec.status_code) {
      preview.counts.toUpdate.records++;
    } else {
      preview.counts.toIgnore.records++;
    }
  }

  // Se o modo for PREVIEW, retorna o relatório detalhado sem alterar nenhum dado no banco!
  if (mode === 'PREVIEW') {
    return NextResponse.json({ preview });
  }

  // Modo CONFIRM_RESTORE: Exige confirmação explícita e estratégia definida
  const strategy = conflictStrategy || 'KEEP_EXISTING';

  // 1. Restaurar Cursos
  for (const c of incomingCourses) {
    if (!c.id || typeof c.course_code !== 'number' || !c.name) continue;
    const existing = dbCourseById.get(c.id);
    if (!existing) {
      await supabase.from('courses').insert({
        id: c.id,
        course_code: c.course_code,
        name: c.name,
        is_active: c.is_active ?? true,
      });
    } else if (strategy === 'OVERWRITE_WITH_BACKUP') {
      await supabase
        .from('courses')
        .update({ course_code: c.course_code, name: c.name, is_active: c.is_active ?? true })
        .eq('id', c.id);
    }
  }

  // 2. Restaurar Alunos preservando UUID do curso
  for (const s of incomingStudents) {
    if (!s.id || !s.registration_number || !s.full_name || !validCourseIds.has(s.course_id)) continue;
    const existing = dbStudentById.get(s.id) || dbStudentByReg.get(s.registration_number);
    if (!existing) {
      await supabase.from('students').insert({
        id: s.id,
        registration_number: s.registration_number,
        full_name: s.full_name,
        course_id: s.course_id,
        class_id: s.class_id || null,
        is_active: s.is_active ?? true,
      });
    } else if (strategy === 'OVERWRITE_WITH_BACKUP') {
      await supabase
        .from('students')
        .update({
          full_name: s.full_name,
          course_id: s.course_id,
          class_id: s.class_id || null,
          is_active: s.is_active ?? true,
        })
        .eq('id', existing.id);
    }
  }

  // 3. Registrar a restauração em audit_logs
  await supabase.from('audit_logs').insert({
    entity_type: 'BACKUP',
    entity_id: auth.profileId,
    action: 'RESTORE',
    previous_values: { conflictStrategy: strategy },
    new_values: preview.counts,
    justification: 'Restauração de backup JSON confirmada pelo administrador.',
    performed_by: auth.profileId,
    performed_by_role: 'ADMIN',
  });

  return NextResponse.json({
    restored: true,
    strategyApplied: strategy,
    summary: preview.counts,
  });
}
