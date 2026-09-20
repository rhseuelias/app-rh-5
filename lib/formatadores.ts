/**
 * Funções de formatação (máscara) e conversão para CPF, CNPJ e moeda (R$).
 * Usadas nos campos de formulário (components/campos/) e na geração da
 * Ficha de Admissão (PDF/Excel).
 */

export function apenasDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

export function formatarCPF(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatarCNPJ(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Formata como CPF (11 dígitos) ou CNPJ (12+ dígitos), conforme o tamanho digitado. */
export function formatarCpfOuCnpj(valor: string, tipo: "CLT" | "PJ"): string {
  return tipo === "PJ" ? formatarCNPJ(valor) : formatarCPF(valor);
}

/** Converte centavos digitados (string só de números) para um valor decimal em reais. */
export function centavosParaReais(digitos: string): number {
  if (!digitos) return 0;
  return Number(digitos) / 100;
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata direto a partir dos dígitos (como o usuário está digitando). */
export function formatarReaisDosDigitos(digitos: string): string {
  return formatarReais(centavosParaReais(digitos));
}

/** Converte um valor numérico (ex.: vindo do banco, 1234.5) para a string de dígitos em centavos ("123450"), usada para inicializar o campo mascarado. */
export function reaisParaDigitos(valor?: number | null): string {
  if (!valor) return "";
  return Math.round(valor * 100).toString();
}
