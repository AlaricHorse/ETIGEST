// src/lib/supabase/server.ts
import 'server-only'; // Garante erro de compilação imediato se importado no navegador!
import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Administrativo exclusivo para Server Actions e Route Handlers na Vercel.
 * Nunca expõe a SUPABASE_SERVICE_ROLE_KEY ao cliente.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('CONFIG_ERROR: Variáveis do Supabase ausentes no ambiente do servidor Vercel.');
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
