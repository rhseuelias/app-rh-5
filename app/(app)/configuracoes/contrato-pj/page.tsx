import { createClient } from "@/lib/supabase-server";
import type { ConfigAssinaturasPJ } from "@/types/db";
import { salvarConfigAssinaturasPJ } from "@/lib/actions-contrato-pj";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function urlAssinatura(
  supabase: ReturnType<typeof createClient>,
  path: string | null
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("documentos").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export default async function ConfigContratoPJPage() {
  const supabase = createClient();

  const { data: config } = await supabase.from("config_assinaturas_pj").select("*").limit(1).maybeSingle();
  const c = (config ?? null) as ConfigAssinaturasPJ | null;

  const [urlSalao, urlTestemunha1, urlTestemunha2] = await Promise.all([
    urlAssinatura(supabase, c?.assinatura_salao_path ?? null),
    urlAssinatura(supabase, c?.assinatura_testemunha1_path ?? null),
    urlAssinatura(supabase, c?.assinatura_testemunha2_path ?? null),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Configurações — Assinaturas do contrato PJ</h1>
        <p className="text-slate-500 text-sm mt-1">
          Essas 3 assinaturas entram automaticamente em <strong>todo</strong> contrato PJ que você emitir — cole
          cada uma aqui só 1 vez. Só a assinatura do próprio profissional PJ é colada na ficha de cada
          colaborador (não aqui).
        </p>
      </div>

      <div className="card">
        <form action={salvarConfigAssinaturasPJ} className="space-y-6">
          <CampoAssinatura
            label="Assinatura do Salão Parceiro"
            name="assinatura_salao"
            urlAtual={urlSalao}
          />
          <CampoAssinatura
            label="Assinatura da Testemunha 1 (Monallysa)"
            name="assinatura_testemunha1"
            urlAtual={urlTestemunha1}
          />
          <CampoAssinatura
            label="Assinatura da Testemunha 2 (Ramon)"
            name="assinatura_testemunha2"
            urlAtual={urlTestemunha2}
          />
          <button type="submit" className="btn-primary">
            Salvar assinaturas
          </button>
        </form>
      </div>

      <Link href="/colaboradores" className="text-sm text-brand-600 hover:underline inline-block">
        ← Voltar para Colaboradores
      </Link>
    </div>
  );
}

function CampoAssinatura({
  label,
  name,
  urlAtual,
}: {
  label: string;
  name: string;
  urlAtual: string | null;
}) {
  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      {urlAtual ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlAtual} alt={label} className="h-14 border border-slate-200 rounded-lg bg-white px-2" />
          <span className="text-xs text-emerald-600">✓ já cadastrada — escolha um arquivo abaixo só se quiser trocar</span>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Ainda não cadastrada.</p>
      )}
      <input type="file" name={name} accept="image/*" className="input" />
    </div>
  );
}
