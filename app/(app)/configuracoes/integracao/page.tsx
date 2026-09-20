import { createClient } from "@/lib/supabase-server";
import type { ConfigIntegracao, EtapaConfig } from "@/types/db";
import { atualizarEtapaConfig, criarEtapaConfig, atualizarConfigGeral } from "@/lib/actions-integracao";

export const dynamic = "force-dynamic";

export default async function ConfiguracaoIntegracaoPage() {
  const supabase = createClient();

  const [{ data: etapas }, { data: config }] = await Promise.all([
    supabase.from("etapas_config").select("*").order("ordem", { ascending: true }),
    supabase.from("config_integracao").select("*").eq("id", "default").maybeSingle(),
  ]);

  const listaEtapas = (etapas ?? []) as EtapaConfig[];
  const configTyped = (config ?? {
    id: "default",
    prazo_integracao_dias: 5,
    prazo_experiencia_dias: 90,
    antecedencia_alerta_avaliacao_dias: 15,
    prazo_saida_painel_dias: 7,
  }) as ConfigIntegracao;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Configurações — Processo de Integração</h1>
        <p className="text-slate-500 text-sm mt-1">
          Alterações aqui valem para os processos criados a partir de agora — quem já está em andamento
          continua com a configuração de quando começou.
        </p>
      </div>

      <div className="card">
        <h2 className="font-display font-semibold text-slate-900 mb-3">Prazos gerais</h2>
        <form action={atualizarConfigGeral} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Prazo padrão: exame admissional → onboarding (dias)</label>
            <input type="number" name="prazo_integracao_dias" className="input" defaultValue={configTyped.prazo_integracao_dias} min={1} />
          </div>
          <div>
            <label className="label">Duração do período de experiência (dias)</label>
            <input type="number" name="prazo_experiencia_dias" className="input" defaultValue={configTyped.prazo_experiencia_dias} min={1} />
          </div>
          <div>
            <label className="label">Antecedência do alerta de avaliação (dias)</label>
            <input type="number" name="antecedencia_alerta_avaliacao_dias" className="input" defaultValue={configTyped.antecedencia_alerta_avaliacao_dias} min={1} />
          </div>
          <div>
            <label className="label">Efetivado(a)/Não efetivado(a) some do painel após (dias)</label>
            <input type="number" name="prazo_saida_painel_dias" className="input" defaultValue={configTyped.prazo_saida_painel_dias ?? 7} min={1} />
          </div>
          <div className="md:col-span-4">
            <button type="submit" className="btn-primary">Salvar prazos</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="font-display font-semibold text-slate-900 mb-3">Etapas do processo</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[64px_1fr_140px_110px_70px_70px] gap-3 text-left text-xs text-slate-500 border-b border-slate-200 pb-2 mb-1">
              <span>Ordem</span>
              <span>Nome</span>
              <span>Responsável</span>
              <span>Prazo (dias)</span>
              <span>Ativa</span>
              <span></span>
            </div>
            {listaEtapas.map((etapa) => (
              <form
                key={etapa.id}
                action={atualizarEtapaConfig}
                className="grid grid-cols-[64px_1fr_140px_110px_70px_70px] gap-3 items-center border-b border-slate-100 py-2"
              >
                <input type="hidden" name="id" value={etapa.id} />
                <input type="number" name="ordem" defaultValue={etapa.ordem} className="input !py-1" />
                <input type="text" name="nome" defaultValue={etapa.nome} className="input !py-1" />
                <select name="responsavel" defaultValue={etapa.responsavel} className="input !py-1">
                  <option value="RH">RH</option>
                  <option value="LIDER">Líder</option>
                  <option value="FUNCIONARIO">Funcionário</option>
                  <option value="SISTEMA">Sistema</option>
                </select>
                <input type="number" name="prazo_dias" defaultValue={etapa.prazo_dias ?? ""} className="input !py-1" placeholder="—" />
                <input type="checkbox" name="ativa" defaultChecked={etapa.ativa} className="justify-self-center w-4 h-4" />
                <button type="submit" className="text-xs text-brand-600 hover:underline justify-self-start">
                  Salvar
                </button>
              </form>
            ))}
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Adicionar etapa personalizada</summary>
          <form action={criarEtapaConfig} className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <input type="text" name="nome" required placeholder="Nome da etapa" className="input" />
            <select name="responsavel" defaultValue="RH" className="input">
              <option value="RH">RH</option>
              <option value="LIDER">Líder</option>
              <option value="FUNCIONARIO">Funcionário</option>
            </select>
            <input type="number" name="prazo_dias" placeholder="Prazo (dias, opcional)" className="input" />
            <button type="submit" className="btn-secondary">Adicionar</button>
          </form>
        </details>

        <p className="text-xs text-slate-400 mt-4">
          Nesta primeira versão a ordem das etapas segue sempre a sequência numérica (1, 2, 3…) — arrastar e
          soltar, cores personalizadas por etapa e permissões detalhadas por perfil ficam para uma próxima
          versão.
        </p>
      </div>
    </div>
  );
}
