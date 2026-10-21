import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-admin";
import SupervisorTela from "@/components/entrevistas/SupervisorTela";
import { montarRoteiro, normalizarResp, fmtNota } from "@/lib/roteiro";
import { acharCargo, normalizarCargo, TOKEN_OK } from "@/lib/roteiro-dados";
import { rotuloEmpresa, type Vaga } from "@/lib/entrevistas";
import type { CargoDesc } from "@/lib/cargos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Entrevista técnica — Grupo Seu Elias",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen bg-[#faf7f3] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#262626" }}>{titulo}</h1>
        <p style={{ fontSize: 14, color: "#5c5c5c", marginTop: 8 }}>{texto}</p>
      </div>
    </div>
  );
}

export default async function EntrevistaSupervisorPage({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!TOKEN_OK.test(token)) return <Aviso titulo="Link inválido" texto="Peça ao RH um link novo." />;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return <Aviso titulo="Indisponível" texto="Não foi possível abrir a entrevista agora." />;
  }

  const { data: ent } = await admin
    .from("sel_entrevistas")
    .select("id, candidato_id, etapa, data, hora, tipo, token_expira, respondida_em, roteiro, recomendacao")
    .eq("token", token)
    .maybeSingle();
  if (!ent) return <Aviso titulo="Link desativado" texto="Este link não funciona mais. Peça ao RH um link novo." />;
  if (ent.respondida_em) return <Aviso titulo="Entrevista já enviada" texto="O RH já recebeu as suas respostas. Obrigado!" />;
  if (!ent.token_expira || new Date(ent.token_expira).getTime() < Date.now()) return <Aviso titulo="Link expirado" texto="Peça ao RH um link novo." />;

  const { data: cand } = await admin.from("sel_candidatos").select("nome, vaga_id").eq("id", ent.candidato_id).maybeSingle();
  if (!cand) return <Aviso titulo="Candidato não encontrado" texto="Peça ao RH um link novo." />;
  const { data: vaga } = await admin.from("sel_vagas").select("*").eq("id", cand.vaga_id).maybeSingle();
  if (!vaga) return <Aviso titulo="Vaga não encontrada" texto="Peça ao RH um link novo." />;

  const { data: lista } = await admin.from("cargos_desc").select("*");
  const cargo = acharCargo(((lista ?? []) as CargoDesc[]).map(normalizarCargo), vaga.cargo, vaga.empresa);
  const roteiro = montarRoteiro(ent.etapa, cargo);

  // O que o RH registrou na 1ª etapa, para o supervisor aprofundar.
  const { data: rhs } = await admin
    .from("sel_entrevistas")
    .select("resumo, aprofundar, recomendacao, nota_media, data")
    .eq("candidato_id", ent.candidato_id)
    .eq("etapa", "Entrevista RH")
    .order("data", { ascending: false })
    .limit(1);
  const rh = rhs?.[0] ?? null;

  const [, mes, dia] = String(ent.data).split("-");
  return (
    <SupervisorTela
      token={token}
      candidato={cand.nome}
      cargo={vaga.cargo}
      empresa={rotuloEmpresa(vaga as Vaga)}
      quando={`${dia}/${mes} às ${String(ent.hora).slice(0, 5)}`}
      roteiro={roteiro}
      respInicial={normalizarResp(ent.roteiro)}
      recomendacaoInicial={ent.recomendacao ?? null}
      rh={
        rh
          ? {
              resumo: rh.resumo ?? null,
              aprofundar: rh.aprofundar ?? null,
              recomendacao: rh.recomendacao ?? null,
              nota: rh.nota_media === null || rh.nota_media === undefined ? null : fmtNota(Number(rh.nota_media)),
            }
          : null
      }
    />
  );
}
