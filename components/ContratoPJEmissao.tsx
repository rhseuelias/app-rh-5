import Link from "next/link";
import { salvarAssinaturaProfissionalPJ } from "@/lib/actions-contrato-pj";

export default function ContratoPJEmissao({
  colaboradorId,
  bloqueadoMotivo,
  assinaturaUrl,
}: {
  colaboradorId: string;
  bloqueadoMotivo: string | null;
  assinaturaUrl: string | null;
}) {
  return (
    <div className="space-y-3 pt-3 border-t border-slate-100 mt-3">
      <h3 className="text-sm font-medium text-slate-700">📝 Emitir contrato</h3>

      {bloqueadoMotivo ? (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">{bloqueadoMotivo}</p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <a href={`/api/contratos-pj/${colaboradorId}/word`} className="btn-secondary text-sm">
              ⬇️ Baixar contrato (Word)
            </a>
            <Link href="/configuracoes/contrato-pj" className="text-xs text-brand-600 hover:underline">
              ⚙️ Configurar assinaturas fixas (Salão + testemunhas)
            </Link>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Assinatura do próprio profissional — entra automaticamente em todo contrato emitido pra ele:
            </p>
            {assinaturaUrl && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assinaturaUrl}
                  alt="Assinatura do profissional"
                  className="h-12 border border-slate-200 rounded-lg bg-white px-2"
                />
                <span className="text-xs text-emerald-600">✓ já cadastrada</span>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-xs text-brand-600">
                {assinaturaUrl ? "+ Trocar assinatura do profissional" : "+ Colar assinatura do profissional"}
              </summary>
              <form action={salvarAssinaturaProfissionalPJ} className="flex items-center gap-2 mt-2">
                <input type="hidden" name="colaborador_id" value={colaboradorId} />
                <input type="file" name="assinatura" accept="image/*" required className="input !py-1 text-sm" />
                <button type="submit" className="btn-secondary text-xs shrink-0">
                  Salvar
                </button>
              </form>
            </details>
          </div>
        </>
      )}
    </div>
  );
}
