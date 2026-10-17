// src/app/api/auth/login/route.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { verifyRequestOrigin } from '@/lib/auth/guard';

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyRequestOrigin())) {
      return NextResponse.json({ error: 'Origem da requisição não autorizada.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { identifier, password } = body as { identifier?: string; password?: string };

    if (!identifier?.trim() || !password) {
      return NextResponse.json({ error: 'Informe seu usuário/e-mail e senha.' }, { status: 400 });
    }

    const adminDb = createAdminSupabaseClient();
    const cleanId = identifier.trim().toLowerCase();

    // Resolver e-mail a partir de username ou email na tabela profiles
    const { data: profile, error: profErr } = await adminDb
      .from('profiles')
      .select('id, email, username, full_name, role, is_active')
      .or(`email.ilike.${cleanId},username.ilike.${cleanId}`)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: `Erro no banco de dados: ${profErr.message}` }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: 'Credenciais inválidas ou usuário não cadastrado na tabela profiles do Supabase.' }, { status: 401 });
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
          setAll: (cookiesToSet: any) => {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: any }) => {
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
      return NextResponse.json({ error: `Senha incorreta ou falha no Supabase Auth: ${signInErr?.message || 'Usuário não autenticado'}` }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      role: profile.role,
      fullName: profile.full_name,
      redirectTo: profile.role === 'ADMIN' ? '/admin' : '/professor/chamadas',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Erro interno no servidor: ${err?.message || 'Erro desconhecido'}` },
      { status: 500 }
    );
  }
}
