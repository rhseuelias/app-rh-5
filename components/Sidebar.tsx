"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

const ITENS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/colaboradores", label: "Colaboradores", icon: "👥" },
  { href: "/onboarding", label: "Painel de Integração", icon: "✅" },
  { href: "/calendario", label: "Calendário Geral", icon: "🗓️" },
  { href: "/ferias", label: "Férias", icon: "🏖️" },
  { href: "/departamento-pessoal", label: "Departamento Pessoal", icon: "🎁" },
  { href: "/aniversarios", label: "Aniversários", icon: "🎂" },
  { href: "/projecao-custo", label: "Projeção de Custo", icon: "💰" },
  { href: "/relatorio-salarios", label: "Relatório de Salários", icon: "📄" },
];

export default function Sidebar({ papel }: { papel?: string | null }) {
  const pathname = usePathname();
  // perfil "assistente" (ex.: Francielle) não vê Projeção de Custo, Departamento Pessoal nem Relatório de Salários
  const ESCONDIDOS_ASSISTENTE = ["/projecao-custo", "/departamento-pessoal", "/relatorio-salarios"];
  const itens = papel === "assistente" ? ITENS.filter((i) => !ESCONDIDOS_ASSISTENTE.includes(i.href)) : ITENS;

  // menu recolhível: a escolha fica guardada neste navegador
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem("menu-recolhido") === "1");
    } catch {
      /* sem armazenamento: segue aberto */
    }
  }, []);
  function alternarMenu() {
    setRecolhido((v) => {
      const novo = !v;
      try {
        localStorage.setItem("menu-recolhido", novo ? "1" : "0");
      } catch {
        /* ignora */
      }
      return novo;
    });
  }

  return (
    <aside className="w-64 shrink-0 bg-ink-900 min-h-screen flex flex-col print:hidden">
      <div className="px-5 py-6 border-b border-white/10">
        <h1 className="font-display font-bold text-white text-lg leading-tight">
          AppliQ RH
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Gestão de pessoas que gera resultados</p>
      </div>
      <nav className={`flex-1 py-4 space-y-1.5 overflow-y-auto ${recolhido ? "px-2" : "px-3"}`}>
        {itens.map((item) => {
          const ativo = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={recolhido ? item.label : undefined}
              aria-label={recolhido ? item.label : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-colors ${
                recolhido ? "justify-center py-2.5" : "gap-3 px-3.5 py-2.5"
              } ${ativo ? "bg-ink-800 text-brand-50" : "text-ink-800 hover:bg-white/30"}`}
            >
              <span className="shrink-0">
                <Icone nome={item.icon} />
              </span>
              {!recolhido && item.label}
            </Link>
          );
        })}
      </nav>
      <div className={`pb-2 ${recolhido ? "px-2" : "px-3"}`}>
        <a
          href="/api/backup"
          title={recolhido ? "Exportar backup" : undefined}
          aria-label={recolhido ? "Exportar backup" : undefined}
          className="flex items-center justify-center gap-2 text-xs text-ink-800 hover:bg-white/30 rounded-xl py-2.5 border border-ink-800/25 transition-colors"
        >
          <Icone nome="backup" />
          {!recolhido && "Exportar backup"}
        </a>
      </div>
      <form action={logout} className={`pb-5 ${recolhido ? "px-2" : "px-3"}`}>
        <button
          title={recolhido ? "Sair" : undefined}
          aria-label={recolhido ? "Sair" : undefined}
          className={`w-full flex items-center text-sm text-ink-800 hover:bg-white/30 rounded-xl transition-colors ${
            recolhido ? "justify-center py-2.5" : "gap-3 text-left px-3.5 py-2.5"
          }`}
        >
          <Icone nome="sair" />
          {!recolhido && "Sair"}
        </button>
      </form>
    </aside>
  );
}
