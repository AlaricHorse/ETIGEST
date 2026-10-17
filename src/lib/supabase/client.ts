// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClientSupabase() {
  return createBrowserClient(
    (process.env.SUPABASE_URL || (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL))!,
    (process.env.SUPABASE_ANON_KEY || (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))!
  );
}
