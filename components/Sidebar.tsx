"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";

type IconeNome =
  | "dashboard"
  | "colaboradores"
  | "integracao"
  | "calendario"
  | "ferias"
  | "departamento"
  | "aniversarios"
  | "custo"
  | "backup"
  | "sair";

// Ícones de linha simples (sem biblioteca externa)
function Icone({ nome }: { nome: IconeNome }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (nome) {
    case "dashboard":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "colaboradores":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "integracao":
      return (
        <svg {...props}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case "calendario":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "ferias":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      );
    case "departamento":
      return (
        <svg {...props}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "aniversarios":
      return (
        <svg {...props}>
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      );
    case "custo":
      return (
        <svg {...props}>
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "backup":
      return (
        <svg {...props}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    case "sair":
      return (
        <svg {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
  }
}

const ITENS: { href: string; label: string; icon: IconeNome }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/colaboradores", label: "Colaboradores", icon: "colaboradores" },
  { href: "/onboarding", label: "Painel de Integração", icon: "integracao" },
  { href: "/calendario", label: "Calendário Geral", icon: "calendario" },
  { href: "/ferias", label: "Férias", icon: "ferias" },
  { href: "/departamento-pessoal", label: "Departamento Pessoal", icon: "departamento" },
  { href: "/aniversarios", label: "Aniversários", icon: "aniversarios" },
  { href: "/projecao-custo", label: "Projeção de Custo", icon: "custo" },
];

export default function Sidebar({ papel }: { papel?: string | null }) {
  const pathname = usePathname();
  // perfil "assistente" (ex.: Francielle) não vê Projeção de Custo nem Departamento Pessoal
  const ESCONDIDOS_ASSISTENTE = ["/projecao-custo", "/departamento-pessoal"];
  const itens = papel === "assistente" ? ITENS.filter((i) => !ESCONDIDOS_ASSISTENTE.includes(i.href)) : ITENS;

  return (
    <aside className="w-64 shrink-0 bg-brand-400 min-h-screen flex flex-col">
      <div className="px-5 py-6 border-b border-ink-800/15">
        <h1 className="font-display font-bold text-ink-900 text-2xl leading-tight uppercase">
          AppliQ RH
        </h1>
        <p className="text-xs text-ink-800 mt-1">Gestão de pessoas que gera resultados</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {itens.map((item) => {
          const ativo = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                ativo
                  ? "bg-ink-800 text-brand-50"
                  : "text-ink-800 hover:bg-white/30"
              }`}
            >
              <span className="shrink-0">
                <Icone nome={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-2">
        <a
          href="/api/backup"
          className="flex items-center justify-center gap-2 text-xs text-ink-800 hover:bg-white/30 rounded-xl py-2.5 border border-ink-800/25 transition-colors"
        >
          <Icone nome="backup" />
          Exportar backup
        </a>
      </div>
      <form action={logout} className="px-3 pb-5">
        <button className="w-full flex items-center gap-3 text-left px-3.5 py-2.5 text-sm text-ink-800 hover:bg-white/30 rounded-xl transition-colors">
          <Icone nome="sair" />
          Sair
        </button>
      </form>
    </aside>
  );
}
