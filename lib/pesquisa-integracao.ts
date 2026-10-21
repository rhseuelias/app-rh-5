// Regras da Pesquisa de Integração (perguntas, opções e leitura do resultado).
// Arquivo sem "use server": pode ser usado tanto no servidor quanto na tela.

export const ESC = "Preciso de esclarecimentos";
const SN = ["Sim", "Não"];
const RN = ["Recebi", "Não recebi"];
const C3 = ["Estou ciente", "Não estou ciente", ESC];
const C2 = ["Estou ciente", "Não estou ciente"];

export interface PerguntaPesquisa {
  q: string;
  /** A 1ª opção é a resposta "em ordem" (exceto na pergunta de nota). */
  o: string[];
  nota?: boolean;
}

export const PERGUNTAS_PESQUISA: PerguntaPesquisa[] = [
  { q: "Participou do Onboarding?", o: SN },
  { q: "Recebeu o kit de onboarding?", o: RN },
  { q: "Recebeu o Manual de Conduta?", o: RN },
  { q: "Recebeu a descrição do seu cargo?", o: RN },
  { q: "Está ciente sobre nossa MISSÃO, VALORES e REGRAS?", o: C3 },
  { q: "Está ciente de quem será seu supervisor?", o: C3 },
  { q: "Está ciente da nossa Política de Pagamento?", o: C3 },
  { q: "Está ciente do nosso Programa de Benefícios?", o: C3 },
  { q: "Ficou claro sobre sua Jornada de Trabalho?", o: C3 },
  { q: "Ficou ciente do uso e funcionamento do Ponto Digital?", o: C3 },
  { q: "Recebeu o seu contrato de trabalho?", o: RN },
  { q: "Foi indicado o Anjo (guia), que irá acompanhá-lo(a) diariamente?", o: C2 },
  {
    q: "Que nota daria para a apresentação, com relação à clareza?",
    o: ["Nada claro", "Não compreendi algumas informações", "Ficou muito claro"],
    nota: true,
  },
];

export const TOTAL_PERGUNTAS = PERGUNTAS_PESQUISA.length;

/** Código do link: 12 letras minúsculas e números (sem l e o), sorteado no servidor. */
export const ALFABETO_TOKEN = "abcdefghijkmnpqrstuvwxyz23456789";
export const TOKEN_PESQUISA_OK = /^[abcdefghijkmnpqrstuvwxyz23456789]{12}$/;

/** Quantas horas o link da pesquisa vale. Depois disso o RH gera um novo. */
export const HORAS_VALIDADE_PESQUISA = 24;

export type TipoResposta = "ok" | "esc" | "nao";

export function tipoResposta(i: number, valor: string | null): TipoResposta {
  const p = PERGUNTAS_PESQUISA[i];
  if (!p || valor === null) return "nao";
  if (p.nota) return valor === p.o[2] ? "ok" : valor === p.o[1] ? "esc" : "nao";
  if (valor === p.o[0]) return "ok";
  return valor === ESC ? "esc" : "nao";
}

export interface ResumoPesquisa {
  emOrdem: number;
  naoCiente: number;
  esclarecimentos: number;
  clareza: string | null;
  /** Posições (0 a 12) que o RH precisa conversar com o colaborador. */
  conversar: number[];
}

export function resumirPesquisa(respostas: (string | null)[]): ResumoPesquisa {
  let emOrdem = 0;
  let naoCiente = 0;
  let esclarecimentos = 0;
  const conversar: number[] = [];
  PERGUNTAS_PESQUISA.forEach((p, i) => {
    const t = tipoResposta(i, respostas[i] ?? null);
    if (t !== "ok") conversar.push(i);
    if (p.nota) return;
    if (t === "ok") emOrdem++;
    else if (t === "esc") esclarecimentos++;
    else naoCiente++;
  });
  return { emOrdem, naoCiente, esclarecimentos, clareza: respostas[TOTAL_PERGUNTAS - 1] ?? null, conversar };
}

/** Confere se a resposta enviada é uma das opções permitidas. */
export function respostaValida(i: number, valor: unknown): valor is string {
  const p = PERGUNTAS_PESQUISA[i];
  return !!p && typeof valor === "string" && p.o.includes(valor);
}
