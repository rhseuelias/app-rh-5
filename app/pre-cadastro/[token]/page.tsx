import { buscarCandidatoPorToken } from "@/lib/actions-candidatos";
import PreCadastroForm from "@/components/PreCadastroForm";

export const dynamic = "force-dynamic";

export default async function PreCadastroPage({ params }: { params: { token: string } }) {
  const resultado = await buscarCandidatoPorToken(params.token);

  if (!resultado) {
    return (
      <MensagemCentral titulo="Link inválido">
        Este link de pré-cadastro não existe ou foi removido. Fale com quem te
        enviou o link para conseguir um novo.
      </MensagemCentral>
    );
  }

  const { candidato } = resultado;

  if (candidato.status === "convertido") {
    return (
      <MensagemCentral titulo="Cadastro já processado">
        Seu pré-cadastro já foi recebido e processado pelo RH. Se precisar
        alterar alguma informação, entre em contato diretamente com o RH.
      </MensagemCentral>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <div className="bg-ink-900 px-4 py-10">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-400/40 text-xl mb-4">
            📝
          </div>
          <h1 className="text-3xl font-display font-bold text-white">Pré-cadastro</h1>
          <p className="text-slate-400 text-sm mt-2">
            {candidato.cargo_pretendido
              ? `Bem-vindo(a)! Preencha seus dados para a vaga de ${candidato.cargo_pretendido}.`
              : "Bem-vindo(a)! Preencha seus dados abaixo."}
          </p>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <PreCadastroForm token={params.token} candidato={candidato} />
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
