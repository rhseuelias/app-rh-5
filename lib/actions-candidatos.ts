"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { candidatosDoCSV } from "@/lib/csv";
import { criarProcessoIntegracao } from "@/lib/actions-integracao";

function str(formData: FormData, campo: string): string | null {
  const v = formData.get(campo);
  return v && v !== "" ? String(v) : null;
}

// ------------------------------------------------------------
// Área do RH (autenticado) — usa o cliente normal, com RLS
// ------------------------------------------------------------

/** Cria um pré-cadastro e gera o link com token único pra enviar ao candidato. */
export async function criarCandidato(formData: FormData) {
  const supabase = createClient();

  const payload = {
    nome: str(formData, "nome"),
    cargo_pretendido: str(formData, "cargo_pretendido"),
    empresa_id: str(formData, "empresa_id"),
    status: "link_gerado" as const,
    enviado_em: new Date().toISOString(),
  };

  const { error } = await supabase.from("candidatos").insert(payload);
  if (error) throw error;

  revalidatePath("/candidatos");
}

/**
 * Exclui em definitivo o registro de um pré-cadastro (e o link enviado ao
 * candidato deixa de funcionar). Os documentos anexados são removidos do
 * Storage e o registro em "documentos_candidato" some junto (cascade).
 * Se o candidato já foi convertido em colaborador, a ficha do colaborador
 * não é afetada — só o registro de pré-cadastro é apagado.
 */
export async function excluirCandidato(formData: FormData) {
  const supabase = createClient();
  const candidatoId = str(formData, "candidato_id");
  if (!candidatoId) throw new Error("Candidato inválido.");

  const { data: documentos } = await supabase
    .from("documentos_candidato")
    .select("storage_path")
    .eq("candidato_id", candidatoId);

  if (documentos && documentos.length > 0) {
    const caminhos = documentos.map((d) => d.storage_path).filter(Boolean) as string[];
    if (caminhos.length > 0) {
      await supabase.storage.from("documentos").remove(caminhos);
    }
  }

  const { error } = await supabase.from("candidatos").delete().eq("id", candidatoId);
  if (error) throw error;

  revalidatePath("/candidatos");
}

/** Importa candidatos em massa a partir de um CSV (ex.: export do Google Forms). */
export async function importarCandidatosCSV(formData: FormData) {
  const supabase = createClient();
  const arquivo = formData.get("arquivo") as File | null;
  const empresa_id = str(formData, "empresa_id");

  if (!arquivo || arquivo.size === 0) {
    throw new Error("Selecione um arquivo CSV.");
  }

  const texto = await arquivo.text();
  const candidatos = candidatosDoCSV(texto);

  if (candidatos.length === 0) {
    throw new Error(
      "Não encontrei linhas de candidato no CSV. Confira se a primeira linha é o cabeçalho."
    );
  }

  // Vem de um formulário que o candidato já respondeu (ex.: Google Forms),
  // então entra como "preenchido" — não "link_gerado" — pra não travar o
  // botão "Converter em colaborador" nem mostrar o aviso de "ainda não
  // preencheu" na ficha do candidato.
  const registros = candidatos.map((c) => ({
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    cargo_pretendido: c.cargo_pretendido,
    cpf: c.cpf,
    empresa_id,
    observacoes: c.observacoes_extra,
    status: "preenchido" as const,
    preenchido_em: new Date().toISOString(),
  }));

  const { error } = await supabase.from("candidatos").insert(registros);
  if (error) throw error;

  revalidatePath("/candidatos");
}

/**
 * Converte um candidato (já com pré-cadastro preenchido) em Colaborador CLT.
 * Os dados que o candidato não preenche (cargo definitivo, salário, data de
 * admissão etc.) ficam para o RH completar na ficha recém-criada.
 */
export async function converterCandidatoEmColaborador(formData: FormData) {
  const supabase = createClient();
  const candidatoId = str(formData, "candidato_id")!;

  const { data: candidato, error: erroCandidato } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", candidatoId)
    .single();
  if (erroCandidato || !candidato) throw erroCandidato ?? new Error("Candidato não encontrado.");

  if (candidato.convertido_colaborador_id) {
    redirect(`/colaboradores/${candidato.convertido_colaborador_id}`);
  }

  const { data: colaborador, error: erroColaborador } = await supabase
    .from("colaboradores")
    .insert({
      tipo: "CLT",
      nome: candidato.nome,
      cpf_cnpj: candidato.cpf,
      cargo: candidato.cargo_pretendido,
      empresa_id: candidato.empresa_id,
      data_nascimento: candidato.data_nascimento,
      status: "experiencia",
      telefone: candidato.telefone,
      email: candidato.email,
      telefone_contato_emergencia: candidato.telefone_contato_emergencia,
      nome_contato_emergencia: candidato.nome_contato_emergencia,
      rg: candidato.rg,
      endereco: candidato.endereco,
      estado_civil: candidato.estado_civil,
      banco: candidato.banco,
      agencia: candidato.agencia,
      conta: candidato.conta,
      observacoes: [
        candidato.pix ? `Pix: ${candidato.pix}` : null,
        candidato.observacoes,
      ]
        .filter(Boolean)
        .join("\n"),
    })
    .select("id")
    .single();

  if (erroColaborador || !colaborador) throw erroColaborador ?? new Error("Falha ao criar colaborador.");

  // copia os documentos anexados no pré-cadastro para a ficha do colaborador
  const { data: documentos } = await supabase
    .from("documentos_candidato")
    .select("*")
    .eq("candidato_id", candidatoId);

  if (documentos && documentos.length > 0) {
    await supabase.from("documentos_colaborador").insert(
      documentos.map((d) => ({
        colaborador_id: colaborador.id,
        nome_arquivo: d.nome_arquivo,
        tipo: d.tipo,
        storage_path: d.storage_path,
      }))
    );
  }

  await supabase
    .from("candidatos")
    .update({ status: "convertido", convertido_colaborador_id: colaborador.id })
    .eq("id", candidatoId);

  // cria automaticamente o processo de integração com todas as etapas
  await criarProcessoIntegracao(colaborador.id, candidatoId);

  revalidatePath("/candidatos");
  revalidatePath("/colaboradores");
  redirect(`/colaboradores/${colaborador.id}`);
}

// ------------------------------------------------------------
// Fluxo público (sem login) — o token do link é a credencial.
// Usa sempre a service role key, nunca o cliente autenticado.
// ------------------------------------------------------------

/** Busca os dados de um candidato pelo token do link (para a página pública). */
export async function buscarCandidatoPorToken(token: string) {
  const admin = createAdminClient();
  const { data: candidato } = await admin.from("candidatos").select("*").eq("token", token).single();
  if (!candidato) return null;

  const { data: documentos } = await admin
    .from("documentos_candidato")
    .select("*")
    .eq("candidato_id", candidato.id)
    .order("created_at", { ascending: true });

  return { candidato, documentos: documentos ?? [] };
}

/** Recebido do formulário público — salva os dados e os documentos anexados. */
export async function submeterPreCadastro(formData: FormData) {
  const token = str(formData, "token");
  if (!token) throw new Error("Link inválido.");

  const admin = createAdminClient();
  const { data: candidato } = await admin.from("candidatos").select("id, status").eq("token", token).single();
  if (!candidato) throw new Error("Link inválido ou expirado.");
  if (candidato.status === "convertido") {
    throw new Error("Este pré-cadastro já foi processado pelo RH.");
  }

  const payload = {
    nome: str(formData, "nome"),
    cpf: str(formData, "cpf"),
    rg: str(formData, "rg"),
    estado_civil: str(formData, "estado_civil"),
    data_nascimento: str(formData, "data_nascimento"),
    telefone: str(formData, "telefone"),
    email: str(formData, "email"),
    endereco: str(formData, "endereco"),
    nome_contato_emergencia: str(formData, "nome_contato_emergencia"),
    telefone_contato_emergencia: str(formData, "telefone_contato_emergencia"),
    banco: str(formData, "banco"),
    agencia: str(formData, "agencia"),
    conta: str(formData, "conta"),
    pix: str(formData, "pix"),
    observacoes: str(formData, "observacoes"),
    status: "preenchido" as const,
    preenchido_em: new Date().toISOString(),
  };

  await admin.from("candidatos").update(payload).eq("id", candidato.id);

  const arquivos = formData.getAll("documentos") as File[];
  const tipos = formData.getAll("documentos_tipo") as string[];

  for (let i = 0; i < arquivos.length; i++) {
    const arquivo = arquivos[i];
    if (!arquivo || arquivo.size === 0) continue;

    const caminho = `candidatos/${candidato.id}/${Date.now()}-${arquivo.name}`;
    const { error: erroUpload } = await admin.storage.from("documentos").upload(caminho, arquivo, {
      contentType: arquivo.type || undefined,
      upsert: false,
    });
    if (erroUpload) continue;

    await admin.from("documentos_candidato").insert({
      candidato_id: candidato.id,
      nome_arquivo: arquivo.name,
      tipo: tipos[i] || "outro",
      storage_path: caminho,
    });
  }

  redirect(`/pre-cadastro/${token}/enviado`);
}
