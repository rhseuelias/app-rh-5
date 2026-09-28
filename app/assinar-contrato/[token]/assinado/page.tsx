import { buscarContratoParaAssinarPorToken } from "@/lib/actions-assinatura-pj";

export const dynamic = "force-dynamic";

export default async function ContratoAssinadoPage({ params }: { params: { token: string } }) {
  const resultado = await buscarContratoParaAssinarPorToken(params.token);

  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center px-4">
      <div className="card max-w-md text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-display font-bold text-slate-900">Assinado com sucesso!</h1>
        <p className="text-sm text-slate-600">
          {resultado?.colaborador.assinatura_pj_assinado_em
            ? `Registrado em ${new Date(resultado.colaborador.assinatura_pj_assinado_em).toLocaleString(
                "pt-BR"
              )}.`
            : "Sua assinatura foi registrada."}{" "}
          O RH já pode ver o contrato assinado.
        </p>
        <a href={`/api/assinatura-pj/${params.token}/preview`} className="btn-secondary text-sm inline-block">
          ⬇️ Baixar minha cópia do contrato
        </a>
      </div>
    </div>
  );
}
