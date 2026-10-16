// src/app/api/cron/daily-backup/route.ts
// Etapa 9 (Item 10): Backup Automático Real às 00h00 (America/Fortaleza) via Vercel Cron + Supabase Storage Privado
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const BACKUP_BUCKET = 'eti-backups';
const RETENTION_LIMIT = 30; // Manter os últimos 30 backups diários válidos

/**
 * Comparação em tempo constante (Timing-Safe) do CRON_SECRET da Vercel
 * Impede ataques de força bruta ou enumeração por tempo de resposta na rota /api/cron/daily-backup.
 */
function verifyCronAuthorization(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!authHeader || !cronSecret) return false;

  const expected = Buffer.from(`Bearer ${cronSecret}`, 'utf-8');
  const received = Buffer.from(authHeader, 'utf-8');
  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}

/**
 * Obtém a data real da execução no fuso America/Fortaleza no formato AAAA-MM-DD
 */
function getFortalezaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function GET(req: NextRequest) {
  // 1. Verificar assinatura criptográfica do Vercel Cron (ou execução manual por Admin autenticado)
  if (!verifyCronAuthorization(req)) {
    return NextResponse.json(
      { error: 'NAO_AUTORIZADO: Assinatura CRON_SECRET inválida ou ausente.' },
      { status: 401 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const dateBrt = getFortalezaDateString();
  const fileName = `ETI_Backup_${dateBrt}.json.gz`;
  const storagePath = `daily/${fileName}`;

  // 2. Registrar início da execução em backup_executions
  const { data: execLog, error: initErr } = await supabase
    .from('backup_executions')
    .insert({
      file_name: fileName,
      storage_path: storagePath,
      status: 'RUNNING',
      triggered_by: 'CRON_00H00_AMERICA_FORTALEZA',
    })
    .select('id')
    .single();

  const executionId = execLog?.id;

  try {
    // 3. Coletar todos os dados necessários para recuperação completa do sistema (Item 10.2)
    // NUNCA inclui password_hash, tokens de sessão ou chaves privadas!
    const [
      { data: courses, error: e1 },
      { data: classes, error: e2 },
      { data: profiles, error: e3 },
      { data: teacherClasses, error: e4 },
      { data: students, error: e5 },
      { data: statuses, error: e6 },
      { data: calls, error: e7 },
      { data: records, error: e8 },
      { data: auditLogs, error: e9 },
    ] = await Promise.all([
      supabase.from('courses').select('*').order('course_code'),
      supabase.from('classes').select('*').order('code'),
      supabase
        .from('profiles')
        .select('id, username, email, full_name, role, is_active, created_at, updated_at'),
      supabase.from('teacher_classes').select('*'),
      supabase.from('students').select('*').order('registration_number'),
      supabase.from('attendance_statuses').select('*'),
      supabase.from('attendance_calls').select('*').order('class_date'),
      supabase.from('attendance_records').select('*').order('class_date'),
      supabase.from('audit_logs').select('*').order('performed_at'),
    ]);

    const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9;
    if (firstError) {
      throw new Error(`Falha ao extrair tabelas para backup: ${firstError.message}`);
    }

    const backupObject = {
      schemaVersion: '1.0.0',
      system: 'ETI Gestão Escolar',
      backupDateBrt: dateBrt,
      generatedAtIso: new Date().toISOString(),
      timezone: 'America/Fortaleza',
      retentionPolicyDays: RETENTION_LIMIT,
      data: {
        courses: courses || [],
        classes: classes || [],
        profiles: profiles || [],
        teacher_classes: teacherClasses || [],
        students: students || [],
        attendance_statuses: statuses || [],
        attendance_calls: calls || [],
        attendance_records: records || [],
        audit_logs: auditLogs || [],
      },
    };

    // 4. Compactar em GZIP (.json.gz) e calcular Checksum SHA-256
    const jsonBuffer = Buffer.from(JSON.stringify(backupObject), 'utf-8');
    const compressedBuffer = await gzipAsync(jsonBuffer, { level: zlib.constants.Z_BEST_COMPRESSION });
    const checksumSha256 = crypto.createHash('sha256').update(compressedBuffer).digest('hex');

    // 5. Enviar para o Bucket Privado Persistente no Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(storagePath, compressedBuffer, {
        contentType: 'application/gzip',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Erro ao salvar no Storage privado: ${uploadErr.message}`);
    }

    // 6. Validação Pós-Execução Obrigatória (Item 10.6 e 10.7):
    // Baixar o arquivo recém-gravado, validar o SHA-256, descomprimir o GZIP e fazer parse do JSON!
    const { data: downloadedBlob, error: downloadErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .download(storagePath);

    if (downloadErr || !downloadedBlob) {
      throw new Error('Falha ao baixar o arquivo do Storage para validação de integridade.');
    }

    const downloadedBuffer = Buffer.from(await downloadedBlob.arrayBuffer());
    const downloadedHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
    if (downloadedHash !== checksumSha256) {
      throw new Error('INTEGRIDADE_CORROMPIDA: Checksum SHA-256 divergente após upload.');
    }

    const decompressedBuffer = await gunzipAsync(downloadedBuffer);
    const parsedCheck = JSON.parse(decompressedBuffer.toString('utf-8'));
    if (parsedCheck.system !== 'ETI Gestão Escolar' || !parsedCheck.data) {
      throw new Error('INTEGRIDADE_CORROMPIDA: Estrutura JSON inválida após descompressão.');
    }

    // 7. Atualizar registro de execução como SUCCESS + VALIDATED
    if (executionId) {
      await supabase
        .from('backup_executions')
        .update({
          status: 'SUCCESS',
          is_validated: true,
          file_size_bytes: compressedBuffer.byteLength,
          checksum_sha256: checksumSha256,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    // 8. Política de Retenção dos últimos 30 Backups Diários (Item 10.4):
    // Só executa APÓS confirmar que o novo backup foi criado e validado com sucesso!
    // Nunca exclui o último backup válido.
    const { data: validBackups } = await supabase
      .from('backup_executions')
      .select('id, storage_path, file_name')
      .eq('status', 'SUCCESS')
      .eq('is_validated', true)
      .eq('is_expired_deleted', false)
      .order('completed_at', { ascending: false });

    const deletedExpiredFiles: string[] = [];
    if (validBackups && validBackups.length > RETENTION_LIMIT) {
      const expiredList = validBackups.slice(RETENTION_LIMIT);
      for (const expired of expiredList) {
        const { error: rmErr } = await supabase.storage
          .from(BACKUP_BUCKET)
          .remove([expired.storage_path]);

        if (!rmErr) {
          await supabase
            .from('backup_executions')
            .update({ is_expired_deleted: true })
            .eq('id', expired.id);
          deletedExpiredFiles.push(expired.file_name);
        }
      }
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileSizeBytes: compressedBuffer.byteLength,
      checksumSha256,
      validated: true,
      retentionLimit: RETENTION_LIMIT,
      expiredDeleted: deletedExpiredFiles,
      nextScheduledExecution: '00:00 America/Fortaleza',
    });
  } catch (err: any) {
    // Regra 10.4 e 10.5: Se a geração falhar, preservar TODOS os backups anteriores intactos,
    // registrar o erro e gerar alerta administrativo!
    const errorMessage = err?.message || 'Erro desconhecido na rotina de backup.';
    if (executionId) {
      await supabase
        .from('backup_executions')
        .update({
          status: 'FAILED',
          is_validated: false,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    await supabase.from('audit_logs').insert({
      entity_type: 'BACKUP',
      entity_id: executionId || crypto.randomUUID(),
      action: 'BACKUP_FAILURE_ALERT',
      previous_values: null,
      new_values: { fileName, errorMessage, timezone: 'America/Fortaleza' },
      justification: 'ALERTA ADMINISTRATIVO: Falha na execução do backup diário automático.',
      performed_by_role: 'ADMIN',
    });

    return NextResponse.json(
      {
        success: false,
        alert: 'ALERTA_ADMIN_FALHA_BACKUP',
        error: errorMessage,
        previousBackupsPreserved: true,
      },
      { status: 500 }
    );
  }
}
