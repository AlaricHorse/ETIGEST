// src/app/professor/chamadas/page.tsx
// Portal do Professor: Lista apenas as turmas vinculadas pela escola e carrega o módulo rápido de chamadas
'use client';

import React, { useEffect, useState } from 'react';
import TeacherCallScreen from '@/components/attendance/TeacherCallScreen';

export default function ProfessorChamadasPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classDate, setClassDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [callData, setCallData] = useState<{
    callStatus: 'DRAFT' | 'SUBMITTED' | null;
    students: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/teacher/classes')
      .then((r) => r.json())
      .then((d) => {
        const list = d.classes || [];
        setClasses(list);
        if (list.length > 0) setSelectedClassId(list[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedClassId || !classDate) return;
    setLoading(true);
    fetch(`/api/teacher/attendance?classId=${selectedClassId}&classDate=${classDate}`)
      .then((r) => r.json())
      .then((d) => {
        setCallData({
          callStatus: d.call?.status || null,
          students: d.students || [],
        });
      })
      .finally(() => setLoading(false));
  }, [selectedClassId, classDate]);

  const currentClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0A192F] text-white px-4 py-3 border-b border-slate-800">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded bg-[#FFB800] text-[#0A192F] font-extrabold text-xs">
              PORTAL DO PROFESSOR
            </span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-[#112240] text-white border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-semibold"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.courses?.name})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
              className="bg-[#112240] text-white border border-slate-600 rounded-lg px-3 py-1.5 text-sm font-semibold"
            />
            <button
              type="button"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 font-bold"
            >
              Sair
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="max-w-4xl mx-auto p-8 text-center font-semibold text-slate-600">
          Carregando turma e lista de chamada...
        </div>
      ) : classes.length === 0 ? (
        <div className="max-w-xl mx-auto mt-12 p-6 bg-white rounded-2xl border border-slate-200 text-center">
          <h2 className="text-lg font-bold text-[#0A192F]">Nenhuma turma vinculada</h2>
          <p className="text-sm text-slate-600 mt-1">
            Sua conta ainda não possui turmas vinculadas pela coordenação da Escola Técnica Império.
          </p>
        </div>
      ) : (
        callData && (
          <TeacherCallScreen
            key={`${selectedClassId}-${classDate}`}
            classNameTitle={currentClass?.name || 'Turma ETI'}
            classId={selectedClassId}
            classDate={classDate}
            initialCallStatus={callData.callStatus}
            initialStudents={callData.students}
          />
        )
      )}
    </div>
  );
}
