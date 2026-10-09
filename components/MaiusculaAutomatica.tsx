"use client";

import { useEffect } from "react";

/**
 * Deixa em MAIÚSCULAS, na hora em que a pessoa digita ou cola, todo campo de
 * texto do sistema. Ficam de fora: e-mail, senha, endereços de site, números,
 * datas, caixas de busca e áreas de texto (observações).
 * Para um campo específico não mudar, use o atributo data-sem-maiuscula.
 */
const NOMES_EXCLUIDOS = /mail|senha|password|url|link|http|token|chave|site|instagram|pix|usuario|login|busca|pesquis|filtr/i;

function deveFicarMaiusculo(el: HTMLInputElement): boolean {
  if (el.hasAttribute("data-sem-maiuscula")) return false;
  const tipo = (el.getAttribute("type") ?? "text").toLowerCase();
  if (tipo !== "text") return false;
  const modo = (el.getAttribute("inputmode") ?? "").toLowerCase();
  if (["numeric", "decimal", "tel", "email", "url", "search"].includes(modo)) return false;
  const pista = [el.name, el.id, el.placeholder, el.getAttribute("aria-label") ?? "", el.autocomplete].join(" ");
  if (NOMES_EXCLUIDOS.test(pista)) return false;
  if (/^https?:\/\//i.test(el.value) || el.value.includes("@")) return false;
  return true;
}

export default function MaiusculaAutomatica() {
  useEffect(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    function aoDigitar(ev: Event) {
      const alvo = ev.target;
      if (!(alvo instanceof HTMLInputElement)) return;
      if ((ev as InputEvent).isComposing) return;
      if (!deveFicarMaiusculo(alvo)) return;
      const atual = alvo.value;
      const maiusculo = atual.toLocaleUpperCase("pt-BR");
      if (maiusculo === atual) return;

      let ini: number | null = null;
      let fim: number | null = null;
      try {
        ini = alvo.selectionStart;
        fim = alvo.selectionEnd;
      } catch {
        /* alguns tipos não têm cursor */
      }
      // usa o "setter" original para o React perceber a mudança e atualizar o campo
      if (setter) setter.call(alvo, maiusculo);
      else alvo.value = maiusculo;
      try {
        if (ini !== null && fim !== null) alvo.setSelectionRange(ini, fim);
      } catch {
        /* ignora */
      }
    }

    // fase de captura: roda antes do React ler o valor digitado
    document.addEventListener("input", aoDigitar, true);
    return () => document.removeEventListener("input", aoDigitar, true);
  }, []);

  return null;
}
