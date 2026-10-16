// src/app/api/admin/classes/route.ts
// Gerenciamento de Turmas vinculadas ao ID permanente do curso
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('classes')
    .select('*, courses(id, course_code, name)')
    .order('code', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ classes: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { course_id, code, name, shift } = (await req.json()) as {
    course_id: string;
    code: string;
    name: string;
    shift?: string;
  };

  if (!course_id || !code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'Curso, código da turma e nome são obrigatórios.' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('classes')
    .insert({
      course_id,
      code: code.trim().toUpperCase(),
      name: name.trim().toUpperCase(),
      shift: shift || 'Noite',
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ classItem: data });
}
