// src/components/admin/StudentImportModal.tsx
// Item 6: Interface de Importação em Massa por TXT com Pré-visualização e Decisão Explícita sobre Conflitos
'use client';

import React, { useState } from 'react';

export default function StudentImportPanel({ onImportCompleted }: { onImportCompleted: () => void }) {
  const [txtContent, setTxtContent] = useState('');
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<Record<string, 'SKIP' | 'UPDATE'>>({});
  const [commitResult, setCommitResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setTxtContent(String(ev.target?.result || ''));
      setPreviewData(null);
      setCommitResult(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handlePreview = async () => {
    setLoading(true);
    setCommitResult(null);
    try {
      const res = await fetch('/api/admin/students/import-txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txtContent, mode: 'PREVIEW' }),
      });
      const data = await res.json();
      setPreviewData(data);
      const initialDecisions: Record<string, 'SKIP' | 'UPDATE'> = {};
      (data.rows || []).forEach((r: any) => {
        if (r.status === 'CONFLICT_EXISTING_DB') {
          initialDecisions[r.registrationNumber] = 'SKIP';
        }
      });
      setConflictDecisions(initialDecisions);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/students/import-txt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txtContent,
          mode: 'COMMIT',
          conflictDecisions,
        }),
      });
      const data = await res.json();
      setCommitResult(data);
      onImportCompleted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-[#0A192F]">Importação em Massa de Alunos (.txt)</h2>
        <p className="text-sm text-slate-600 mt-1">
          Formato esperado: <code className="bg-slate-100 px-2 py-0.5 rounded font-mono">MATRÍCULA, NOME DO ALUNO, CÓDIGO DO CURSO</code> (Ex: <code className="bg-slate-100 px-2 py-0.5 rounded font-mono">1001, JOÃO DA SILVA, 1</code>)
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <input
          type="file"
          accept=".txt"
          onChange={handleFileUpload}
          className="text-sm file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-[#0A192F] file:text-white hover:file:bg-[#112240]"
        />
        <button
          type="button"
          disabled={!txtContent.trim() || loading}
          onClick={handlePreview}
          className="px-5 py-2.5 rounded-xl font-bold bg-[#FF6B00] text-white hover:bg-[#e66000] disabled:opacity-50"
        >
          {loading ? 'Analisando...' : 'Gerar Prévia de Importação'}
        </button>
      </div>

      <textarea
        rows={5}
        value={txtContent}
        onChange={(e) => setTxtContent(e.target.value)}
        placeholder={'1001, JOÃO DA SILVA, 1\n1002, MARIA OLIVEIRA, 2\n1003, PEDRO SANTOS, 1\n1004, ANA SOUZA, 3'}
        className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs"
      />

      {previewData?.summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-100">
              <span className="text-xs text-slate-600 font-bold">Total Lido</span>
              <p className="text-xl font-extrabold text-[#0A192F]">{previewData.summary.totalRead}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-xs text-emerald-700 font-bold">Novos Válidos</span>
              <p className="text-xl font-extrabold text-emerald-800">{previewData.summary.validNew}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-[#FFB800]">
              <span className="text-xs text-amber-800 font-bold">Conflitos de Matrícula</span>
              <p className="text-xl font-extrabold text-amber-900">{previewData.summary.conflicts}</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <span className="text-xs text-red-700 font-bold">Erros Bloqueados</span>
              <p className="text-xl font-extrabold text-red-800">{previewData.summary.errors}</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0A192F] text-white uppercase">
                <tr>
                  <th className="p-3">Linha</th>
                  <th className="p-3">Matrícula</th>
                  <th className="p-3">Nome do Aluno</th>
                  <th className="p-3">Curso Identificado</th>
                  <th className="p-3">Diagnóstico / Decisão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(previewData.rows || []).map((r: any) => (
                  <tr key={r.lineNumber} className="hover:bg-slate-50">
                    <td className="p-3 font-bold">{r.lineNumber}</td>
                    <td className="p-3 font-mono">{r.registrationNumber || '-'}</td>
                    <td className="p-3 font-semibold">{r.fullName || '-'}</td>
                    <td className="p-3">{r.courseName ? `${r.courseCode} - ${r.courseName}` : '-'}</td>
                    <td className="p-3">
                      {r.status === 'CONFLICT_EXISTING_DB' ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <span className="text-amber-800 font-bold">{r.message}</span>
                          <select
                            value={conflictDecisions[r.registrationNumber] || 'SKIP'}
                            onChange={(e) =>
                              setConflictDecisions((prev) => ({
                                ...prev,
                                [r.registrationNumber]: e.target.value as 'SKIP' | 'UPDATE',
                              }))
                            }
                            className="px-2 py-1 rounded border border-amber-500 bg-white font-bold text-[#0A192F]"
                          >
                            <option value="SKIP">Manter cadastro atual (Ignorar)</option>
                            <option value="UPDATE">Atualizar com dados do TXT</option>
                          </select>
                        </div>
                      ) : (
                        <span
                          className={`font-bold ${
                            r.status === 'VALID_NEW' ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {r.message}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading}
              onClick={handleCommit}
              className="px-6 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow"
            >
              Confirmar e Salvar Importação no Banco
            </button>
          </div>
        </div>
      )}

      {commitResult && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-400 text-emerald-950 font-semibold text-sm">
          Importação concluída! Inseridos: {commitResult.insertedCount} • Atualizados por decisão explícita:{' '}
          {commitResult.updatedCount} • Ignorados: {commitResult.skippedCount} • Com erro (não importados):{' '}
          {commitResult.errorCount}.
        </div>
      )}
    </div>
  );
}
