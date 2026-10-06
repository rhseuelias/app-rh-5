"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import LogoAppliq from "@/components/LogoAppliq";

type IconeNome =
  | "dashboard"
  | "colaboradores"
  | "integracao"
  | "calendario"
  | "ferias"
  | "departamento"
  | "aniversarios"
  | "custo"
  | "relatorio"
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
    case "relatorio":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
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
  { href: "/previsao-ferias", label: "Previsão de Férias", icon: "relatorio" },
  { href: "/departamento-pessoal", label: "Departamento Pessoal", icon: "departamento" },
  { href: "/aniversarios", label: "Aniversários", icon: "aniversarios" },
  { href: "/projecao-custo", label: "Projeção de Custo", icon: "custo" },
  { href: "/relatorio-salarios", label: "Relatório de Salários", icon: "relatorio" },
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
  // deixa a tela saber se o menu está recolhido (a grade de lançamentos usa isso para ocupar a tela toda)
  useEffect(() => {
    document.documentElement.dataset.menu = recolhido ? "recolhido" : "aberto";
  }, [recolhido]);
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
    <aside
      className={`${recolhido ? "w-[68px]" : "w-64"} shrink-0 bg-[#2B2118] min-h-screen flex flex-col transition-[width] duration-200 print:hidden`}
    >
      <div className={`border-b border-white/10 ${recolhido ? "px-2 py-4 flex justify-center" : "px-5 py-6"}`}>
        {recolhido ? (
          <button
            type="button"
            onClick={alternarMenu}
            aria-label="Expandir menu"
            title="Expandir menu"
            className="w-9 h-9 rounded-lg border border-white/15 bg-transparent hover:bg-white/[.06] flex items-center justify-center text-[#a39a91] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <LogoAppliq escuro tamanho={26} slogan />
            <button
              type="button"
              onClick={alternarMenu}
              aria-label="Recolher menu"
              title="Recolher menu"
              className="shrink-0 w-8 h-8 rounded-lg border border-white/15 bg-transparent hover:bg-white/[.06] flex items-center justify-center text-[#a39a91] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>
        )}
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
              className={`flex items-center rounded-[9px] text-sm font-medium transition-colors ${
                recolhido ? "justify-center py-2.5" : "gap-3 px-3.5 py-2.5"
              } ${ativo ? "bg-[#A85822] text-white" : "text-[#d9d2ca] hover:bg-white/[.06]"}`}
            >
              <span className="shrink-0">
                <Icone nome={item.icon} />
              </span>
              {!recolhido && item.label}
            </Link>
          );
        })}
      </nav>
      <div className={`pb-1 pt-3 border-t border-white/10 ${recolhido ? "px-2" : "px-3"}`}>
        <a
          href="/api/backup"
          title={recolhido ? "Exportar backup" : undefined}
          aria-label={recolhido ? "Exportar backup" : undefined}
          className={`flex items-center gap-3 text-sm text-[#d9d2ca] hover:bg-white/[.06] rounded-[9px] transition-colors ${
            recolhido ? "justify-center py-2.5" : "px-3.5 py-2.5"
          }`}
        >
          <Icone nome="backup" />
          {!recolhido && "Exportar backup"}
        </a>
      </div>
      <form action={logout} className={`pb-5 ${recolhido ? "px-2" : "px-3"}`}>
        <button
          title={recolhido ? "Sair" : undefined}
          aria-label={recolhido ? "Sair" : undefined}
          className={`w-full flex items-center text-sm text-[#d9d2ca] hover:bg-white/[.06] rounded-[9px] transition-colors ${
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
