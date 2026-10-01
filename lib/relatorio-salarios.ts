import type { Colaborador } from "@/types/db";
import { custoDetalhado, custoMensalColaborador } from "@/lib/calculos";

/** Tudo que vem além do salário base: comissão, auxílios e benefícios. */
export function adicionaisDe(c: Colaborador) {
  const comissaoAux = (c.comissao_media ?? 0) + (c.auxilio_outros ?? 0);
  const beneficios =
    (c.custo_vt ?? 0) + (c.custo_va_vr ?? 0) + (c.custo_assist_medica ?? 0) + (c.custo_assist_psicologica ?? 0);
  return { comissaoAux, beneficios, total: comissaoAux + beneficios };
}

/** Soma os números de um grupo de colaboradores CLT (uma empresa ou unidade). */
export function totalizar(lista: Colaborador[]) {
  let salarios = 0;
  let adicionais = 0;
  let remuneracao = 0;
  let tributos = 0;
  let passivo = 0;
  let custo = 0;
  for (const c of lista) {
    const ad = adicionaisDe(c);
    const d = custoDetalhado(c);
    salarios += c.salario_base ?? 0;
    adicionais += ad.total;
    remuneracao += d.remuneracao;
    tributos += d.tributos;
    passivo += d.passivoTrabalhista;
    custo += custoMensalColaborador(c);
  }
  const inss = remuneracao * 0.2;
  const fgts = remuneracao * 0.08;
  return { salarios, adicionais, folha: salarios + adicionais, inss, fgts, tributos, passivo, custo };
}

export const SEM_UNIDADE = "sem";

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
