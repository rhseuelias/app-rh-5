import { CHECKLIST_HTML } from "@/lib/checklist-html";

export const dynamic = "force-dynamic";

// Página do Checklist de Fechamento: abre em /checklist (sem menu do app RH).
// O login e os dados ficam em /api/checklist/*.
export async function GET() {
  return new Response(CHECKLIST_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
