"use client";

import { useRef, useState } from "react";
import { EMPRESAS_SEL } from "@/lib/entrevistas";
import { criarCargo, salvarCargo } from "@/lib/actions-cargos";
import type { CargoDesc } from "@/lib/cargos";
import { lerDescricaoCargo, type CargoLido, type TrechoPdf } from "@/lib/cargo-pdf";

// Leitor de PDF carregado só quando alguém usa a importação (não pesa no resto do app).
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
function carregarPdfJs(): Promise<any> {
  const w = window as any;
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = PDFJS_URL;
    s.onload = () => (w.pdfjsLib ? ok(w.pdfjsLib) : falha(new Error("Leitor de PDF indisponível.")));
    s.onerror = () => falha(new Error("Não consegui carregar o leitor de PDF. Verifique a internet e tente de novo."));
    document.head.appendChild(s);
  });
}

async function extrairTrechos(arquivo: File): Promise<TrechoPdf[]> {
  const lib = await carregarPdfJs();
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const saida: TrechoPdf[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const altura = pagina.getViewport({ scale: 1 }).height;
    const conteudo = await pagina.getTextContent();
    for (const it of conteudo.items as any[]) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const x = it.transform[4] as number;
      saida.push({ str: it.str, x, x2: x + (it.width as number), top: altura - (it.transform[5] as number), page: n - 1 });
    }
  }
  return saida;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type Etapa = "enviar" | "lendo" | "conferir";

export default function ImportarPdfModal({
  existentes,
  aoFechar,
  aoConcluir,
}: {
  existentes: CargoDesc[];
  aoFechar: () => void;
  aoConcluir: (cargo: CargoDesc, substituiu: boolean) => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("enviar");
  const [arrastando, setArrastando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lido, setLido] = useState<CargoLido | null>(null);
  const [cargo, setCargo] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [substituir, setSubstituir] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const duplicado = existentes.find((c) => c.empresa === empresa && c.cargo.trim().toLowerCase() === cargo.trim().toLowerCase());

  async function ler(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf") return setMsg("Escolha um arquivo PDF.");
    setMsg(null);
    setNomeArquivo(arquivo.name);
    setEtapa("lendo");
    try {
      const r = lerDescricaoCargo(await extrairTrechos(arquivo));
      if (!r.blocos.some((b) => b.ok)) {
        setEtapa("enviar");
        return setMsg("Não encontrei o texto da descrição de cargo nesse PDF. Ele precisa estar no modelo da empresa e não pode ser uma foto escaneada.");
      }
      setLido(r);
      setCargo(r.cargo);
      setDepartamento(r.departamento);
      setEtapa("conferir");
    } catch (e) {
      setEtapa("enviar");
      setMsg(e instanceof Error ? e.message : "Não consegui ler esse PDF.");
    }
  }

  async function criar() {
    if (!lido) return;
    if (!cargo.trim()) return setMsg("Informe o nome do cargo.");
    if (!empresa) return setMsg("Escolha a empresa.");
    if (duplicado && !substituir) return setMsg("Já existe um cargo com esse nome nessa empresa. Marque a opção de substituir ou mude o nome.");
    setSalvando(true);
    setMsg(null);
    const campos = {
      cargo: cargo.trim(),
      empresa,
      departamento: departamento.trim() || null,
      cbo: lido.cbo || null,
      identificador: lido.identificador || null,
      missao: lido.missao || null,
      sumaria: lido.sumaria || null,
      resp: lido.resp,
      sucesso: lido.sucesso,
      resultados: lido.resultados,
      indicadores: lido.indicadores,
      escolaridade: lido.escolaridade || null,
      experiencia: lido.experiencia || null,
      habilitacao: lido.habilitacao || null,
      tecnicos: lido.tecnicos,
      comportamentais: lido.comportamentais,
    };
    const r = duplicado && substituir ? await salvarCargo(duplicado.id, campos) : await criarCargo(campos);
    setSalvando(false);
    if (!r.ok) return setMsg(r.erro);
    const id = duplicado && substituir ? duplicado.id : (r.id as string);
    aoConcluir({ ...(duplicado && substituir ? duplicado : { cenarios: [] }), ...campos, id } as unknown as CargoDesc, !!(duplicado && substituir));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && !salvando && aoFechar()}>
      <div role="dialog" aria-modal="true" aria-label="Importar descrição de cargo" className="bg-[#faf6f0] rounded-2xl w-full max-w-xl max-h-[94vh] overflow-y-auto p-6 space-y-4">
        <p className="text-xs uppercase tracking-widest text-ink-500">
          <span className={etapa === "enviar" ? "font-bold text-ink-900" : ""}>1 Enviar</span> › <span className={etapa === "lendo" ? "font-bold text-ink-900" : ""}>2 Ler</span> ›{" "}
          <span className={etapa === "conferir" ? "font-bold text-ink-900" : ""}>3 Conferir</span>
        </p>

        {etapa === "enviar" && (
          <>
            <h2 className="text-2xl">Importar descrição de cargo</h2>
            <div
              className={`rounded-xl border-2 border-dashed p-8 text-center space-y-3 ${arrastando ? "border-brand-500 bg-brand-50" : "border-brand-200 bg-white"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                ler(e.dataTransfer.files[0]);
              }}
            >
              <p className="font-semibold">Arraste o PDF aqui</p>
              <p className="text-sm text-ink-500">ou</p>
              <button type="button" className="btn-primary" onClick={() => entrada.current?.click()}>
                Escolher arquivo
              </button>
              <input ref={entrada} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => ler(e.target.files?.[0])} />
              <p className="text-sm text-ink-500">PDF no modelo da empresa, como o “Descrição de Manobrista”.</p>
            </div>
            {msg && <p className="text-sm text-red-700">{msg}</p>}
            <div className="flex justify-end">
              <button type="button" className="btn-secondary" onClick={aoFechar}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {etapa === "lendo" && (
          <div className="py-8 text-center space-y-3" role="status">
            <h2 className="text-2xl">Lendo o PDF…</h2>
            <p className="text-sm text-ink-500">{nomeArquivo}</p>
          </div>
        )}

        {etapa === "conferir" && lido && (
          <>
            <h2 className="text-2xl">Conferir antes de criar</h2>
            <p className="text-sm text-ink-500">
              Arquivo: {nomeArquivo} · <b>{lido.blocos.filter((b) => b.ok).length} de {lido.blocos.length} blocos reconhecidos</b>
            </p>
            <div className="rounded-xl border border-brand-200 bg-white divide-y divide-brand-100">
              {lido.blocos.map((b) => (
                <div key={b.nome} className="grid grid-cols-[1.25rem_9rem_1fr] gap-2 px-3 py-2 text-sm items-start">
                  <span className={b.ok ? "text-green-700 font-bold" : "text-amber-700 font-bold"}>{b.ok ? "✓" : "!"}</span>
                  <span className="font-semibold">{b.nome}</span>
                  <span className="text-ink-500 line-clamp-2">{b.resumo}</span>
                </div>
              ))}
            </div>
            {lido.avisos.map((a) => (
              <p key={a} className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
                {a}
              </p>
            ))}
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-ink-700">Nome do cargo</span>
              <input className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-ink-700">Empresa (obrigatório)</span>
                <select className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
                  <option value="">Escolha…</option>
                  {EMPRESAS_SEL.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-ink-700">Departamento</span>
                <input className="input" value={departamento} onChange={(e) => setDepartamento(e.target.value)} />
              </label>
            </div>
            {duplicado && (
              <label className="flex items-start gap-2 rounded-lg bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                <input type="checkbox" className="mt-1" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
                <span>Já existe um cargo com esse nome nessa empresa. Marque para substituir o conteúdo dele pelo do PDF.</span>
              </label>
            )}
            {msg && <p className="text-sm text-red-700">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={salvando} onClick={aoFechar}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" disabled={salvando} onClick={criar}>
                {salvando ? "Salvando…" : duplicado && substituir ? "Substituir cargo" : "Criar cargo no modelo"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
