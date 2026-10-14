import type { CargoDesc } from "@/lib/cargos";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface PerguntaRoteiro {
  id: string;
  texto: string;
  comps: string[];
  bom: string;
  alerta: string;
  /** Pergunta criada a partir da descrição do cargo. */
  doCargo?: boolean;
  /** "citadas": marcar as responsabilidades do cargo que o candidato citou. "matriz": domínio de cada responsabilidade. */
  extra?: "citadas" | "matriz";
}

export interface BlocoRoteiro {
  id: string;
  titulo: string;
  objetivo?: string;
  perguntas: PerguntaRoteiro[];
  /** Cenários práticos do cargo, no fim do bloco. */
  cenarios?: { titulo: string; sinais: string[] }[];
  /** Lista do que o supervisor deve apresentar ao candidato. */
  apresentacao?: { itens: string[]; indicadores: string[] };
}

export interface Roteiro {
  etapa: string;
  abertura: string;
  encerramento: string;
  requisitos: { id: string; texto: string }[];
  responsabilidades: string[];
  blocos: BlocoRoteiro[];
  /** Competências do cargo (vazio quando o cargo não está cadastrado). */
  competenciasCargo: string[];
  cargoEncontrado: boolean;
  /** Pergunta opcional sobre crenças (não pontua). */
  perguntaOpcional?: string;
}

export interface RespRoteiro {
  notas: Record<string, number>;
  txt: Record<string, string>;
  req: Record<string, 0 | 1>;
  cit: Record<string, boolean>;
  mx: Record<string, 0 | 1 | 2>;
  cen: Record<string, boolean[]>;
  aps: Record<string, boolean>;
  /** Registro do RH ou parecer do supervisor. */
  parecer?: string;
}

export const RESP_VAZIA: RespRoteiro = { notas: {}, txt: {}, req: {}, cit: {}, mx: {}, cen: {}, aps: {} };

export function normalizarResp(r: unknown): RespRoteiro {
  const o = (r && typeof r === "object" ? r : {}) as Partial<RespRoteiro>;
  return {
    notas: o.notas ?? {},
    txt: o.txt ?? {},
    req: o.req ?? {},
    cit: o.cit ?? {},
    mx: o.mx ?? {},
    cen: o.cen ?? {},
    aps: o.aps ?? {},
    parecer: o.parecer ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* Perguntas por competência (usadas para montar as perguntas do cargo) */
/* ------------------------------------------------------------------ */

const PERG_COMP: Record<string, { texto: string; bom: string; alerta: string }> = {
  responsabilidade: {
    texto: "Conte uma situação em que você foi o responsável por algo importante no trabalho. O que você fez?",
    bom: "Assume a responsabilidade, descreve ações e resultado",
    alerta: "Culpa outras pessoas, não lembra de nenhuma situação",
  },
  atencao: {
    texto: "Como você confere se fez um trabalho sem erros? Me dê um exemplo.",
    bom: "Tem um método de conferência e cita um caso real",
    alerta: "Diz que nunca erra ou que não confere",
  },
  prudencia: {
    texto: "Conte uma situação em que você precisou agir com cuidado para evitar um problema.",
    bom: "Percebe o risco antes, age com calma",
    alerta: "Age no impulso, minimiza riscos",
  },
  cordialidade: {
    texto: "Como você recebe uma pessoa que chega irritada ou com pressa?",
    bom: "Mantém a calma, cumprimenta, resolve com educação",
    alerta: "Responde no mesmo tom, evita a pessoa",
  },
  agilidade: {
    texto: "Conte uma situação em que precisou trabalhar rápido sem perder a qualidade.",
    bom: "Prioriza, mantém o padrão mesmo com pressa",
    alerta: "Aceita errar para ganhar tempo",
  },
  organizacao: {
    texto: "Como você organiza suas tarefas e o seu espaço nos horários de maior movimento?",
    bom: "Tem rotina e critérios claros",
    alerta: "Faz tudo ao mesmo tempo, sem ordem",
  },
  comunicacao: {
    texto: "Como você avisa o seu líder quando acontece um problema?",
    bom: "Avisa na hora, de forma clara e objetiva",
    alerta: "Espera o problema crescer ou esconde",
  },
  "controle emocional": {
    texto: "Conte uma situação de pressão ou conflito no trabalho. Como você reagiu?",
    bom: "Mantém a calma e busca solução",
    alerta: "Perde a paciência, discute, culpa os outros",
  },
  "orientacao para o cliente": {
    texto: "O que você faz para que o cliente saia satisfeito?",
    bom: "Cita atitudes concretas de cuidado e atenção",
    alerta: "Foca só na tarefa, não se importa com o cliente",
  },
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function perguntaDaCompetencia(comp: string): { texto: string; bom: string; alerta: string } {
  const achada = PERG_COMP[semAcento(comp)];
  if (achada) return achada;
  return {
    texto: `Conte uma situação no trabalho em que você mostrou ${comp.toLowerCase()}. O que aconteceu?`,
    bom: "Dá um exemplo real, com ação e resultado",
    alerta: "Resposta genérica, sem exemplo",
  };
}

/* ------------------------------------------------------------------ */
/* Montagem do roteiro                                                 */
/* ------------------------------------------------------------------ */

const ABERTURA_RH =
  "Olá, tudo bem? Seja bem-vindo(a)! Antes de começarmos, quero te deixar tranquilo(a). Nossa conversa será bem leve, sem aquela pressão de uma entrevista tradicional. Minha intenção é conhecer um pouco da sua história, saber quem é você, seus objetivos e suas experiências. Depois, vou te explicar um pouco sobre a oportunidade e fazer algumas perguntas relacionadas à vaga. Fique à vontade para conversar comigo, combinado?";
const ENCERRAMENTO_RH =
  "Gostei de conhecer um pouco mais sobre você. Agora vamos concluir essa primeira etapa e avaliar a compatibilidade entre seu perfil e a oportunidade. Você também pode aproveitar para tirar qualquer dúvida sobre a empresa ou a vaga. Explique os próximos passos.";
const ABERTURA_TEC =
  "Olá, tudo bem? Seja bem-vindo(a)! O RH já teve uma primeira conversa com você para conhecer sua história, seus objetivos e sua trajetória profissional. Nesta etapa, quero conhecer melhor suas experiências na prática, entender como você realiza seu trabalho e avaliar como suas competências se relacionam com o que precisamos para essa função. Também vou apresentar como o cargo funciona, quais são as responsabilidades e os resultados que esperamos. Vamos conversar?";
const ENCERRAMENTO_TEC =
  "Obrigado pela conversa. Foi importante conhecer melhor sua experiência e explicar o que esperamos dessa função. Vamos consolidar as informações desta etapa com o RH e dar continuidade ao processo seletivo. Você será informado(a) sobre os próximos passos.";

const P = (id: string, texto: string, comps: string[], bom: string, alerta: string, extra?: PerguntaRoteiro["extra"]): PerguntaRoteiro => ({ id, texto, comps, bom, alerta, extra });

export function montarRoteiro(etapa: string, cargo: CargoDesc | null): Roteiro {
  const competenciasCargo = cargo?.comportamentais ?? [];
  const base = { competenciasCargo, cargoEncontrado: !!cargo, responsabilidades: (cargo?.resp ?? []).map((r) => r.titulo).filter(Boolean) };

  if (etapa === "Etapa técnica") {
    const temResp = base.responsabilidades.length > 0;
    const blocos: BlocoRoteiro[] = [
      {
        id: "t1",
        titulo: "Experiência na prática",
        objetivo: "Aprofundar o que o candidato realmente executou.",
        perguntas: [
          P("t.1", "Na sua última experiência, quais eram suas principais responsabilidades?", ["Responsabilidade"], "Cita sozinho as responsabilidades do cargo", "Descreve só tarefas genéricas", temResp ? "citadas" : undefined),
          P("t.3", "Quais atividades você executava com autonomia e em quais precisava de orientação?", ["Responsabilidade"], "Sabe seus limites e pede ajuda quando precisa", "Diz que fazia tudo sozinho, sem exemplos"),
        ],
      },
      {
        id: "t2",
        titulo: "Resultados e desempenho",
        objetivo: "Entender as entregas e a capacidade de contribuir com os resultados.",
        perguntas: [
          P("t.6", "Como você sabia se estava fazendo um bom trabalho?", ["Atenção"], "Cita retorno do cliente, do líder e conferência própria", "Nunca recebeu nem buscou retorno"),
          P("t.8", "Conte sobre uma situação em que você conseguiu melhorar um resultado ou resolver um problema no trabalho.", ["Agilidade", "Atenção"], "Situação real, ação clara e resultado", "Não tem exemplo ou a história muda ao aprofundar"),
        ],
      },
      {
        id: "t3",
        titulo: "Conhecimento técnico e resolução de problemas",
        objetivo: "Verificar se o candidato domina o que a função exige.",
        perguntas: [
          P("t.9", "Quais atividades dessa função você já domina e quais ainda precisaria aprender?", ["Responsabilidade"], "Marca com honestidade o que já fez", "Diz dominar tudo ou nada", temResp ? "matriz" : undefined),
          P("t.10", "Conte sobre um problema técnico ou operacional que você precisou resolver. Como agiu?", ["Prudência", "Agilidade"], "Age com calma, comunica e resolve", "Esconde o problema ou espera alguém resolver"),
          P("t.11", "Se percebesse que não conseguiria concluir uma atividade dentro do prazo ou do padrão esperado, o que faria?", ["Comunicação", "Responsabilidade"], "Avisa a liderança cedo e propõe solução", "Fica em silêncio ou entrega fora do padrão"),
        ],
        cenarios: (cargo?.cenarios ?? []).filter((c) => c.titulo).map((c) => ({ titulo: c.titulo, sinais: c.sinais })),
      },
      {
        id: "t4",
        titulo: "Responsabilidade, padrões e autonomia",
        objetivo: "Avaliar como lida com responsabilidades, procedimentos e expectativas de desempenho.",
        perguntas: [
          P("t.13", "O que você faz quando percebe que cometeu um erro no trabalho?", ["Responsabilidade", "Comunicação"], "Comunica na hora e corrige", "Esconde ou culpa outra pessoa"),
          P("t.14", "Como age quando discorda de uma orientação do seu líder?", ["Controle emocional", "Comunicação"], "Cumpre e expõe a opinião com respeito", "Ignora a orientação ou discute na frente do cliente"),
          P("t.15", "Se você identificasse que um procedimento está sendo executado de maneira diferente do padrão da empresa, como lidaria com a situação?", ["Atenção", "Responsabilidade"], "Corrige com respeito e avisa a liderança", "Acha normal, não se importa"),
        ],
      },
      {
        id: "t5",
        titulo: "Apresentação da função e das expectativas",
        objetivo: "Explicar a realidade do cargo e ver se o candidato está preparado para assumi-la.",
        perguntas: [
          P("t.17", "Em quais atividades você acredita que precisaria de treinamento ou acompanhamento?", ["Responsabilidade"], "Reconhece com honestidade e pede treino", "Diz que não precisa de nada"),
          P("t.18", "Você identifica algum desafio nessa função que precisaria se preparar para enfrentar?", ["Prudência", "Orientação para o cliente"], "Percebe os desafios reais da função", "Não percebe nenhum desafio"),
        ],
        apresentacao: {
          itens: [
            "Objetivo principal do cargo",
            "Responsabilidades e atividades da rotina",
            "Padrões de qualidade e procedimentos obrigatórios",
            "Metas e resultados esperados",
            "Indicadores usados para acompanhar o desempenho",
            "Jornada e condições de trabalho",
            "Principais desafios da função",
            "Treinamentos e período de adaptação",
          ],
          indicadores: (cargo?.indicadores ?? []).filter((i) => i.nome).map((i) => `${i.nome}: ${i.meta}${i.freq ? ` (${i.freq.toLowerCase()})` : ""}`),
        },
      },
    ];
    return { ...base, etapa, abertura: ABERTURA_TEC, encerramento: ENCERRAMENTO_TEC, requisitos: [], blocos };
  }

  /* 1ª etapa — RH */
  const comps = competenciasCargo.slice(0, 6);
  const requisitos: { id: string; texto: string }[] = [];
  if (cargo?.escolaridade) requisitos.push({ id: "escolaridade", texto: `Escolaridade: ${cargo.escolaridade.replace(/\.$/, "")}` });
  if (cargo?.habilitacao) requisitos.push({ id: "habilitacao", texto: `Habilitação: ${cargo.habilitacao.replace(/\.$/, "")}` });
  if (cargo?.experiencia) requisitos.push({ id: "experiencia", texto: "Experiência anterior na área (diferencial)" });

  const blocos: BlocoRoteiro[] = [
    {
      id: "r1",
      titulo: "Conhecendo a pessoa",
      perguntas: [
        P("r.1", "Me conta um pouco sobre você. Quem é você além da sua vida profissional?", ["Comunicação"], "Fala com clareza e naturalidade sobre a própria história", "Respostas vagas, evita falar de si"),
        P("r.3", "O que costuma orientar você nas decisões importantes da sua vida?", ["Responsabilidade"], "Cita valores, família, compromisso", "Decide só por impulso ou conveniência"),
      ],
    },
    {
      id: "r2",
      titulo: "Autoconhecimento",
      perguntas: [
        P("r.4", "Quais características suas você considera seus pontos fortes?", ["Responsabilidade"], "Cita pontos coerentes com o cargo, com exemplo", "Só adjetivos soltos, sem exemplo"),
        P("r.6", "Quando alguém aponta algo que você precisa melhorar, como costuma reagir?", ["Controle emocional", "Atenção"], "Escuta, agradece e ajusta", "Se defende, culpa os outros"),
      ],
    },
    {
      id: "r3",
      titulo: "Sonhos e objetivos",
      perguntas: [
        P("r.7", "Quais são os seus principais objetivos para os próximos anos?", ["Organização"], "Objetivos claros e realistas", "Sem plano ou incompatível com a vaga"),
        P("r.8", "O que você busca em uma empresa para conseguir crescer profissionalmente?", ["Responsabilidade"], "Fala de aprender e ser reconhecido pelo resultado", "Só salário e horário"),
      ],
    },
    {
      id: "r4",
      titulo: "Experiência profissional",
      perguntas: [
        P("r.9", "Me conta sobre suas últimas experiências profissionais. O que você fazia?", ["Atenção"], "Descreve atividades com detalhes e datas coerentes", "Datas confusas, não lembra do que fazia"),
        P("r.10", "Por que você saiu ou deseja sair do último emprego?", ["Controle emocional"], "Motivo objetivo, sem falar mal da empresa anterior", "Culpa terceiros, conflitos frequentes"),
        P("r.11", "O que chamou sua atenção na nossa oportunidade?", ["Orientação para o cliente"], "Conhece a empresa e o que a vaga pede", "Não sabe nada da empresa ou da vaga"),
      ],
    },
  ];
  if (comps.length) {
    blocos.push({
      id: "r5",
      titulo: `Perguntas do cargo${cargo ? ` (${cargo.cargo})` : ""}`,
      objetivo: "Criadas a partir das competências da descrição do cargo.",
      perguntas: comps.map((c, i) => {
        const q = perguntaDaCompetencia(c);
        return { id: `r.c${i}`, texto: q.texto, comps: [c], bom: q.bom, alerta: q.alerta, doCargo: true };
      }),
    });
  }
  return {
    ...base,
    etapa,
    abertura: ABERTURA_RH,
    encerramento: ENCERRAMENTO_RH,
    requisitos,
    blocos,
    perguntaOpcional: "Você tem alguma ligação ou identificação com a fé cristã evangélica?",
  };
}

/* ------------------------------------------------------------------ */
/* Cálculo do resumo                                                   */
/* ------------------------------------------------------------------ */

const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function notaCenario(marcados: boolean[] | undefined, total: number): number | null {
  const m = (marcados ?? []).filter(Boolean).length;
  return m && total ? 1 + Math.round((4 * m) / total) : null;
}

export interface ResumoRoteiro {
  porBloco: { id: string; titulo: string; media: number | null }[];
  porCompetencia: { nome: string; media: number }[];
  geral: number | null;
  respondidas: number;
  total: number;
  requisitosNao: number;
  sugestao: "Avançar" | "Manter em avaliação" | "Não avançar" | null;
}

export function resumir(roteiro: Roteiro, r: RespRoteiro): ResumoRoteiro {
  const comp: Record<string, number[]> = {};
  const porBloco = roteiro.blocos.map((b) => {
    const notas: number[] = [];
    for (const p of b.perguntas) {
      const n = r.notas[p.id];
      if (n) {
        notas.push(n);
        p.comps.forEach((c) => (comp[c] = [...(comp[c] ?? []), n]));
      }
    }
    (b.cenarios ?? []).forEach((c, i) => {
      const n = notaCenario(r.cen[`cen.${i}`], c.sinais.length);
      if (n) notas.push(n);
    });
    return { id: b.id, titulo: b.titulo, media: media(notas) };
  });

  const doCargo = new Set(roteiro.competenciasCargo.map(semAcento));
  const porCompetencia = Object.entries(comp)
    .filter(([nome]) => !doCargo.size || doCargo.has(semAcento(nome)))
    .map(([nome, v]) => ({ nome, media: media(v) as number }));

  const geral = media(porBloco.flatMap((b) => (b.media ? [b.media] : [])));
  const total = roteiro.blocos.reduce((s, b) => s + b.perguntas.length, 0);
  const respondidas = roteiro.blocos.reduce((s, b) => s + b.perguntas.filter((p) => r.notas[p.id]).length, 0);
  const requisitosNao = roteiro.requisitos.filter((q) => r.req[q.id] === 0).length;
  const sugestao = geral === null ? null : geral >= 3.5 ? "Avançar" : geral >= 2.5 ? "Manter em avaliação" : "Não avançar";
  return { porBloco, porCompetencia, geral, respondidas, total, requisitosNao, sugestao };
}

export function fmtNota(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toFixed(1).replace(".", ",");
}
