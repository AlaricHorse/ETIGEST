// src/app/api/admin/students/import-txt/route.ts
// Etapa 5: Importação em massa por TXT com pré-visualização, validação e decisão explícita sobre conflitos
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export interface ParsedStudentRow {
  lineNumber: number;
  rawLine: string;
  registrationNumber: string;
  fullName: string;
  courseCode: number | null;
  courseId: string | null;
  courseName: string | null;
  status: 'VALID_NEW' | 'CONFLICT_EXISTING_DB' | 'ERROR_DUPLICATE_IN_FILE' | 'ERROR_INVALID_COURSE' | 'ERROR_FORMAT';
  message: string;
  existingStudent?: {
    id: string;
    full_name: string;
    course_id: string;
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  const { txtContent, mode, conflictDecisions } = body as {
    txtContent: string;
    mode: 'PREVIEW' | 'COMMIT';
    conflictDecisions?: Record<string, 'SKIP' | 'UPDATE'>; // Decisão explícita por matrícula
  };

  if (!txtContent || typeof txtContent !== 'string') {
    return NextResponse.json({ error: 'Conteúdo do arquivo TXT inválido ou vazio.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // 1. Carregar cursos ativos mapeando course_code -> UUID permanente
  const { data: courses } = await supabase
    .from('courses')
    .select('id, course_code, name, is_active');

  const courseByCode = new Map<number, { id: string; name: string; is_active: boolean }>();
  (courses || []).forEach((c) => courseByCode.set(c.course_code, c));

  // 2. Carregar matrículas existentes no banco
  const { data: existingStudents } = await supabase
    .from('students')
    .select('id, registration_number, full_name, course_id');

  const studentByReg = new Map<string, { id: string; full_name: string; course_id: string }>();
  (existingStudents || []).forEach((s) => studentByReg.set(s.registration_number.trim(), s));

  const lines = txtContent.replace(/\r\n/g, '\n').split('\n');
  const seenInFile = new Set<string>();
  const rows: ParsedStudentRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const parts = rawLine.split(',').map((p) => p.trim());

    // Detectar e ignorar cabeçalho na primeira linha
    if (i === 0 && parts[0] && !/^\d+$/.test(parts[0]) && parts[0].toUpperCase().includes('MATR')) {
      continue;
    }

    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      rows.push({
        lineNumber: i + 1,
        rawLine,
        registrationNumber: parts[0] || '',
        fullName: parts[1] || '',
        courseCode: null,
        courseId: null,
        courseName: null,
        status: 'ERROR_FORMAT',
        message: 'Linha deve conter exatamente 3 campos: MATRÍCULA, NOME DO ALUNO, CÓDIGO DO CURSO.',
      });
      continue;
    }

    const [reg, fullName, codeStr] = parts;
    const parsedCode = Number(codeStr);

    if (!Number.isInteger(parsedCode)) {
      rows.push({
        lineNumber: i + 1,
        rawLine,
        registrationNumber: reg,
        fullName,
        courseCode: null,
        courseId: null,
        courseName: null,
        status: 'ERROR_INVALID_COURSE',
        message: `Código do curso "${codeStr}" não é um número inteiro válido.`,
      });
      continue;
    }

    const targetCourse = courseByCode.get(parsedCode);
    if (!targetCourse || !targetCourse.is_active) {
      rows.push({
        lineNumber: i + 1,
        rawLine,
        registrationNumber: reg,
        fullName,
        courseCode: parsedCode,
        courseId: null,
        courseName: null,
        status: 'ERROR_INVALID_COURSE',
        message: `Código de curso ${parsedCode} inexistente ou inativo para novas matrículas.`,
      });
      continue;
    }

    if (seenInFile.has(reg)) {
      rows.push({
        lineNumber: i + 1,
        rawLine,
        registrationNumber: reg,
        fullName,
        courseCode: parsedCode,
        courseId: targetCourse.id,
        courseName: targetCourse.name,
        status: 'ERROR_DUPLICATE_IN_FILE',
        message: `Matrícula ${reg} repetida dentro do mesmo arquivo TXT.`,
      });
      continue;
    }
    seenInFile.add(reg);

    const existing = studentByReg.get(reg);
    if (existing) {
      rows.push({
        lineNumber: i + 1,
        rawLine,
        registrationNumber: reg,
        fullName,
        courseCode: parsedCode,
        courseId: targetCourse.id,
        courseName: targetCourse.name,
        status: 'CONFLICT_EXISTING_DB',
        message: `Matrícula ${reg} já cadastrada para "${existing.full_name}". Exige decisão explícita.`,
        existingStudent: existing,
      });
      continue;
    }

    rows.push({
      lineNumber: i + 1,
      rawLine,
      registrationNumber: reg,
      fullName,
      courseCode: parsedCode,
      courseId: targetCourse.id,
      courseName: targetCourse.name,
      status: 'VALID_NEW',
      message: 'Pronto para importar.',
    });
  }

  if (mode === 'PREVIEW') {
    return NextResponse.json({
      summary: {
        totalRead: rows.length,
        validNew: rows.filter((r) => r.status === 'VALID_NEW').length,
        conflicts: rows.filter((r) => r.status === 'CONFLICT_EXISTING_DB').length,
        errors: rows.filter((r) => r.status.startsWith('ERROR_')).length,
      },
      rows,
    });
  }

  // Modo COMMIT: Insere os válidos e processa conflitos somente com decisão explícita
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const toInsert = rows
    .filter((r) => r.status === 'VALID_NEW' && r.courseId)
    .map((r) => ({
      registration_number: r.registrationNumber,
      full_name: r.fullName,
      course_id: r.courseId!, // Vincula sempre pelo UUID permanente!
    }));

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('students').insert(toInsert);
    if (insertErr) {
      return NextResponse.json({ error: `Erro ao inserir alunos: ${insertErr.message}` }, { status: 500 });
    }
    insertedCount = toInsert.length;
  }

  for (const conflictRow of rows.filter((r) => r.status === 'CONFLICT_EXISTING_DB')) {
    const decision = conflictDecisions?.[conflictRow.registrationNumber] || 'SKIP';
    if (decision === 'UPDATE' && conflictRow.existingStudent && conflictRow.courseId) {
      await supabase
        .from('students')
        .update({
          full_name: conflictRow.fullName,
          course_id: conflictRow.courseId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conflictRow.existingStudent.id);
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  return NextResponse.json({
    committed: true,
    insertedCount,
    updatedCount,
    skippedCount,
    errorCount: rows.filter((r) => r.status.startsWith('ERROR_')).length,
  });
}
