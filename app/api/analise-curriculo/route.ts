import { inflateRawSync } from "zlib";
import { createClient } from "@/lib/supabase-server";
import { normalizarCargo } from "@/lib/roteiro-dados";
import { cargoParecido } from "@/lib/cargo-parecido";
import { cargoParaTexto, PROMPT_ANALISE } from "@/lib/analise-curriculo";
import type { CargoDesc } from "@/lib/cargos";

/**
 * Análise do currículo do candidato (módulo Entrevistas).
 * Lê o currículo anexado + a descrição do cargo e pede à IA (chave ANTHROPIC_API_KEY,
 * a mesma da importação da folha) a análise em 10 etapas. A resposta chega aos poucos
 * (streaming) e, no fim, fica guardada no candidato.
 *
 * Privacidade: só o currículo e a descrição do cargo vão para a IA. Nada mais do sistema.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const URL_API = "https://api.anthropic.com/v1/messages";

function modelo(): string {
  return process.env.ANTHROPIC_MODEL_CURRICULO?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5";
}

function erro(mensagem: string, status = 400): Response {
  return Response.json({ erro: mensagem }, { status });
}

/** Lê o texto de um arquivo .docx (que é um zip) sem precisar de biblioteca extra. */
function textoDeDocx(buf: Buffer): string | null {
  try {
    // Procura o "fim do diretório central" do zip, de trás para frente.
    let fim = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        fim = i;
        break;
      }
    }
    if (fim < 0) return null;
    const total = buf.readUInt16LE(fim + 10);
    let pos = buf.readUInt32LE(fim + 16);
    for (let n = 0; n < total; n++) {
      if (buf.readUInt32LE(pos) !== 0x02014b50) break;
      const metodo = buf.readUInt16LE(pos + 10);
      const tamComp = buf.readUInt32LE(pos + 20);
      const tamNome = buf.readUInt16LE(pos + 28);
      const tamExtra = buf.readUInt16LE(pos + 30);
      const tamCom = buf.readUInt16LE(pos + 32);
      const deslocamento = buf.readUInt32LE(pos + 42);
      const nome = buf.toString("utf8", pos + 46, pos + 46 + tamNome);
      if (nome === "word/document.xml") {
        const nomeLocal = buf.readUInt16LE(deslocamento + 26);
        const extraLocal = buf.readUInt16LE(deslocamento + 28);
        const ini = deslocamento + 30 + nomeLocal + extraLocal;
        const dados = buf.subarray(ini, ini + tamComp);
        const xml = (metodo === 8 ? inflateRawSync(dados) : dados).toString("utf8");
        const texto = xml
          .replace(/<\/w:p>/g, "\n")
          .replace(/<w:tab\/>/g, "\t")
          .replace(/<w:br\/>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        return texto || null;
      }
      pos += 46 + tamNome + tamExtra + tamCom;
    }
    return null;
  } catch {
    return null;
  }
}

type Bloco =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export async function POST(req: Request): Promise<Response> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erro("Sua sessão expirou. Entre de novo no sistema.", 401);

  const chave = process.env.ANTHROPIC_API_KEY?.trim();
  if (!chave) return erro("A IA ainda não foi ligada (falta a chave ANTHROPIC_API_KEY na Vercel).", 503);

  let candidatoId = "";
  let cargoId = "";
  try {
    const corpo = (await req.json()) as { candidatoId?: string; cargoId?: string };
    candidatoId = String(corpo.candidatoId ?? "");
    cargoId = String(corpo.cargoId ?? "");
  } catch {
    return erro("Pedido inválido.");
  }
  if (!candidatoId) return erro("Candidato inválido.");

  const { data: cand } = await supabase.from("sel_candidatos").select("*").eq("id", candidatoId).maybeSingle();
  if (!cand) return erro("Candidato não encontrado.", 404);
  if (!cand.curriculo_path) return erro("Este candidato ainda não tem currículo anexado.");

  const { data: vaga } = await supabase.from("sel_vagas").select("cargo, empresa, unidade").eq("id", cand.vaga_id).maybeSingle();
  if (!vaga) return erro("Vaga não encontrada.", 404);

  const { data: lista } = await supabase.from("cargos_desc").select("*");
  const cargos = ((lista ?? []) as CargoDesc[]).map(normalizarCargo);
  // Cargo escolhido na tela; se não veio, procura o cadastrado em "Cargos" que combina com a vaga.
  const cargo = (cargoId ? cargos.find((c) => c.id === cargoId) : null) ?? cargoParecido(cargos, vaga.cargo, vaga.empresa);
  if (!cargo) {
    return erro(`Falta a descrição do cargo "${vaga.cargo}". Cadastre em Cargos ou escolha outro cargo na lista e tente de novo.`);
  }

  const { data: arq, error: erroArq } = await supabase.storage.from("curriculos").download(cand.curriculo_path);
  if (erroArq || !arq) return erro("Não consegui abrir o arquivo do currículo.");
  const bytes = Buffer.from(await arq.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) return erro("O currículo é grande demais (limite de 10 MB).");

  const nomeArq = String(cand.curriculo_nome ?? cand.curriculo_path).toLowerCase();
  const ext = nomeArq.split(".").pop() ?? "";
  const b64 = bytes.toString("base64");

  const conteudo: Bloco[] = [
    { type: "text", text: `<descricao_do_cargo>\n${cargoParaTexto(cargo, cargo.empresa, vaga.empresa === cargo.empresa ? vaga.unidade ?? null : null)}\n</descricao_do_cargo>` },
  ];
  if (ext === "pdf") {
    conteudo.push({ type: "text", text: "<curriculo_do_candidato> (arquivo PDF a seguir)" });
    conteudo.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
  } else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    const tipo = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    conteudo.push({ type: "text", text: "<curriculo_do_candidato> (imagem a seguir)" });
    conteudo.push({ type: "image", source: { type: "base64", media_type: tipo, data: b64 } });
  } else if (ext === "docx") {
    const texto = textoDeDocx(bytes);
    if (!texto) return erro("Não consegui ler o texto desse arquivo Word. Salve o currículo como PDF e anexe de novo.");
    conteudo.push({ type: "text", text: `<curriculo_do_candidato>\n${texto}\n</curriculo_do_candidato>` });
  } else {
    return erro("Esse tipo de arquivo (Word antigo) a IA não lê. Salve o currículo como PDF ou .docx e anexe de novo.");
  }
  conteudo.push({
    type: "text",
    text: "Os dois documentos estão acima. Confirme em uma linha que recebeu a descrição do cargo e o currículo e, em seguida, entregue a análise nas 10 etapas, seguindo rigorosamente a estrutura pedida.",
  });

  let resposta: Response;
  try {
    resposta = await fetch(URL_API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: modelo(),
        max_tokens: 8000,
        temperature: 0.2,
        stream: true,
        system: PROMPT_ANALISE,
        messages: [{ role: "user", content: conteudo }],
      }),
      signal: AbortSignal.timeout(58000),
    });
  } catch {
    return erro("Não consegui falar com a IA agora. Tente de novo em instantes.", 502);
  }
  if (!resposta.ok || !resposta.body) {
    if (resposta.status === 401 || resposta.status === 403) return erro("A chave da IA foi recusada. Confira a ANTHROPIC_API_KEY na Vercel.", 502);
    if (resposta.status === 404) return erro("O modelo de IA não foi encontrado. Defina ANTHROPIC_MODEL na Vercel.", 502);
    if (resposta.status === 429 || resposta.status === 529) return erro("A IA está ocupada agora. Tente de novo em instantes.", 502);
    return erro("A IA não conseguiu analisar este arquivo.", 502);
  }

  const leitor = resposta.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const idCandidato = candidatoId;

  const fluxo = new ReadableStream<Uint8Array>({
    async start(controller) {
      let acumulado = "";
      let resto = "";
      let cortada = false;
      let falhou = false;
      const emitir = (t: string) => {
        acumulado += t;
        controller.enqueue(enc.encode(t));
      };
      try {
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          resto += dec.decode(value, { stream: true });
          const linhas = resto.split("\n");
          resto = linhas.pop() ?? "";
          for (const linha of linhas) {
            if (!linha.startsWith("data:")) continue;
            const json = linha.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json) as {
                type?: string;
                delta?: { type?: string; text?: string; stop_reason?: string };
              };
              if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) emitir(ev.delta.text);
              else if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") cortada = true;
              else if (ev.type === "error") falhou = true;
            } catch {
              /* linha incompleta: ignora */
            }
          }
        }
      } catch {
        falhou = true;
      }
      if (cortada) emitir("\n\n_A análise foi cortada porque ficou muito longa. Clique em “Analisar de novo”._");
      if (falhou && acumulado.length < 200) {
        controller.enqueue(enc.encode("\n\n__ERRO__ A análise foi interrompida. Tente de novo."));
      } else if (falhou) {
        emitir("\n\n_A análise foi interrompida antes do fim. Clique em “Analisar de novo”._");
      }
      if (acumulado.length >= 200 && !falhou && !cortada) {
        // Guarda no candidato (se a migration 038 ainda não foi rodada, só não guarda).
        await supabase
          .from("sel_candidatos")
          .update({ analise_curriculo: acumulado, analise_em: new Date().toISOString() })
          .eq("id", idCandidato);
      }
      controller.close();
    },
    cancel() {
      void leitor.cancel();
    },
  });

  return new Response(fluxo, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
