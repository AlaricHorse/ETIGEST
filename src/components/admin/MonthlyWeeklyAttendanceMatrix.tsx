// src/components/admin/MonthlyWeeklyAttendanceMatrix.tsx
// Item 8.3: Visão Mensal (Alunos nas linhas x Datas nas colunas) e Visão Semanal navegável
// diferenciando dias sem aula de chamadas pendentes
'use client';

import React, { useState, useMemo } from 'react';

export default function MonthlyWeeklyAttendanceMatrix({
  students,
  calls,
  records,
}: {
  students: any[];
  calls: any[];
  records: any[];
}) {
  const [viewMode, setViewMode] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');

  // Extrair todas as datas registradas ordenadas
  const dates = useMemo(() => {
    const set = new Set<string>();
    (calls || []).forEach((c) => set.add(c.class_date));
    return Array.from(set).sort();
  }, [calls]);

  const callStatusByDate = useMemo(() => {
    const map = new Map<string, string>();
    (calls || []).forEach((c) => map.set(c.class_date, c.status));
    return map;
  }, [calls]);

  const recordByStudentAndDate = useMemo(() => {
    const map = new Map<string, string>();
    (records || []).forEach((r) => {
      map.set(`${r.student_id}_${r.class_date}`, r.status_code);
    });
    return map;
  }, [records]);

  const visibleDates = viewMode === 'WEEKLY' ? dates.slice(-7) : dates;

  const renderBadge = (studentId: string, dateStr: string) => {
    const callSt = callStatusByDate.get(dateStr);
    if (callSt === 'NO_CLASS' || callSt === 'CANCELLED') {
      return (
        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold">
          Sem Aula
        </span>
      );
    }
    if (callSt === 'DRAFT') {
      return (
        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
          Pendente
        </span>
      );
    }
    const code = recordByStudentAndDate.get(`${studentId}_${dateStr}`);
    if (code === 'PRESENT') {
      return <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">P</span>;
    }
    if (code === 'ABSENT') {
      return <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">F</span>;
    }
    if (code === 'EARLY_LEAVE') {
      return <span className="px-2 py-0.5 rounded bg-[#FF6B00] text-white text-[10px] font-bold">S</span>;
    }
    return <span className="text-slate-400 text-xs">-</span>;
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[#0A192F]">
            Matriz de Frequência ({viewMode === 'MONTHLY' ? 'Visão Mensal' : 'Visão Semanal'})
          </h3>
          <p className="text-xs text-slate-500">
            Alunos nas linhas × Datas das aulas nas colunas (P = Presença, F = Falta, S = Saída, Pendente = Rascunho, Sem Aula)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode('WEEKLY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              viewMode === 'WEEKLY'
                ? 'bg-[#0A192F] text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Visão Semanal
          </button>
          <button
            type="button"
            onClick={() => setViewMode('MONTHLY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              viewMode === 'MONTHLY'
                ? 'bg-[#0A192F] text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Visão Mensal
          </button>
        </div>
      </div>

      {visibleDates.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-xl">
          Sem dados de frequência para o período selecionado.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A192F] text-white">
              <tr>
                <th className="p-3 sticky left-0 bg-[#0A192F]">Matrícula</th>
                <th className="p-3 sticky left-20 bg-[#0A192F]">Aluno</th>
                {visibleDates.map((d) => (
                  <th key={d} className="p-2 text-center font-mono">
                    {d.slice(5)}
                  </th>
                ))}
                <th className="p-3 text-right">Frequência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {students.map((s) => (
                <tr key={s.studentId} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold">{s.registrationNumber}</td>
                  <td className="p-3 font-semibold text-[#0A192F]">{s.fullName}</td>
                  {visibleDates.map((d) => (
                    <td key={d} className="p-2 text-center">
                      {renderBadge(s.studentId, d)}
                    </td>
                  ))}
                  <td className="p-3 text-right font-extrabold text-[#0A192F]">
                    {s.formattedPercentage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
