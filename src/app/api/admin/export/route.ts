// src/app/api/admin/export/route.ts
// Etapa 8 (Item 9): Exportação Completa e Personalizada em JSON, TXT, CSV, Excel (.xlsx) e PDF
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';
import { calculateStudentAttendance, AttendanceStatusConfig } from '@/lib/reports/attendance-calculator';

export interface ExportFilterParams {
  exportType: 'COMPLETE' | 'CUSTOM';
  format: 'JSON' | 'TXT' | 'CSV' | 'XLSX' | 'PDF';
  courseId?: string;
  classId?: string;
  teacherId?: string;
  studentId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  includeAuditLogs?: boolean;
}

/**
 * Sanitizador estrito LGPD / Segurança:
 * Garante que NENHUM campo sensível (password_hash, tokens, chaves, auth_user_id interno)
 * seja incluído em exportações ou backups.
 */
function sanitizeProfilesForExport(profiles: any[]) {
  return (profiles || []).map((p) => ({
    id: p.id,
    username: p.username,
    email: p.email,
    full_name: p.full_name,
    role: p.role,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const params = (await req.json()) as ExportFilterParams;
  const supabase = createAdminSupabaseClient();

  // 1. Carregar tabelas base preservando os vínculos por UUID permanente
  let coursesQuery = supabase.from('courses').select('*').order('course_code');
  if (params.exportType === 'CUSTOM' && params.courseId) {
    coursesQuery = coursesQuery.eq('id', params.courseId);
  }

  let classesQuery = supabase.from('classes').select('*').order('code');
  if (params.exportType === 'CUSTOM' && params.classId) {
    classesQuery = classesQuery.eq('id', params.classId);
  } else if (params.exportType === 'CUSTOM' && params.courseId) {
    classesQuery = classesQuery.eq('course_id', params.courseId);
  }

  let studentsQuery = supabase.from('students').select('*').order('full_name');
  if (params.exportType === 'CUSTOM') {
    if (params.studentId) studentsQuery = studentsQuery.eq('id', params.studentId);
    if (params.courseId) studentsQuery = studentsQuery.eq('course_id', params.courseId);
    if (params.classId) studentsQuery = studentsQuery.eq('class_id', params.classId);
  }

  let callsQuery = supabase.from('attendance_calls').select('*').order('class_date', { ascending: true });
  if (params.exportType === 'CUSTOM') {
    if (params.classId) callsQuery = callsQuery.eq('class_id', params.classId);
    if (params.courseId) callsQuery = callsQuery.eq('course_id', params.courseId);
    if (params.teacherId) callsQuery = callsQuery.eq('teacher_id', params.teacherId);
    if (params.startDate) callsQuery = callsQuery.gte('class_date', params.startDate);
    if (params.endDate) callsQuery = callsQuery.lte('class_date', params.endDate);
  }

  let recordsQuery = supabase.from('attendance_records').select('*').order('class_date', { ascending: true });
  if (params.exportType === 'CUSTOM') {
    if (params.studentId) recordsQuery = recordsQuery.eq('student_id', params.studentId);
    if (params.classId) recordsQuery = recordsQuery.eq('class_id', params.classId);
    if (params.startDate) recordsQuery = recordsQuery.gte('class_date', params.startDate);
    if (params.endDate) recordsQuery = recordsQuery.lte('class_date', params.endDate);
  }

  const [
    { data: profilesRaw },
    { data: courses },
    { data: classes },
    { data: teacherClasses },
    { data: students },
    { data: statuses },
    { data: calls },
    { data: records },
    { data: auditLogs },
  ] = await Promise.all([
    supabase.from('profiles').select('id, username, email, full_name, role, is_active, created_at, updated_at'),
    coursesQuery,
    classesQuery,
    supabase.from('teacher_classes').select('*'),
    studentsQuery,
    supabase.from('attendance_statuses').select('*'),
    callsQuery,
    recordsQuery,
    params.includeAuditLogs !== false
      ? supabase.from('audit_logs').select('*').order('performed_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const sanitizedProfiles = sanitizeProfilesForExport(profilesRaw || []);
  const courseMap = new Map((courses || []).map((c: any) => [c.id, c]));
  const classMap = new Map((classes || []).map((cl: any) => [cl.id, cl]));
  const teacherMap = new Map(sanitizedProfiles.map((p) => [p.id, p]));
  const callMap = new Map((calls || []).map((ca: any) => [ca.id, ca]));
  const statusMap = new Map<string, AttendanceStatusConfig>(
    (statuses || []).map((st: any) => [st.code, st])
  );

  // Construir linhas detalhadas e consolidadas para CSV, TXT, XLSX e PDF (Item 9.1)
  const rawRecordsForCalc = (records || []).map((r: any) => {
    const call = callMap.get(r.call_id);
    return {
      ...r,
      call_status: call?.status || 'SUBMITTED',
    };
  });

  const studentSummaries = (students || []).map((s: any) => {
    const c = courseMap.get(s.course_id);
    const summary = calculateStudentAttendance(
      {
        id: s.id,
        registration_number: s.registration_number,
        full_name: s.full_name,
        course_name: c?.name || 'N/A',
      },
      rawRecordsForCalc,
      statusMap
    );
    return {
      ...summary,
      courseId: s.course_id,
      courseCode: c?.course_code ?? null,
      className: classMap.get(s.class_id)?.name || 'Sem Turma',
    };
  });

  const detailedRows = (records || []).map((r: any) => {
    const student = (students || []).find((s: any) => s.id === r.student_id);
    const course = student ? courseMap.get(student.course_id) : null;
    const cls = classMap.get(r.class_id);
    const call = callMap.get(r.call_id);
    const teacher = call ? teacherMap.get(call.teacher_id) : null;
    const statusObj = statusMap.get(r.status_code);
    const summary = studentSummaries.find((sm) => sm.studentId === r.student_id);

    return {
      registration_number: student?.registration_number || '',
      student_name: student?.full_name || '',
      course_name: course?.name || '',
      course_internal_id: student?.course_id || '',
      course_code: course?.course_code ?? '',
      teacher_name: teacher?.full_name || '',
      class_name: cls?.name || '',
      class_date: r.class_date,
      attendance_status_code: r.status_code,
      attendance_status_label: statusObj?.label || r.status_code,
      call_status: call?.status || 'SUBMITTED',
      attendance_percentage: summary?.formattedPercentage || 'Sem dados de frequência',
      present_count: summary?.presentCount ?? 0,
      absent_count: summary?.absentCount ?? 0,
      early_leave_count: summary?.earlyLeaveCount ?? 0,
      last_justification: r.last_justification || '',
    };
  });

  const nowBrt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Formato 1: JSON estruturado completo (compatível com Restauração 9.3)
  if (params.format === 'JSON') {
    const payload = {
      schemaVersion: '1.0.0',
      system: 'ETI Gestão Escolar',
      exportedAt: new Date().toISOString(),
      timezone: 'America/Fortaleza',
      exportType: params.exportType,
      data: {
        courses: courses || [],
        classes: classes || [],
        profiles: sanitizedProfiles,
        teacher_classes: teacherClasses || [],
        students: students || [],
        attendance_statuses: statuses || [],
        attendance_calls: calls || [],
        attendance_records: records || [],
        audit_logs: auditLogs || [],
      },
      summaries: studentSummaries,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ETI_Exportacao_${nowBrt}.json"`,
      },
    });
  }

  // Formato 2: TXT compatível com reimportação ou relatório textual
  if (params.format === 'TXT') {
    const txtLines = [
      '# ETI GESTÃO ESCOLAR - EXPORTAÇÃO DE ALUNOS E FREQUÊNCIA',
      'MATRÍCULA, NOME DO ALUNO, CÓDIGO DO CURSO, CURSO ATUAL, ID INTERNO CURSO, FREQUÊNCIA (%), PRESENÇAS, FALTAS, SAÍDAS',
      ...studentSummaries.map(
        (s) =>
          `${s.registrationNumber}, ${s.fullName}, ${s.courseCode ?? ''}, ${s.courseName}, ${s.courseId}, ${s.formattedPercentage}, ${s.presentCount}, ${s.absentCount}, ${s.earlyLeaveCount}`
      ),
    ];
    return new NextResponse(txtLines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="ETI_Relatorio_${nowBrt}.txt"`,
      },
    });
  }

  // Formato 3: CSV (UTF-8 com BOM para abrir direto no Microsoft Excel mantendo acentos)
  if (params.format === 'CSV') {
    const headers = [
      'Matrícula',
      'Nome Completo',
      'Curso Atual',
      'ID Interno Curso',
      'Código Curso',
      'Professor Responsável',
      'Turma',
      'Data da Aula',
      'Status Frequência',
      'Situação da Chamada',
      'Percentual Frequência',
      'Total Presenças',
      'Total Faltas',
      'Total Saídas',
      'Justificativa / Observação',
    ];
    const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvRows = [
      headers.map(escapeCsv).join(';'),
      ...detailedRows.map((r) =>
        [
          r.registration_number,
          r.student_name,
          r.course_name,
          r.course_internal_id,
          r.course_code,
          r.teacher_name,
          r.class_name,
          r.class_date,
          r.attendance_status_label,
          r.call_status,
          r.attendance_percentage,
          r.present_count,
          r.absent_count,
          r.early_leave_count,
          r.last_justification,
        ]
          .map(escapeCsv)
          .join(';')
      ),
    ];
    const bom = '\uFEFF';
    return new NextResponse(bom + csvRows.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ETI_Frequencias_${nowBrt}.csv"`,
      },
    });
  }

  // Formato 4 e 5: XLSX e PDF retornam payload estruturado para geração binária server-side
  return NextResponse.json({
    generatedAt: nowBrt,
    format: params.format,
    studentSummaries,
    detailedRows,
    auditLogs: auditLogs || [],
  });
}
