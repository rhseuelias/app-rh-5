import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DepartamentoPessoalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Departamento Pessoal</h1>
        <p className="text-slate-500 text-sm">Escolha o módulo que deseja abrir.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/departamento-pessoal/beneficios"
          className="card hover:border-brand-300 transition-colors flex flex-col gap-2"
        >
          <span className="text-2xl">🎁</span>
          <span className="text-lg font-bold text-slate-900">Controle de Benefícios</span>
          <span className="text-sm text-slate-500">
            Vale-transporte, CAJU, alimentação, prêmio e outros benefícios lançados por colaborador, mês a mês.
          </span>
        </Link>

        <Link
          href="/departamento-pessoal/lancamentos"
          className="card hover:border-brand-300 transition-colors flex flex-col gap-2"
        >
          <span className="text-2xl">📊</span>
          <span className="text-lg font-bold text-slate-900">Lançamentos da Folha</span>
          <span className="text-sm text-slate-500">
            Uma grade única, estilo planilha, para lançar proventos, descontos e espelhamento de todos os funcionários de todas as
            empresas, com colunas que você mesmo cria e reordena.
          </span>
        </Link>
      </div>
    </div>
  );
}
