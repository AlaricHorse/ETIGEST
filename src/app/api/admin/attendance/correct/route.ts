// src/app/api/admin/attendance/correct/route.ts
// Etapa 6 (Item 7.3): Correção administrativa ilimitada com justificativa obrigatória e histórico
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { recordId, newStatusCode, justification } = (await req.json()) as {
    recordId: string;
    newStatusCode: string;
    justification: string;
  };

  if (!recordId || !newStatusCode || !justification || justification.trim().length < 5) {
    return NextResponse.json(
      {
        error:
          'JUSTIFICATIVA_OBRIGATORIA: Informe o ID do registro, o novo status e uma justificativa válida (mínimo 5 caracteres).',
      },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: updated, error } = await supabase
    .from('attendance_records')
    .update({
      status_code: newStatusCode,
      recorded_by: auth.profileId,
      last_justification: justification.trim(),
    })
    .eq('id', recordId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    message: 'Frequência retificada pela administração e registrada no histórico de auditoria.',
    record: updated,
  });
}
