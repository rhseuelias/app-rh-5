"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

const ITENS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/candidatos", label: "Pré-cadastro", icon: "📝" },
  { href: "/colaboradores", label: "Colaboradores", icon: "👥" },
  { href: "/onboarding", label: "Painel de Integração", icon: "✅" },
  { href: "/calendario", label: "Calendário Geral", icon: "🗓️" },
  { href: "/ferias", label: "Férias", icon: "🏖️" },
  { href: "/departamento-pessoal/beneficios", label: "Departamento Pessoal", icon: "🎁" },
  { href: "/aniversarios", label: "Aniversários", icon: "🎂" },
  { href: "/projecao-custo", label: "Projeção de Custo", icon: "💰" },
];

export default function Sidebar({ papel }: { papel?: string | null }) {
  const pathname = usePathname();
  const itens = papel === "assistente" ? ITENS.filter((i) => i.href !== "/projecao-custo") : ITENS;

  return (
    <aside className="w-64 shrink-0 bg-ink-900 min-h-screen flex flex-col">
      <div className="px-5 py-6 border-b border-white/10">
        <h1 className="font-display font-bold text-white text-lg leading-tight">
          AppliQ RH
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Gestão de pessoas que gera resultados</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {itens.map((item) => {
          const ativo = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                ativo
                  ? "bg-brand-500/15 text-brand-300 border-brand-400/40"
                  : "text-slate-300 border-transparent hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-2">
        <a
          href="/api/backup"
          className="block text-center text-xs text-slate-300 hover:bg-white/5 hover:text-white rounded-xl py-2.5 border border-white/10 transition-colors"
        >
          ⬇️ Exportar backup
        </a>
      </div>
      <form action={logout} className="px-3 pb-5">
        <button className="w-full text-left px-3.5 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white rounded-xl transition-colors">
          🚪 Sair
        </button>
      </form>
    </aside>
  );
}
