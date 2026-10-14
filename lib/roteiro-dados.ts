import type { CargoDesc } from "@/lib/cargos";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Acha a descrição do cargo que combina com a vaga (mesmo nome; prefere a mesma empresa). */
export function acharCargo(cargos: CargoDesc[], nomeCargo: string, empresa: string): CargoDesc | null {
  const nome = norm(nomeCargo);
  const iguais = cargos.filter((c) => norm(c.cargo) === nome);
  return iguais.find((c) => c.empresa === empresa) ?? iguais[0] ?? null;
}

export function normalizarCargo(c: CargoDesc): CargoDesc {
  return {
    ...c,
    resp: c.resp ?? [],
    sucesso: c.sucesso ?? [],
    resultados: c.resultados ?? [],
    indicadores: c.indicadores ?? [],
    tecnicos: c.tecnicos ?? [],
    comportamentais: c.comportamentais ?? [],
    cenarios: c.cenarios ?? [],
  };
}

export const TOKEN_OK = /^[a-f0-9]{32,64}$/;
