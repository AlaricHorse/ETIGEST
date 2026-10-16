// src/app/api/admin/backups/route.ts
// Item 10.5 e 10.6: Painel de monitoramento de backups e download seguro de arquivo .json.gz por Admin
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { searchParams } = new URL(req.url);
  const downloadId = searchParams.get('downloadId');

  const supabase = createAdminSupabaseClient();

  if (downloadId) {
    const { data: execRow } = await supabase
      .from('backup_executions')
      .select('file_name, storage_path, status')
      .eq('id', downloadId)
      .single();

    if (!execRow || execRow.status !== 'SUCCESS') {
      return NextResponse.json({ error: 'Arquivo de backup não encontrado ou inválido.' }, { status: 404 });
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from('eti-backups')
      .download(execRow.storage_path);

    if (dlErr || !fileBlob) {
      return NextResponse.json({ error: 'Erro ao ler arquivo do armazenamento privado.' }, { status: 500 });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${execRow.file_name}"`,
      },
    });
  }

  const { data: executions, error } = await supabase
    .from('backup_executions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ executions: executions || [] });
}
