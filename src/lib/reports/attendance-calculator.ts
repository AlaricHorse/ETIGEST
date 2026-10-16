// src/lib/reports/attendance-calculator.ts
// Etapa 7: Motor de Cálculo de Frequência, Visão Semanal/Mensal e Histórico Individual (Item 8)
export interface AttendanceStatusConfig {
  code: string;
  label: string;
  counts_as_present: boolean;
  counts_in_total_classes: boolean;
}

export interface RawAttendanceRecord {
  id: string;
  student_id: string;
  registration_number: string;
  student_name: string;
  course_id: string;
  course_name: string;
  class_id: string;
  class_date: string; // YYYY-MM-DD
  call_status: 'DRAFT' | 'SUBMITTED' | 'CANCELLED' | 'NO_CLASS';
  status_code: string;
  updated_at: string;
}

export interface StudentAttendanceSummary {
  studentId: string;
  registrationNumber: string;
  fullName: string;
  courseName: string;
  presentCount: number;
  absentCount: number;
  earlyLeaveCount: number;
  otherStatusCount: number;
  totalAccountedClasses: number;
  attendancePercentage: number | null;
  formattedPercentage: string; // "Sem dados de frequência" quando não houver aulas válidas
  lastUpdated: string | null;
}

/**
 * Regra 8.1:
 * Frequência (%) = presenças contabilizadas ÷ total de aulas contabilizadas × 100
 * Chamadas em rascunho (DRAFT), datas sem aula (NO_CLASS) e aulas canceladas (CANCELLED)
 * NUNCA são consideradas faltas nem entram no total de aulas contabilizadas.
 */
export function calculateStudentAttendance(
  student: { id: string; registration_number: string; full_name: string; course_name: string },
  records: RawAttendanceRecord[],
  statusMap: Map<string, AttendanceStatusConfig>
): StudentAttendanceSummary {
  let presentCount = 0;
  let absentCount = 0;
  let earlyLeaveCount = 0;
  let otherStatusCount = 0;
  let totalAccountedClasses = 0;
  let lastUpdated: string | null = null;

  for (const rec of records) {
    if (rec.student_id !== student.id) continue;
    // Ignorar rascunhos, dias sem aula e aulas canceladas
    if (rec.call_status !== 'SUBMITTED') continue;

    const cfg = statusMap.get(rec.status_code);
    if (!cfg) continue;

    if (cfg.counts_in_total_classes) {
      totalAccountedClasses++;
      if (cfg.counts_as_present) {
        presentCount++;
      }
    }

    if (rec.status_code === 'ABSENT') absentCount++;
    else if (rec.status_code === 'EARLY_LEAVE') earlyLeaveCount++;
    else if (rec.status_code !== 'PRESENT') otherStatusCount++;

    if (!lastUpdated || rec.updated_at > lastUpdated) {
      lastUpdated = rec.updated_at;
    }
  }

  if (totalAccountedClasses === 0) {
    return {
      studentId: student.id,
      registrationNumber: student.registration_number,
      fullName: student.full_name,
      courseName: student.course_name,
      presentCount: 0,
      absentCount: 0,
      earlyLeaveCount: 0,
      otherStatusCount: 0,
      totalAccountedClasses: 0,
      attendancePercentage: null,
      formattedPercentage: 'Sem dados de frequência',
      lastUpdated,
    };
  }

  const pct = Number(((presentCount / totalAccountedClasses) * 100).toFixed(2));
  return {
    studentId: student.id,
    registrationNumber: student.registration_number,
    fullName: student.full_name,
    courseName: student.course_name,
    presentCount,
    absentCount,
    earlyLeaveCount,
    otherStatusCount,
    totalAccountedClasses,
    attendancePercentage: pct,
    formattedPercentage: `${pct.toFixed(1)}%`,
    lastUpdated,
  };
}
