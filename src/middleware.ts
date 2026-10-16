// src/middleware.ts
// Executado na Edge Network da Vercel ANTES de renderizar qualquer página ou API
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, {
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

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // 1. Proteção de rotas autenticadas (/admin e /professor)
  if ((pathname.startsWith('/admin') || pathname.startsWith('/professor') || pathname.startsWith('/api/admin') || pathname.startsWith('/api/teacher')) && !user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Verificação estrita de perfil e status ativo no banco para rota exclusiva /admin
  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile || !profile.is_active || profile.role !== 'ADMIN') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Acesso negado: privilégios administrativos necessários.' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/professor/chamadas', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/professor/:path*', '/api/admin/:path*', '/api/teacher/:path*'],
};
