import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import type { ConfigCalendario } from "@/types/db";
import { atualizarConfigCalendario } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesCalendarioPage() {
  const supabase = createClient();
  const { data: config } = await supabase
    .from("config_calendario")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const configTyped = (config ?? {
    id: "default",
    whatsapp_numero_1: "",
    whatsapp_numero_2: "",
    relatorio_diario_ativo: false,
  }) as ConfigCalendario;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/calendario" className="text-xs text-brand-600 hover:underline">
          ← Voltar para o Calendário
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 mt-2">Configurações do Calendário</h1>
        <p className="text-slate-500 text-sm">
          Números de WhatsApp para o relatório diário das obrigações.
        </p>
      </div>

      <form action={atualizarConfigCalendario} className="card space-y-4">
        <div>
          <label className="label">WhatsApp 1</label>
          <input
            name="whatsapp_numero_1"
            defaultValue={configTyped.whatsapp_numero_1 ?? ""}
            placeholder="(11) 91234-5678"
            className="input"
          />
        </div>
        <div>
          <label className="label">WhatsApp 2 (opcional)</label>
          <input
            name="whatsapp_numero_2"
            defaultValue={configTyped.whatsapp_numero_2 ?? ""}
            placeholder="(11) 91234-5678"
            className="input"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="relatorio_diario_ativo"
            defaultChecked={configTyped.relatorio_diario_ativo}
            className="w-4 h-4"
          />
          Enviar relatório diário das obrigações por WhatsApp
        </label>

        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
          ⚠️ Os números ficam salvos aqui, mas o envio de verdade pelo WhatsApp ainda não está
          conectado a nenhum serviço — isso precisa de uma conta em um provedor de WhatsApp
          (ex.: WhatsApp Business API ou um serviço como o Twilio/Z-API), que é um passo à parte.
          Assim que você tiver essa conta, me avisa que eu conecto o envio de verdade.
        </p>

        <button type="submit" className="btn-primary">
          Salvar
        </button>
      </form>
    </div>
  );
}
