/** Esqueleto mostrado enquanto o Painel de RH carrega. */
const bloco = "rounded-[12px] border border-[#f1e4d6] bg-white";
const faixa = "rounded-[6px] bg-[#f4ebe1] animate-pulse";

export default function CarregandoDashboard() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando painel">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <div className={`${faixa} h-9 w-56`} />
          <div className={`${faixa} h-4 w-72`} />
        </div>
        <div className={`${faixa} h-9 w-64`} />
      </div>

      <div className={`${bloco} p-6 grid grid-cols-2 lg:grid-cols-5 gap-6`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className={`${faixa} h-3 w-24`} />
            <div className={`${faixa} h-9 w-20`} />
            <div className={`${faixa} h-3 w-32`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr_1fr] gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${bloco} p-6 space-y-3`}>
            <div className={`${faixa} h-4 w-40`} />
            {Array.from({ length: 5 }).map((__, j) => (
              <div key={j} className={`${faixa} h-5 w-full`} />
            ))}
          </div>
        ))}
      </div>

      <div className={`${bloco} p-6 space-y-3`}>
        <div className={`${faixa} h-4 w-48`} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${faixa} h-6 w-full`} />
        ))}
      </div>
    </div>
  );
}
