// src/app/api/auth/logout/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    (process.env.SUPABASE_URL || (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL))!,
    (process.env.SUPABASE_ANON_KEY || (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: any }>) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  await supabaseAuth.auth.signOut();
  return NextResponse.json({ loggedOut: true });
}
