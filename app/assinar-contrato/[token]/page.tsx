import { buscarContratoParaAssinarPorToken } from "@/lib/actions-assinatura-pj";
import { ehAlphaville } from "@/lib/contrato-pj";
import AssinarContratoForm from "@/components/AssinarContratoForm";

export const dynamic = "force-dynamic";

export default async function AssinarContratoPage({ params }: { params: { token: string } }) {
  const resultado = await buscarContratoParaAssinarPorToken(params.token);

  if (!resultado) {
    return (
      <MensagemCentral titulo="Link inválido">
        Este link de assinatura não existe ou não é mais válido. Fale com quem te enviou o link para
        conseguir um novo.
      </MensagemCentral>
    );
  }

  const { colaborador, unidade } = resultado;

  if (colaborador.assinatura_pj_assinado_em) {
    return (
      <MensagemCentral titulo="Contrato já assinado">
        Você já assinou este contrato em{" "}
        {new Date(colaborador.assinatura_pj_assinado_em).toLocaleString("pt-BR")}. Se precisar de uma cópia
        ou assinar de novo, fale com o RH.
      </MensagemCentral>
    );
  }

  if (ehAlphaville(unidade?.nome ?? null)) {
    return (
      <MensagemCentral titulo="Link não disponível">
        Esse modelo de contrato ainda não está pronto pra essa unidade. Fale com o RH.
      </MensagemCentral>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <div className="bg-ink-900 px-4 py-10">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-400/40 text-xl mb-4">
            ✍️
          </div>
          <h1 className="text-3xl font-display font-bold text-white">Assinatura do contrato</h1>
          <p className="text-slate-400 text-sm mt-2">
            Olá, {colaborador.nome}! Revise o contrato e assine abaixo — sua assinatura entra automaticamente
            em todas as páginas.
          </p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AssinarContratoForm token={params.token} nomeProfissional={colaborador.nome} />
      </div>
    </div>
  );
}

function MensagemCentral({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center px-4">
      <div className="card max-w-md text-center">
        <h1 className="text-xl font-display font-bold text-slate-900 mb-2">{titulo}</h1>
        <p className="text-sm text-slate-600">{children}</p>
      </div>
    </div>
  );
}
