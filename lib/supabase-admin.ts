import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role key — ignora Row Level Security.
 *
 * USO RESTRITO: só deve ser chamado a partir de server actions/rotas
 * que atendem o fluxo público de pré-cadastro (candidato sem login).
 * O acesso é protegido pelo token secreto do link, não por RLS.
 * NUNCA importe este arquivo em um componente client — a service
 * role key não tem o prefixo NEXT_PUBLIC_ e não pode vazar pro browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada — veja o README (seção Pré-cadastro de candidato)."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
