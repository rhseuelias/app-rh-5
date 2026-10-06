// Logo do Appliq RH: símbolo de blocos (laranja queimado, grafite, verde) + nome.
// Use escuro={true} quando o fundo for escuro (ex.: menu lateral).
export default function LogoAppliq({
  escuro = false,
  tamanho = 28,
  slogan = false,
  className = "",
}: {
  escuro?: boolean;
  tamanho?: number;
  slogan?: boolean;
  className?: string;
}) {
  const texto = escuro ? "#FAF6F0" : "#2B2118";
  const bloco2 = escuro ? "#FAF6F0" : "#2B2118";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={tamanho * 0.95}
        height={tamanho * 1.05}
        viewBox="0 0 58 64"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="0" y="2" width="26" height="60" rx="8" fill="#A85822" />
        <rect x="32" y="2" width="26" height="28" rx="8" fill={bloco2} />
        <rect x="32" y="34" width="26" height="28" rx="8" fill="#3B7D48" />
      </svg>
      <div>
        <p
          role="heading"
          aria-level={1}
          className="font-sans font-extrabold leading-none"
          style={{ color: texto, fontSize: tamanho, letterSpacing: "-0.04em", textTransform: "none" }}
        >
          Appliq RH
        </p>
        {slogan && (
          <p className="mt-1 text-xs" style={{ color: escuro ? "#BFB3A5" : "#6B5A4A" }}>
            RH organizado, fácil de usar.
          </p>
        )}
      </div>
    </div>
  );
}
