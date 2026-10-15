import type { CargoDesc } from "@/lib/cargos";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Acha, entre os cargos cadastrados em "Cargos", o que combina com o cargo da vaga.
 * 1) nome igual (prefere a mesma empresa); 2) um nome contém o outro (ex.: "Barbeiro" e "Barbeiro Pleno").
 */
export function cargoParecido<T extends Pick<CargoDesc, "cargo" | "empresa">>(cargos: T[], nomeCargo: string, empresa: string): T | null {
  const n = norm(nomeCargo);
  if (!n) return null;
  const iguais = cargos.filter((c) => norm(c.cargo) === n);
  if (iguais.length) return iguais.find((c) => c.empresa === empresa) ?? iguais[0];
  const parecidos = cargos.filter((c) => {
    const m = norm(c.cargo);
    return m.length >= 4 && (m.includes(n) || n.includes(m));
  });
  return parecidos.find((c) => c.empresa === empresa) ?? parecidos[0] ?? null;
}
