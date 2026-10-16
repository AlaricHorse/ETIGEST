// src/components/attendance/TeacherCallScreen.tsx
// Interface Mobile-First para realização rápida de chamadas (Identidade Visual Escola Técnica Império)
// Cores ETI: Azul-marinho (#0A192F), Branco (#FFFFFF), Laranja (#FF6B00) e Amarelo (#FFB800)
'use client';

import React, { useState, useMemo } from 'react';

interface StudentCallRow {
  id: string;
  registration_number: string;
  full_name: string;
  record: { id: string; status_code: string; teacher_correction_count: number } | null;
  canTeacherEdit: boolean;
}

export default function TeacherCallScreen({
  classNameTitle,
  classId,
  classDate,
  initialCallStatus,
  initialStudents,
}: {
  classNameTitle: string;
  classId: string;
  classDate: string;
  initialCallStatus: 'DRAFT' | 'SUBMITTED' | null;
  initialStudents: StudentCallRow[];
}) {
  const [callStatus, setCallStatus] = useState<'DRAFT' | 'SUBMITTED' | null>(initialCallStatus);
  const [students, setStudents] = useState<StudentCallRow[]>(initialStudents);
  const [marks, setMarks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    initialStudents.forEach((s) => {
      if (s.record?.status_code) initial[s.id] = s.record.status_code;
    });
    return initial;
  });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const unmarkedCount = useMemo(
    () => students.filter((s) => !marks[s.id]).length,
    [students, marks]
  );

  const handleSelectStatus = (studentId: string, statusCode: string) => {
    setMarks((prev) => ({ ...prev, [studentId]: statusCode }));
  };

  const handleSubmitCall = async (action: 'SAVE_DRAFT' | 'SUBMIT_CALL') => {
    if (action === 'SUBMIT_CALL' && unmarkedCount > 0) {
      setFeedback({
        type: 'warning',
        text: `Atenção: Ainda há ${unmarkedCount} aluno(s) sem marcação destacados em amarelo.`,
      });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const entries = students
        .filter((s) => marks[s.id])
        .map((s) => ({ studentId: s.id, statusCode: marks[s.id] }));

      const res = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, classDate, action, entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao processar chamada.');

      if (action === 'SUBMIT_CALL') setCallStatus('SUBMITTED');
      else setCallStatus('DRAFT');

      setFeedback({ type: 'success', text: data.message });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 pb-28">
      {/* Cabeçalho Institucional Azul-Marinho ETI */}
      <header className="bg-[#0A192F] text-white px-4 py-4 shadow-md sticky top-0 z-20 border-b-4 border-[#FF6B00]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-xs uppercase tracking-wider text-[#FFB800] font-bold">
              ETI Gestão Escolar • Controle de Frequência
            </span>
            <h1 className="text-lg sm:text-xl font-bold">{classNameTitle}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="bg-[#112240] px-3 py-1.5 rounded-lg border border-slate-700 font-medium">
              Data: {classDate}
            </span>
            {unmarkedCount > 0 ? (
              <span className="bg-[#FFB800] text-[#0A192F] px-3 py-1.5 rounded-lg font-bold">
                Pendentes: {unmarkedCount}
              </span>
            ) : (
              <span className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold">
                100% Marcado
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-3">
        {feedback && (
          <div
            className={`p-4 rounded-xl font-medium border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                : feedback.type === 'warning'
                ? 'bg-amber-50 border-[#FFB800] text-amber-900'
                : 'bg-red-50 border-red-400 text-red-900'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Lista de Alunos otimizada para toque rápido no celular */}
        {students.map((student) => {
          const selected = marks[student.id];
          const isUnmarked = !selected;
          const lockedAfterCorrection =
            callStatus === 'SUBMITTED' && (student.record?.teacher_correction_count ?? 0) >= 1;

          return (
            <div
              key={student.id}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                isUnmarked
                  ? 'border-[#FFB800] bg-amber-50/40'
                  : 'border-slate-200 bg-white shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#0A192F] text-white">
                    #{student.registration_number}
                  </span>
                  {isUnmarked && (
                    <span className="text-xs font-bold text-[#FF6B00]">
                      • Sem marcação
                    </span>
                  )}
                  {lockedAfterCorrection && (
                    <span className="text-xs font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                      Correção única já utilizada
                    </span>
                  )}
                </div>
                <p className="font-bold text-base text-[#0A192F] mt-1">{student.full_name}</p>
              </div>

              {/* Botões grandes de toque rápido (Presença, Falta, Saída) */}
              <div className="grid grid-cols-3 gap-2 sm:w-80">
                <button
                  type="button"
                  disabled={lockedAfterCorrection || loading}
                  onClick={() => handleSelectStatus(student.id, 'PRESENT')}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm transition ${
                    selected === 'PRESENT'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  Presença
                </button>
                <button
                  type="button"
                  disabled={lockedAfterCorrection || loading}
                  onClick={() => handleSelectStatus(student.id, 'ABSENT')}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm transition ${
                    selected === 'ABSENT'
                      ? 'bg-red-600 text-white shadow'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  Falta
                </button>
                <button
                  type="button"
                  disabled={lockedAfterCorrection || loading}
                  onClick={() => handleSelectStatus(student.id, 'EARLY_LEAVE')}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm transition ${
                    selected === 'EARLY_LEAVE'
                      ? 'bg-[#FF6B00] text-white shadow'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  } disabled:opacity-50`}
                >
                  Saída
                </button>
              </div>
            </div>
          );
        })}
      </main>

      {/* Barra inferior fixa para envio rápido no celular */}
      {callStatus !== 'SUBMITTED' && (
        <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 shadow-lg z-20">
          <div className="max-w-4xl mx-auto flex gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmitCall('SAVE_DRAFT')}
              className="flex-1 py-3 px-4 rounded-xl font-bold border-2 border-[#0A192F] text-[#0A192F] hover:bg-slate-100"
            >
              Salvar Rascunho
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmitCall('SUBMIT_CALL')}
              className="flex-1 py-3 px-4 rounded-xl font-bold bg-[#FF6B00] text-white hover:bg-[#e66000] shadow-md"
            >
              {loading ? 'Enviando...' : 'Enviar Chamada'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
