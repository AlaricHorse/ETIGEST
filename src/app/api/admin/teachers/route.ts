// src/app/api/admin/teachers/route.ts
// Item 4.2: Criar, editar, bloquear/reativar professores, definir credenciais e vincular às turmas
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/auth/guard';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const supabase = createAdminSupabaseClient();
  const [{ data: teachers }, { data: links }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, auth_user_id, username, email, full_name, role, is_active, created_at')
      .eq('role', 'TEACHER')
      .order('full_name'),
    supabase.from('teacher_classes').select('teacher_id, class_id, classes(id, code, name)'),
  ]);

  const classMap = new Map<string, any[]>();
  (links || []).forEach((l: any) => {
    const arr = classMap.get(l.teacher_id) || [];
    arr.push(l.classes);
    classMap.set(l.teacher_id, arr);
  });

  return NextResponse.json({
    teachers: (teachers || []).map((t) => ({
      ...t,
      assignedClasses: classMap.get(t.id) || [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { username, email, password, full_name, classIds } = (await req.json()) as {
    username: string;
    email: string;
    password: string;
    full_name: string;
    classIds?: string[];
  };

  if (!username?.trim() || !email?.trim() || !password || password.length < 8 || !full_name?.trim()) {
    return NextResponse.json(
      { error: 'Nome, usuário, e-mail e senha (mínimo 8 caracteres) são obrigatórios.' },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabaseClient();

  // 1. Criar usuário no Supabase Auth com senha hash segura (bcrypt/Argon2 interno)
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), role: 'TEACHER' },
  });

  if (authErr || !authUser.user) {
    return NextResponse.json(
      { error: authErr?.message || 'Erro ao criar credenciais de autenticação do professor.' },
      { status: 409 }
    );
  }

  // 2. Criar perfil na tabela profiles
  const { data: createdProfile, error: profErr } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUser.user.id,
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      full_name: full_name.trim(),
      role: 'TEACHER',
      is_active: true,
    })
    .select('id, username, email, full_name, role, is_active')
    .single();

  if (profErr || !createdProfile) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profErr?.message || 'Erro ao registrar perfil.' }, { status: 409 });
  }

  // 3. Vincular às turmas selecionadas
  if (Array.isArray(classIds) && classIds.length > 0) {
    await supabase.from('teacher_classes').insert(
      classIds.map((cid) => ({
        teacher_id: createdProfile.id,
        class_id: cid,
        assigned_by: auth.profileId,
      }))
    );
  }

  await supabase.from('audit_logs').insert({
    entity_type: 'TEACHER',
    entity_id: createdProfile.id,
    action: 'CREATE',
    previous_values: null,
    new_values: { ...createdProfile, classIds: classIds || [] },
    performed_by: auth.profileId,
    performed_by_role: 'ADMIN',
  });

  return NextResponse.json({ teacher: createdProfile });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.authorized) return auth.response!;

  const { id, full_name, is_active, newPassword, classIds } = (await req.json()) as {
    id: string;
    full_name?: string;
    is_active?: boolean;
    newPassword?: string;
    classIds?: string[];
  };

  if (!id) return NextResponse.json({ error: 'ID do professor é obrigatório.' }, { status: 400 });

  const supabase = createAdminSupabaseClient();
  const { data: existing } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Professor não encontrado.' }, { status: 404 });

  if (newPassword && newPassword.length >= 8 && existing.auth_user_id) {
    await supabase.auth.admin.updateUserById(existing.auth_user_id, { password: newPassword });
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      full_name: full_name?.trim() || existing.full_name,
      is_active: typeof is_active === 'boolean' ? is_active : existing.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, username, email, full_name, role, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Atualizar vínculos de turmas se enviado
  if (Array.isArray(classIds)) {
    await supabase.from('teacher_classes').delete().eq('teacher_id', id);
    if (classIds.length > 0) {
      await supabase.from('teacher_classes').insert(
        classIds.map((cid) => ({
          teacher_id: id,
          class_id: cid,
          assigned_by: auth.profileId,
        }))
      );
    }
  }

  await supabase.from('audit_logs').insert({
    entity_type: 'TEACHER',
    entity_id: id,
    action: 'UPDATE',
    previous_values: { full_name: existing.full_name, is_active: existing.is_active },
    new_values: { ...updated, classIds },
    performed_by: auth.profileId,
    performed_by_role: 'ADMIN',
  });

  return NextResponse.json({ teacher: updated });
}
