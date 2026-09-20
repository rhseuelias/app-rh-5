import type { ConfigSimulacao, DiaSemana } from "@/types/db";
import { MODELOS_DIVISAO, ESTRATEGIAS_SIMULACAO } from "@/lib/simulacao-ferias";
import { atualizarConfigCenario } from "@/lib/actions";

const DIAS_UTEIS: { chave: DiaSemana; label: string }[] = [
  { chave: "segunda", label: "Seg" },
  { chave: "terca", label: "Ter" },
  { chave: "quarta", label: "Qua" },
  { chave: "quinta", label: "Qui" },
  { chave: "sexta", label: "Sex" },
];

/** "CONFIGURAÇÃO DA SIMULAÇÃO" — modelo de fracionamento, regras de data, capacidade da equipe e estratégia. Formulário simples (sem JS extra), igual ao resto do app. */
export default function ConfigSimulacaoForm({ cenarioId, config }: { cenarioId: string; config: ConfigSimulacao }) {
  const somenteSegQui =
    config.diasPreferenciais.length === 4 &&
    ["segunda", "terca", "quarta", "quinta"].every((d) => config.diasPreferenciais.includes(d as DiaSemana));

  return (
    <form action={atualizarConfigCenario} className="space-y-4">
      <input type="hidden" name="cenario_id" value={cenarioId} />

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Modelo de divisão das férias</p>
        <select name="modelo" defaultValue={config.modelo} className="input !w-auto !text-xs">
          {MODELOS_DIVISAO.map((m) => (
            <option key={m.valor} value={m.valor}>{m.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-slate-400">Se "Personalizado" — dias de cada período:</span>
          <input type="number" name="p1" min={0} max={30} defaultValue={config.modelo === "personalizado" ? config.periodosPersonalizados[0] ?? "" : ""} placeholder="1º" className="input !w-14 !text-xs !py-1" />
          <input type="number" name="p2" min={0} max={30} defaultValue={config.modelo === "personalizado" ? config.periodosPersonalizados[1] ?? "" : ""} placeholder="2º" className="input !w-14 !text-xs !py-1" />
          <input type="number" name="p3" min={0} max={30} defaultValue={config.modelo === "personalizado" ? config.periodosPersonalizados[2] ?? "" : ""} placeholder="3º" className="input !w-14 !text-xs !py-1" />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Regra legal: até 3 períodos, pelo menos 1 com 14 dias ou mais, os demais com 5 dias ou mais.</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Dias preferenciais para início das férias</p>
        <div className="flex items-center gap-3 flex-wrap">
          {DIAS_UTEIS.map((d) => (
            <label key={d.chave} className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" name="dias_preferenciais" value={d.chave} defaultChecked={config.diasPreferenciais.includes(d.chave)} />
              {d.label}
            </label>
          ))}
          <label className="flex items-center gap-1 text-xs text-slate-600 ml-2 pl-2 border-l border-slate-200">
            <input type="checkbox" name="somente_seg_qui" defaultChecked={somenteSegQui} />
            Somente segunda a quinta-feira (regra padrão)
          </label>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Sexta e sábado já são bloqueados por lei (CLT art. 134 §3º) — isso aqui restringe ainda mais, se quiser.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className="text-xs text-slate-600">
          Intervalo mínimo entre períodos (meses)
          <input type="number" name="intervalo_min" min={1} max={11} defaultValue={config.intervaloMinMeses} className="input !text-xs mt-1" />
        </label>
        <label className="text-xs text-slate-600">
          Intervalo máximo entre períodos (meses)
          <input type="number" name="intervalo_max" min={1} max={11} defaultValue={config.intervaloMaxMeses} className="input !text-xs mt-1" />
        </label>
        <label className="text-xs text-slate-600">
          Máx. simultâneo por unidade
          <input type="number" name="capacidade_unidade" min={1} defaultValue={config.capacidadeMaxUnidade ?? ""} placeholder="sem limite" className="input !text-xs mt-1" />
        </label>
        <label className="text-xs text-slate-600">
          Máx. simultâneo por departamento
          <input type="number" name="capacidade_departamento" min={1} defaultValue={config.capacidadeMaxDepartamento ?? ""} placeholder="sem limite" className="input !text-xs mt-1" />
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Estratégia de priorização</p>
        <select name="estrategia" defaultValue={config.estrategia} className="input !w-auto !text-xs">
          {ESTRATEGIAS_SIMULACAO.map((e) => (
            <option key={e.valor} value={e.valor}>{e.label}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <label className="text-[11px] text-slate-500">
            Peso: data-limite (%)
            <input type="number" name="peso_data_limite" min={0} max={100} defaultValue={config.pesos.dataLimite} className="input !text-xs mt-1" />
          </label>
          <label className="text-[11px] text-slate-500">
            Peso: cobertura (%)
            <input type="number" name="peso_cobertura" min={0} max={100} defaultValue={config.pesos.cobertura} className="input !text-xs mt-1" />
          </label>
          <label className="text-[11px] text-slate-500">
            Peso: distribuição (%)
            <input type="number" name="peso_distribuicao" min={0} max={100} defaultValue={config.pesos.distribuicao} className="input !text-xs mt-1" />
          </label>
          <label className="text-[11px] text-slate-500">
            Peso: preferências (%)
            <input type="number" name="peso_preferencias" min={0} max={100} defaultValue={config.pesos.preferencias} className="input !text-xs mt-1" />
          </label>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">Os pesos só valem quando a estratégia é "Personalizada".</p>
      </div>

      <button type="submit" className="btn-secondary !text-xs">💾 Salvar configuração</button>
    </form>
  );
}
