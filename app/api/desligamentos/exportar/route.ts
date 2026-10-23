import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { obterPapelUsuarioLogado } from "@/lib/permissoes";
import {
  ROTULO_AVISO,
  ROTULO_ENTREVISTA,
  ROTULO_INICIATIVA,
  ROTULO_RECONTRATAVEL,
  fmtData,
  tempoDeCasaDias,
  type RegistroDesligamento,
} from "@/lib/desligamentos-modulo";

export const dynamic = "force-dynamic";

function celula(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Exporta o histórico em CSV (abre no Excel), respeitando os mesmos filtros da tela.
 * Os campos restritos (motivo complementar e observações) NUNCA entram na exportação.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Entre no sistema.", { status: 401 });
  if ((await obterPapelUsuarioLogado()) === "assistente") return new NextResponse("Sem permissão.", { status: 403 });

  const p = new URL(req.url).searchParams;
  const q = semAcento((p.get("q") ?? "").trim());
  const empresa = p.get("empresa") ?? "";
  const unidade = p.get("unidade") ?? "";
  const iniciativa = p.get("iniciativa") ?? "";
  const situacao = p.get("situacao") ?? "";
  const de = p.get("de") ?? "";
  const ate = p.get("ate") ?? "";

  const { data, error } = await supabase
    .from("desligamentos_registro")
    .select(
      "nome, matricula, vinculo, empresa, unidade, departamento, cargo, gestor, data_admissao, data_desligamento, data_comunicacao, ultimo_dia_trabalhado, iniciativa, tipo_rescisao, motivo_principal, aviso_previo, entrevista, recontratavel, custo_rescisorio, status"
    )
    .order("data_desligamento", { ascending: false });
  if (error) return new NextResponse(error.message, { status: 500 });

  const linhas = ((data ?? []) as unknown as RegistroDesligamento[]).filter(
    (r) =>
      (!q || semAcento(r.nome).includes(q) || semAcento(r.matricula ?? "").includes(q)) &&
      (!empresa || r.empresa === empresa) &&
      (!unidade || r.unidade === unidade) &&
      (!iniciativa || r.iniciativa === iniciativa) &&
      (!situacao || r.status === situacao) &&
      (!de || r.data_desligamento >= de) &&
      (!ate || r.data_desligamento <= ate)
  );

  const cab = [
    "Nome", "Matrícula", "Vínculo", "Empresa", "Unidade", "Departamento", "Cargo", "Gestor",
    "Admissão", "Desligamento", "Comunicação", "Último dia trabalhado", "Tempo de casa (dias)",
    "Iniciativa", "Tipo de rescisão", "Motivo principal", "Aviso-prévio", "Entrevista", "Recontratável",
    "Custo rescisório", "Situação",
  ];
  const corpo = linhas.map((r) =>
    [
      r.nome, r.matricula, r.vinculo, r.empresa, r.unidade, r.departamento, r.cargo, r.gestor,
      fmtData(r.data_admissao), fmtData(r.data_desligamento), fmtData(r.data_comunicacao), fmtData(r.ultimo_dia_trabalhado),
      tempoDeCasaDias(r) ?? "",
      ROTULO_INICIATIVA[r.iniciativa], r.tipo_rescisao, r.motivo_principal,
      r.aviso_previo ? ROTULO_AVISO[r.aviso_previo] : "",
      r.entrevista ? ROTULO_ENTREVISTA[r.entrevista] : "",
      r.recontratavel ? ROTULO_RECONTRATAVEL[r.recontratavel] : "",
      r.custo_rescisorio !== null ? String(r.custo_rescisorio).replace(".", ",") : "",
      r.status === "ativo" ? "Ativo" : "Cancelado",
    ]
      .map(celula)
      .join(";")
  );

  const csv = "﻿" + [cab.map(celula).join(";"), ...corpo].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="historico-desligamentos.csv"',
    },
  });
}
