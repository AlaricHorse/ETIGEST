// src/lib/export/xlsx-pdf-generator.ts
// Utilitário para geração e download de arquivos Excel (.xlsx) e Relatórios para Impressão (.pdf)
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function downloadExcelReport(
  fileName: string,
  studentSummaries: any[],
  detailedRows: any[],
  auditLogs: any[]
) {
  const wb = XLSX.utils.book_new();

  // Aba 1: Resumo Consolidado por Aluno
  const summarySheetData = studentSummaries.map((s) => ({
    Matrícula: s.registrationNumber,
    'Nome Completo': s.fullName,
    'Curso Atual': s.courseName,
    'Código do Curso': s.courseCode ?? '',
    'ID Permanente do Curso': s.courseId ?? '',
    Turma: s.className ?? '',
    'Frequência (%)': s.formattedPercentage,
    Presenças: s.presentCount,
    Faltas: s.absentCount,
    Saídas: s.earlyLeaveCount,
    'Total de Aulas Contabilizadas': s.totalAccountedClasses,
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Frequencia');

  // Aba 2: Registros Diários de Chamada
  const detailedSheetData = detailedRows.map((r) => ({
    Matrícula: r.registration_number,
    Aluno: r.student_name,
    Curso: r.course_name,
    'Código Curso': r.course_code,
    'ID Interno Curso': r.course_internal_id,
    Turma: r.class_name,
    Professor: r.teacher_name,
    'Data da Aula': r.class_date,
    Status: r.attendance_status_label,
    'Situação Chamada': r.call_status,
    'Frequência Acumulada': r.attendance_percentage,
    Justificativa: r.last_justification,
  }));
  const wsDetailed = XLSX.utils.json_to_sheet(detailedSheetData);
  XLSX.utils.book_append_sheet(wb, wsDetailed, 'Historico por Aula');

  // Aba 3: Auditoria Administrativa
  if (auditLogs && auditLogs.length > 0) {
    const auditSheetData = auditLogs.map((a) => ({
      Data: a.performed_at,
      Entidade: a.entity_type,
      Ação: a.action,
      Perfil: a.performed_by_role,
      Justificativa: a.justification || '',
      'Valores Anteriores': JSON.stringify(a.previous_values || {}),
      'Novos Valores': JSON.stringify(a.new_values || {}),
    }));
    const wsAudit = XLSX.utils.json_to_sheet(auditSheetData);
    XLSX.utils.book_append_sheet(wb, wsAudit, 'Auditoria');
  }

  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

export function downloadPdfReport(
  fileName: string,
  studentSummaries: any[],
  detailedRows: any[]
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Cabeçalho Institucional ETI
  doc.setFillColor(10, 25, 47); // #0A192F Azul-marinho ETI
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 184, 0); // #FFB800 Amarelo ETI
  doc.setFontSize(10);
  doc.text('ESCOLA TÉCNICA IMPÉRIO (ETI)', 14, 9);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text('ETI Gestão Escolar - Relatório Oficial de Frequência e Alunos', 14, 18);

  // Tabela Resumo de Frequência
  autoTable(doc, {
    startY: 30,
    head: [[
      'Matrícula',
      'Nome Completo',
      'Curso Atual',
      'Cód.',
      'Turma',
      'Presenças',
      'Faltas',
      'Saídas',
      'Frequência (%)',
    ]],
    body: studentSummaries.map((s) => [
      s.registrationNumber,
      s.fullName,
      s.courseName,
      String(s.courseCode ?? ''),
      s.className ?? '',
      String(s.presentCount),
      String(s.absentCount),
      String(s.earlyLeaveCount),
      s.formattedPercentage,
    ]),
    headStyles: { fillColor: [10, 25, 47], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 8 },
  });

  if (detailedRows.length > 0) {
    doc.addPage();
    doc.setFillColor(10, 25, 47);
    doc.rect(0, 0, 297, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text('Detalhamento Diário de Chamadas e Frequências', 14, 12);

    autoTable(doc, {
      startY: 24,
      head: [[
        'Data',
        'Matrícula',
        'Aluno',
        'Curso',
        'Turma',
        'Professor',
        'Status',
        'Justificativa',
      ]],
      body: detailedRows.map((r) => [
        r.class_date,
        r.registration_number,
        r.student_name,
        r.course_name,
        r.class_name,
        r.teacher_name,
        r.attendance_status_label,
        r.last_justification || '-',
      ]),
      headStyles: { fillColor: [255, 107, 0], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
    });
  }

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
