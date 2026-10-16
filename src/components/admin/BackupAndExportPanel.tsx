// src/components/admin/BackupAndExportPanel.tsx
// Etapa 8 e 9: Painel Completo de Exportação (JSON, TXT, CSV, XLSX, PDF), Restauração com Prévia e Monitoramento de Backups 00h00 BRT
'use client';

import React, { useState } from 'react';
import { downloadExcelReport, downloadPdfReport } from '@/lib/export/xlsx-pdf-generator';

export interface BackupExecutionRow {
  id: string;
  file_name: string;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  is_validated: boolean;
  is_expired_deleted: boolean;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export default function BackupAndExportPanel({
  executions,
  nextScheduledBrt = 'Diariamente às 00h00 (America/Fortaleza)',
}: {
  executions: BackupExecutionRow[];
  nextScheduledBrt?: string;
}) {
  const [selectedFormat, setSelectedFormat] = useState<'JSON' | 'TXT' | 'CSV' | 'XLSX' | 'PDF'>('JSON');
  const [exportType, setExportType] = useState<'COMPLETE' | 'CUSTOM'>('COMPLETE');
  const [loadingExport, setLoadingExport] = useState(false);

  // Estado de Restauração Segura (Item 9.3)
  const [restoreJsonObj, setRestoreJsonObj] = useState<any | null>(null);
  const [restorePreview, setRestorePreview] = useState<any | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<'KEEP_EXISTING' | 'OVERWRITE_WITH_BACKUP'>('KEEP_EXISTING');
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  const lastExecution = executions[0] || null;
  const hasRecentFailure = lastExecution?.status === 'FAILED';

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return '0 KB';
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const handleExport = async () => {
    setLoadingExport(true);
    try {
      const res = await fetch('/api/admin/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportType, format: selectedFormat, includeAuditLogs: true }),
      });
      if (!res.ok) throw new Error('Falha ao gerar exportação.');

      const dateTag = new Date().toISOString().slice(0, 10);

      if (selectedFormat === 'XLSX' || selectedFormat === 'PDF') {
        const payload = await res.json();
        if (selectedFormat === 'XLSX') {
          downloadExcelReport(
            `ETI_Relatorio_${dateTag}.xlsx`,
            payload.studentSummaries || [],
            payload.detailedRows || [],
            payload.auditLogs || []
          );
        } else {
          downloadPdfReport(
            `ETI_Relatorio_${dateTag}.pdf`,
            payload.studentSummaries || [],
            payload.detailedRows || []
          );
        }
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ETI_Exportacao_${dateTag}.${selectedFormat.toLowerCase()}`;
      a.click();
    } finally {
      setLoadingExport(false);
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        setRestoreJsonObj(parsed);
        const res = await fetch('/api/admin/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupPayload: parsed, mode: 'PREVIEW' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRestorePreview(data.preview);
      } catch (err: any) {
        setRestoreFeedback(`Erro ao validar arquivo: ${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmRestore = async () => {
    if (!restoreJsonObj) return;
    const res = await fetch('/api/admin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backupPayload: restoreJsonObj,
        mode: 'CONFIRM_RESTORE',
        conflictStrategy,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setRestoreFeedback('Restauração concluída e auditada com sucesso!');
      setRestorePreview(null);
    } else {
      setRestoreFeedback(data.error || 'Erro ao restaurar.');
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      {hasRecentFailure && (
        <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 text-red-900">
          <h3 className="font-bold text-base">
            ⚠️ Alerta Administrativo: Falha no último backup automático ({lastExecution.file_name})
          </h3>
          <p className="text-sm mt-1">
            Motivo: {lastExecution.error_message || 'Erro de comunicação.'} • Todos os backups válidos anteriores permanecem preservados.
          </p>
        </div>
      )}

      {/* Monitoramento do Backup Automático Diário às 00h00 BRT */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0A192F] text-white border-b-4 border-[#FF6B00]">
          <span className="text-xs uppercase text-[#FFB800] font-bold">Último Backup</span>
          <p className="text-sm font-bold mt-1 truncate">{lastExecution?.file_name || 'Aguardando 1ª execução'}</p>
          <p className="text-xs text-slate-300 mt-1">
            Tamanho: {formatBytes(lastExecution?.file_size_bytes ?? null)}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-xs uppercase text-slate-500 font-bold">Status & Validação</span>
          <p className="text-base font-bold mt-1 text-[#0A192F]">
            {lastExecution?.status === 'SUCCESS' && lastExecution.is_validated
              ? '✅ Validado (.json.gz)'
              : lastExecution?.status === 'FAILED'
              ? '❌ Falhou'
              : '⏳ Programado'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-xs uppercase text-slate-500 font-bold">Próxima Execução</span>
          <p className="text-sm font-bold mt-1 text-[#0A192F]">{nextScheduledBrt}</p>
          <p className="text-xs text-slate-500 mt-1">Vercel Cron (Servidor Autônomo)</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-xs uppercase text-slate-500 font-bold">Retenção Automática</span>
          <p className="text-base font-bold mt-1 text-[#FF6B00]">Últimos 30 backups</p>
          <p className="text-xs text-slate-500 mt-1">Bucket privado Supabase</p>
        </div>
      </div>

      {/* Exportação nos 5 Formatos */}
      <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0A192F]">Exportação de Dados (5 Formatos)</h2>
          <p className="text-sm text-slate-600">
            Exporte dados completos ou personalizados em JSON, TXT, CSV, Excel (.xlsx) e PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value as 'COMPLETE' | 'CUSTOM')}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-[#0A192F]"
          >
            <option value="COMPLETE">Exportação Completa</option>
            <option value="CUSTOM">Exportação Personalizada</option>
          </select>

          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-[#0A192F]"
          >
            <option value="JSON">JSON (.json)</option>
            <option value="TXT">TXT (.txt)</option>
            <option value="CSV">CSV (.csv)</option>
            <option value="XLSX">Excel (.xlsx)</option>
            <option value="PDF">PDF (.pdf)</option>
          </select>

          <button
            type="button"
            onClick={handleExport}
            disabled={loadingExport}
            className="px-5 py-2.5 rounded-xl font-bold bg-[#FF6B00] text-white hover:bg-[#e66000] shadow"
          >
            {loadingExport ? 'Gerando...' : `Baixar ${selectedFormat}`}
          </button>
        </div>
      </div>

      {/* Restauração Segura de JSON com Prévia (Item 9.3) */}
      <div className="p-5 rounded-xl border border-slate-200 space-y-4">
        <h3 className="text-base font-bold text-[#0A192F]">Restauração Segura de Dados (JSON)</h3>
        <input
          type="file"
          accept=".json"
          onChange={handleRestoreFileChange}
          className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:font-bold file:bg-[#0A192F] file:text-white"
        />
        {restoreFeedback && (
          <p className="text-sm font-bold text-[#FF6B00]">{restoreFeedback}</p>
        )}
        {restorePreview && (
          <div className="p-4 rounded-xl bg-amber-50 border border-[#FFB800] space-y-3 text-xs">
            <p className="font-bold text-sm text-[#0A192F]">
              Prévia da Restauração (Confirmação Obrigatória):
            </p>
            <p>
              Novos para adicionar: Cursos ({restorePreview.counts.toAdd.courses}), Alunos ({restorePreview.counts.toAdd.students}), Registros ({restorePreview.counts.toAdd.records}) • Conflitos para atualizar: Alunos ({restorePreview.counts.toUpdate.students}) • Rejeitados: {restorePreview.counts.rejected.length}
            </p>
            <div className="flex items-center gap-3">
              <select
                value={conflictStrategy}
                onChange={(e) => setConflictStrategy(e.target.value as any)}
                className="px-3 py-1.5 rounded border border-slate-300 font-bold"
              >
                <option value="KEEP_EXISTING">Preservar dados atuais em caso de conflito</option>
                <option value="OVERWRITE_WITH_BACKUP">Atualizar registros conflitantes pelo backup</option>
              </select>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold"
              >
                Confirmar Restauração
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico de Execuções de Backup Diário e Download Seguro */}
      <div>
        <h3 className="text-base font-bold text-[#0A192F] mb-2">
          Histórico de Execuções do Backup Diário (00h00 America/Fortaleza)
        </h3>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0A192F] text-white">
              <tr>
                <th className="p-3">Arquivo (.json.gz)</th>
                <th className="p-3">Data/Hora</th>
                <th className="p-3">Tamanho</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {executions.map((ex) => (
                <tr key={ex.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold">{ex.file_name}</td>
                  <td className="p-3">{new Date(ex.started_at).toLocaleString('pt-BR')}</td>
                  <td className="p-3">{formatBytes(ex.file_size_bytes)}</td>
                  <td className="p-3 font-bold">
                    {ex.status === 'SUCCESS' ? '✅ Validado' : ex.status === 'FAILED' ? `❌ ${ex.error_message}` : '⏳ Executando'}
                  </td>
                  <td className="p-3 text-right">
                    {ex.status === 'SUCCESS' && !ex.is_expired_deleted && (
                      <a
                        href={`/api/admin/backups?downloadId=${ex.id}`}
                        className="px-3 py-1 rounded bg-[#0A192F] text-white font-bold hover:bg-[#112240]"
                      >
                        Baixar .json.gz
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
