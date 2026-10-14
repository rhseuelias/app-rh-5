"use client";

import { useState } from "react";
import { apenasDigitos } from "@/lib/formatadores";

export interface ValoresCadastrais {
  razao_social?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

function formatarCEP(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Campos de dados cadastrais (razão social, CEP e endereço) de uma empresa ou
 * unidade. Ao digitar o CEP completo, tenta preencher rua, bairro, cidade e UF
 * sozinho; se não conseguir, é só preencher à mão.
 * Os nomes dos campos (razao_social, cep, endereco...) são lidos pelo servidor.
 */
export default function DadosCadastraisCampos({
  valores,
  idBase,
  rotuloRazao = "Razão social",
  dicaRazao,
}: {
  valores?: ValoresCadastrais;
  idBase: string;
  rotuloRazao?: string;
  dicaRazao?: string;
}) {
  const [v, setV] = useState({
    razao_social: valores?.razao_social ?? "",
    cep: formatarCEP(valores?.cep ?? ""),
    endereco: valores?.endereco ?? "",
    numero: valores?.numero ?? "",
    complemento: valores?.complemento ?? "",
    bairro: valores?.bairro ?? "",
    cidade: valores?.cidade ?? "",
    uf: valores?.uf ?? "",
  });
  const [buscando, setBuscando] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);

  function mudar(campo: keyof typeof v, valor: string) {
    setV((atual) => ({ ...atual, [campo]: valor }));
  }

  async function buscarCep(cepDigitado: string) {
    const digitos = apenasDigitos(cepDigitado);
    if (digitos.length !== 8) return;
    setBuscando(true);
    setAvisoCep(null);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const dados = (await resposta.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (dados.erro) {
        setAvisoCep("CEP não encontrado. Preencha o endereço à mão.");
      } else {
        setV((atual) => ({
          ...atual,
          endereco: dados.logradouro || atual.endereco,
          bairro: dados.bairro || atual.bairro,
          cidade: dados.localidade || atual.cidade,
          uf: (dados.uf || atual.uf).toUpperCase(),
        }));
      }
    } catch {
      setAvisoCep("Não consegui buscar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
      <div className="md:col-span-4">
        <label className="label" htmlFor={`${idBase}-razao`}>
          {rotuloRazao}
        </label>
        <input
          id={`${idBase}-razao`}
          name="razao_social"
          className="input"
          value={v.razao_social}
          onChange={(e) => mudar("razao_social", e.target.value)}
        />
        {dicaRazao && <p className="text-xs text-slate-400 mt-1">{dicaRazao}</p>}
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor={`${idBase}-cep`}>
          CEP {buscando && <span className="text-slate-400 font-normal">(buscando…)</span>}
        </label>
        <input
          id={`${idBase}-cep`}
          name="cep"
          inputMode="numeric"
          placeholder="00000-000"
          className="input"
          value={v.cep}
          onChange={(e) => {
            const novo = formatarCEP(e.target.value);
            mudar("cep", novo);
            void buscarCep(novo);
          }}
        />
        {avisoCep && <p className="text-xs text-amber-700 mt-1">{avisoCep}</p>}
      </div>

      <div className="md:col-span-3">
        <label className="label" htmlFor={`${idBase}-endereco`}>
          Endereço (rua)
        </label>
        <input
          id={`${idBase}-endereco`}
          name="endereco"
          className="input"
          value={v.endereco}
          onChange={(e) => mudar("endereco", e.target.value)}
        />
      </div>
      <div className="md:col-span-1">
        <label className="label" htmlFor={`${idBase}-numero`}>
          Número
        </label>
        <input
          id={`${idBase}-numero`}
          name="numero"
          className="input"
          value={v.numero}
          onChange={(e) => mudar("numero", e.target.value)}
        />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor={`${idBase}-complemento`}>
          Complemento
        </label>
        <input
          id={`${idBase}-complemento`}
          name="complemento"
          className="input"
          value={v.complemento}
          onChange={(e) => mudar("complemento", e.target.value)}
        />
      </div>

      <div className="md:col-span-2">
        <label className="label" htmlFor={`${idBase}-bairro`}>
          Bairro
        </label>
        <input
          id={`${idBase}-bairro`}
          name="bairro"
          className="input"
          value={v.bairro}
          onChange={(e) => mudar("bairro", e.target.value)}
        />
      </div>
      <div className="md:col-span-3">
        <label className="label" htmlFor={`${idBase}-cidade`}>
          Cidade
        </label>
        <input
          id={`${idBase}-cidade`}
          name="cidade"
          className="input"
          value={v.cidade}
          onChange={(e) => mudar("cidade", e.target.value)}
        />
      </div>
      <div className="md:col-span-1">
        <label className="label" htmlFor={`${idBase}-uf`}>
          UF
        </label>
        <input
          id={`${idBase}-uf`}
          name="uf"
          maxLength={2}
          className="input uppercase"
          value={v.uf}
          onChange={(e) => mudar("uf", e.target.value.toUpperCase())}
        />
      </div>
    </div>
  );
}
