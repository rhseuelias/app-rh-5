/** "inline" quando o link traz ?inline=1 (pré-visualização); senão baixa o arquivo. */
export function disposicaoPdf(req: Request, nomeArquivo: string): string {
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return `${inline ? "inline" : "attachment"}; filename="${nomeArquivo}"`;
}
