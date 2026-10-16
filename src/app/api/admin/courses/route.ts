// src/app/api/admin/courses/route.ts
// Etapa 4 (Item 5.1): Gerenciar cursos e códigos preservando o UUID interno permanente
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('courses')
    .select('id, course_code, name, is_active, created_at, updated_at')
    .order('course_code', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courses: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { course_code, name } = (await req.json()) as {
    course_code: number;
    name: string;
  };

  if (typeof course_code !== 'number' || !name?.trim()) {
    return NextResponse.json(
      { error: 'Informe um código numérico válido e o nome do curso.' },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data: created, error } = await supabase
    .from('courses')
    .insert({
      course_code,
      name: name.trim().toUpperCase(),
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Já existe um curso utilizando este código numérico.' },
      { status: 409 }
    );
  }

  await supabase.from('audit_logs').insert({
    entity_type: 'COURSE',
    entity_id: created.id,
    action: 'CREATE',
    previous_values: null,
    new_values: created,
    performed_by: auth.profileId,
    performed_by_role: 'ADMIN',
  });

  return NextResponse.json({ course: created });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { id, course_code, name, is_active } = body;

  if (!id || typeof course_code !== 'number' || !name?.trim()) {
    return NextResponse.json(
      { error: 'ID permanente, código numérico e nome são obrigatórios.' },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  const { data: oldCourse } = await supabase.from('courses').select('*').eq('id', id).single();
  if (!oldCourse) {
    return NextResponse.json({ error: 'Curso não encontrado.' }, { status: 404 });
  }

  // Atualiza apenas código numérico, nome ou status ativo; o UUID (id) jamais muda!
  const { data: updated, error } = await supabase
    .from('courses')
    .update({
      course_code,
      name: name.trim().toUpperCase(),
      is_active: Boolean(is_active),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Conflito de código numérico ou erro ao atualizar curso.' },
      { status: 409 }
    );
  }

  await supabase.from('audit_logs').insert({
    entity_type: 'COURSE',
    entity_id: id,
    action: 'UPDATE',
    previous_values: oldCourse,
    new_values: updated,
    performed_by: auth.profileId,
    performed_by_role: 'ADMIN',
  });

  return NextResponse.json({ course: updated });
}
