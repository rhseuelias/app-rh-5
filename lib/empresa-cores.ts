export interface CorEmpresa {
  /** cor sólida — usada em bordas, pontos e texto */
  cor: string;
  /** fundo clarinho da mesma cor — usado em etiquetas/badges */
  bg: string;
}

/** Paleta de reserva, usada em ordem pra qualquer empresa que não seja
 * BSE/BABOON/BDU (ex.: uma empresa nova que ainda não tem cor fixa). */
const PALETA_RESERVA: CorEmpresa[] = [
  { cor: "#0891b2", bg: "#ecfeff" }, // ciano
  { cor: "#db2777", bg: "#fdf2f8" }, // rosa
  { cor: "#65a30d", bg: "#f7fee7" }, // verde-lima
  { cor: "#ea580c", bg: "#fff7ed" }, // laranja
];

/** Cores fixas por empresa, pra manter a mesma identidade visual em
 * qualquer tela do sistema (Projeção de Custo, Relatório Dinâmico etc.). */
const CORES_FIXAS: { corresponde: RegExp; cor: CorEmpresa }[] = [
  { corresponde: /BSE|SEU\s*ELIAS/i, cor: { cor: "#2563eb", bg: "#eff6ff" } }, // azul
  { corresponde: /BABOON/i, cor: { cor: "#d97706", bg: "#fffbeb" } }, // âmbar
  { corresponde: /\bBDU\b/i, cor: { cor: "#7c3aed", bg: "#f5f3ff" } }, // violeta
];

/** Devolve a cor da empresa pelo nome — BSE/BABOON/BDU sempre com a
 * mesma cor fixa; qualquer outra empresa recebe uma cor da paleta de
 * reserva, escolhida pelo `indiceReserva` (ex.: a posição dela na lista). */
export function corDaEmpresa(nome: string, indiceReserva: number): CorEmpresa {
  const fixa = CORES_FIXAS.find((c) => c.corresponde.test(nome));
  if (fixa) return fixa.cor;
  return PALETA_RESERVA[indiceReserva % PALETA_RESERVA.length];
}
