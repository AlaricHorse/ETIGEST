// src/lib/auth/guard.ts
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { headers, cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createAdminSupabaseClient } from '@/lib/supabase/server';

export interface AuthGuardResult {
  authorized: boolean;
  userId?: string;
  profileId?: string;
  role?: 'ADMIN' | 'TEACHER';
  fullName?: string;
  response?: NextResponse;
}

/**
 * Proteção Anti-CSRF e Validação de Origem para funções Serverless na Vercel (vercel.app)
 */
export async function verifyRequestOrigin(): Promise<boolean> {
  const hdrs = await headers();
  const origin = hdrs.get('origin');
  const host = hdrs.get('host');
  if (!origin) return true; // Requisições GET diretas de navegação
  try {
    const originHost = new URL(origin).host;
    return originHost === host || originHost.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export async function requireAuthenticatedSession(
  requiredRole?: 'ADMIN' | 'TEACHER'
): Promise<AuthGuardResult> {
  const validOrigin = await verifyRequestOrigin();
  if (!validOrigin) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'VIOLACAO_ORIGEM: Requisição cross-origin bloqueada.' },
        { status: 403 }
      ),
    };
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    (process.env.SUPABASE_URL || (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL))!,
    (process.env.SUPABASE_ANON_KEY || (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 }),
    };
  }

  const adminDb = createAdminSupabaseClient();
  const { data: profile, error: profileErr } = await adminDb
    .from('profiles')
    .select('id, role, full_name, is_active')
    .eq('auth_user_id', user.id)
    .single();

  if (profileErr || !profile || !profile.is_active) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Conta inativa ou perfil não localizado.' },
        { status: 403 }
      ),
    };
  }

  if (requiredRole && profile.role !== requiredRole) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Acesso negado para o seu perfil de usuário.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: user.id,
    profileId: profile.id,
    role: profile.role,
    fullName: profile.full_name,
  };
}

export async function requireAdminSession(): Promise<AuthGuardResult> {
  return requireAuthenticatedSession('ADMIN');
}
