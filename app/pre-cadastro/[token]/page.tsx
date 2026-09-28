// O Pré-cadastro foi retirado do app. Links antigos que já tinham sido
// enviados a candidatos mostram só este aviso (nada é salvo).
export default function PreCadastroDesativado() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="card max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold text-slate-900">Este link não está mais ativo</h1>
        <p className="text-slate-600">
          O preenchimento dos dados agora é feito por outro formulário. Fale com o RH do Grupo Seu Elias
          pra receber o link novo.
        </p>
      </div>
    </main>
  );
}
