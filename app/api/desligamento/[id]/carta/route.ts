import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { souAssistente } from "@/lib/permissoes";
import { disposicaoPdf } from "@/lib/pdf-disposicao";
import { gerarCartaPdf } from "@/lib/carta-desligamento";
import { gerarCartaDocx } from "@/lib/carta-desligamento-docx";
import { empresaConhecidaPorCnpj, type DadosCarta } from "@/lib/carta-dados";
import type { Desligamento } from "@/lib/desligamento";

export const dynamic = "force-dynamic";

const campo = (sp: URLSearchParams, nome: string) => (sp.get(nome) ?? "").trim().slice(0, 200);

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (await souAssistente()) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const { data: d } = await supabase.from("desligamentos").select("*").eq("colaborador_id", params.id).maybeSingle();
  if (!d) return NextResponse.json({ error: "registre o aviso do colaborador primeiro" }, { status: 404 });
  const desl = d as Desligamento;

  const { data: c } = await supabase
    .from("colaboradores")
    .select("nome, cpf_cnpj, data_admissao, endereco, empresa_id, unidade_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: "colaborador não encontrado" }, { status: 404 });
  const colab = c as {
    nome: string;
    cpf_cnpj: string | null;
    data_admissao: string | null;
    endereco: string | null;
    empresa_id: string | null;
    unidade_id: string | null;
  };

  // padrões da empresa: o que vier no link tem prioridade; depois o endereço
  // já conhecido do CNPJ; depois o que existe no cadastro
  const [{ data: emp }, { data: uni }] = await Promise.all([
    colab.empresa_id
      ? supabase.from("empresas").select("nome, cnpj").eq("id", colab.empresa_id).maybeSingle()
      : Promise.resolve({ data: null }),
    colab.unidade_id
      ? supabase.from("unidades").select("cnpj").eq("id", colab.unidade_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sp = new URL(req.url).searchParams;
  const cnpj =
    campo(sp, "cnpj") ||
    (uni as { cnpj: string | null } | null)?.cnpj ||
    (emp as { cnpj: string | null } | null)?.cnpj ||
    "";
  const conhecida = empresaConhecidaPorCnpj(cnpj);

  const dados: DadosCarta = {
    tipo: desl.tipo_aviso,
    empresa: {
      razao: campo(sp, "razao") || conhecida?.razao || (emp as { nome: string } | null)?.nome || "",
      cnpj: conhecida?.cnpj && !campo(sp, "cnpj") ? conhecida.cnpj : cnpj,
      endereco: campo(sp, "endereco") || conhecida?.endereco || "",
      numero: campo(sp, "numero") || conhecida?.numero || "",
      complemento: campo(sp, "complemento") || conhecida?.complemento || "",
      bairro: campo(sp, "bairro") || conhecida?.bairro || "",
      cidade: campo(sp, "cidade") || conhecida?.cidade || "",
      uf: (campo(sp, "uf") || conhecida?.uf || "").toUpperCase().slice(0, 2),
    },
    colaborador: {
      nome: colab.nome,
      cpf: colab.cpf_cnpj ?? "",
      admissao: colab.data_admissao,
      endereco: colab.endereco ?? "",
    },
    comunicacao: desl.data_comunicacao,
    ultimoDia: desl.ultimo_dia,
    diasAviso: desl.dias_aviso,
    homologacao: desl.homologacao_necessaria
      ? { data: desl.homologacao_data, hora: desl.homologacao_hora, local: desl.homologacao_local }
      : null,
  };

  const base = `aviso-${desl.tipo_aviso}-${
    colab.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "colaborador"
  }`;

  if (sp.get("formato") === "docx") {
    const buffer = await gerarCartaDocx(dados);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.docx"`,
      },
    });
  }

  const bytes = await gerarCartaPdf(dados);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposicaoPdf(req, `${base}.pdf`),
    },
  });
}
