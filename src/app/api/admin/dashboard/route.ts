// src/app/api/admin/dashboard/route.ts
// Etapa 7 (Item 8): Indicadores reais do painel administrativo, filtros de período,
// visão semanal/mensal e ranking de alunos com maior número de faltas
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';
import { calculateStudentAttendance, AttendanceStatusConfig } from '@/lib/reports/attendance-calculator';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const classId = searchParams.get('classId') || '';

  const supabase = createAdminSupabaseClient();

  let callsQuery = supabase.from('attendance_calls').select('*').order('class_date', { ascending: true });
  let recordsQuery = supabase.from('attendance_records').select('*').order('class_date', { ascending: true });

  if (startDate) {
    callsQuery = callsQuery.gte('class_date', startDate);
    recordsQuery = recordsQuery.gte('class_date', startDate);
  }
  if (endDate) {
    callsQuery = callsQuery.lte('class_date', endDate);
    recordsQuery = recordsQuery.lte('class_date', endDate);
  }
  if (classId) {
    callsQuery = callsQuery.eq('class_id', classId);
    recordsQuery = recordsQuery.eq('class_id', classId);
  }

  const [
    { data: students },
    { data: courses },
    { data: teachers },
    { data: statuses },
    { data: calls },
    { data: records },
  ] = await Promise.all([
    supabase.from('students').select('id, registration_number, full_name, course_id, class_id').eq('is_active', true),
    supabase.from('courses').select('id, course_code, name').eq('is_active', true),
    supabase.from('profiles').select('id').eq('role', 'TEACHER').eq('is_active', true),
    supabase.from('attendance_statuses').select('*'),
    callsQuery,
    recordsQuery,
  ]);

  const courseMap = new Map((courses || []).map((c: any) => [c.id, c.name]));
  const callMap = new Map((calls || []).map((ca: any) => [ca.id, ca]));
  const statusMap = new Map<string, AttendanceStatusConfig>(
    (statuses || []).map((st: any) => [st.code, st])
  );

  const enrichedRecords = (records || []).map((r: any) => ({
    ...r,
    call_status: callMap.get(r.call_id)?.status || 'SUBMITTED',
  }));

  const studentSummaries = (students || []).map((s: any) =>
    calculateStudentAttendance(
      {
        id: s.id,
        registration_number: s.registration_number,
        full_name: s.full_name,
        course_name: courseMap.get(s.course_id) || 'Curso ETI',
      },
      enrichedRecords,
      statusMap
    )
  );

  // Cálculo do percentual geral de frequência
  const totalPresentsAll = studentSummaries.reduce((acc, s) => acc + s.presentCount, 0);
  const totalClassesAll = studentSummaries.reduce((acc, s) => acc + s.totalAccountedClasses, 0);
  const overallFrequency =
    totalClassesAll > 0
      ? `${((totalPresentsAll / totalClassesAll) * 100).toFixed(1)}%`
      : 'Sem dados de frequência';

  const submittedCallsCount = (calls || []).filter((c: any) => c.status === 'SUBMITTED').length;
  const pendingCallsCount = (calls || []).filter((c: any) => c.status === 'DRAFT').length;

  const topAbsentees = [...studentSummaries]
    .filter((s) => s.absentCount > 0)
    .sort((a, b) => b.absentCount - a.absentCount)
    .slice(0, 10);

  return NextResponse.json({
    indicators: {
      totalStudents: (students || []).length,
      totalCourses: (courses || []).length,
      totalActiveTeachers: (teachers || []).length,
      submittedCallsCount,
      pendingCallsCount,
      overallFrequency,
    },
    topAbsentees,
    studentSummaries,
    calls: calls || [],
    records: enrichedRecords,
  });
}
