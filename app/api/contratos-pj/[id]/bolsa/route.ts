import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { combinarDadosEmpresa } from "@/lib/dados-empresa";
import { gerarContratoBolsaDocx } from "@/lib/contrato-bolsa";
import type { Colaborador, Empresa, Unidade } from "@/types/db";

/** "350", "350,00" ou "1.250,50" -> número. */
function lerValor(txt: string | null): number {
  const limpo = (txt ?? "").replace(/[^\d.,]/g, "");
  if (!limpo) return NaN;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  return Number(normal);
}

const ERRO = (motivo: string) => NextResponse.json({ error: motivo }, { status: 400 });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const curso = (url.searchParams.get("curso") ?? "").trim();
  const valor = lerValor(url.searchParams.get("valor"));
  const parcelas = Number(url.searchParams.get("parcelas"));
  if (!curso) return ERRO("Informe o nome do curso.");
  if (!Number.isFinite(valor) || valor <= 0) return ERRO("Informe o valor da mensalidade, por exemplo 350,00.");
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 99) return ERRO("Informe o número de parcelas (de 1 a 99).");

  const { data: colaboradorData } = await supabase.from("colaboradores").select("*").eq("id", params.id).single();
  if (!colaboradorData) return NextResponse.json({ error: "colaborador não encontrado" }, { status: 404 });
  const colaborador = colaboradorData as Colaborador;
  if (colaborador.tipo !== "PJ") return ERRO("O Contrato Bolsa é só para parceiros PJ.");

  let empresa: Empresa | null = null;
  if (colaborador.empresa_id) {
    const { data } = await supabase.from("empresas").select("*").eq("id", colaborador.empresa_id).maybeSingle();
    empresa = (data as Empresa) ?? null;
  }
  let unidade: Unidade | null = null;
  if (colaborador.unidade_id) {
    const { data } = await supabase.from("unidades").select("*").eq("id", colaborador.unidade_id).maybeSingle();
    unidade = (data as Unidade) ?? null;
  }
  // Salão-Parceiro = a unidade onde o parceiro atua (razão social, CNPJ e endereço cadastrados em
  // Projeção de Custo > Empresas / Unidades); o que a unidade não tiver vem da empresa.
  const salao = combinarDadosEmpresa(empresa, unidade);
  if (!salao.razao || !salao.cnpj) {
    return ERRO("Faltam a razão social e o CNPJ da empresa. Complete em Projeção de Custo > Empresas / Unidades e tente de novo.");
  }

  const resultado = await gerarContratoBolsaDocx({
    parceiro: {
      nome: colaborador.nome,
      sexo: colaborador.sexo ?? null,
      estadoCivil: colaborador.estado_civil,
      rg: colaborador.rg,
      cpfCnpj: colaborador.cpf_cnpj,
      endereco: colaborador.endereco,
      contratoInicio: colaborador.contrato_inicio,
    },
    salao,
    curso,
    valorMensalidade: valor,
    parcelas,
  });

  return new NextResponse(new Uint8Array(resultado.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${resultado.nomeArquivo}"`,
    },
  });
}
