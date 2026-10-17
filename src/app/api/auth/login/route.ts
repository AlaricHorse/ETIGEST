// src/app/api/auth/login/route.ts
// Item 4.1 e 4.2: Login com usuário ou e-mail e senha (bloqueia contas desativadas e retorna rota de perfil)
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { verifyRequestOrigin } from '@/lib/auth/guard';

export async function POST(req: NextRequest) {
  if (!(await verifyRequestOrigin())) {
    return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
  }

  const { identifier, password } = (await req.json()) as {
    identifier: string; // pode ser username ou e-mail
    password: string;
  };

  if (!identifier?.trim() || !password) {
    return NextResponse.json({ error: 'Informe seu usuário/e-mail e senha.' }, { status: 400 });
  }

  const adminDb = createAdminSupabaseClient();
  const cleanId = identifier.trim().toLowerCase();

  // Resolver e-mail a partir de username ou email na tabela profiles
  const { data: profile } = await adminDb
    .from('profiles')
    .select('id, email, username, full_name, role, is_active')
    .or(`email.ilike.${cleanId},username.ilike.${cleanId}`)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
  }

  if (!profile.is_active) {
    return NextResponse.json(
      { error: 'Sua conta está bloqueada/desativada. Contate a direção da Escola Técnica Império.' },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options: any }>) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            });
          });
        },
      },
    }
  );

  const { data: authData, error: signInErr } = await supabaseAuth.auth.signInWithPassword({
    email: profile.email,
    password,
  });

  if (signInErr || !authData.user) {
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    role: profile.role,
    fullName: profile.full_name,
    redirectTo: profile.role === 'ADMIN' ? '/admin' : '/professor/chamadas',
  });
}
