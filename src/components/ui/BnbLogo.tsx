interface BnbLogoProps {
  className?: string;
  size?: number;
}

/**
 * Logomarca oficial da plataforma "estudaê" mantendo a paleta de cores característica:
 * - Fundo Rubi (#A6193C)
 * - Moldura e Acento Circunflexo (^) Laranja Vibrante (#F68B1F)
 * - Livro aberto estilizado em Branco (#FFFFFF) simbolizando qualquer edital e aprovação
 */
export function BnbLogo({ className = 'size-8', size }: BnbLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={size}
      height={size}
      aria-label="estudaê"
      role="img"
    >
      <rect width="64" height="64" rx="14" fill="#A6193C" />
      <rect x="5.5" y="5.5" width="53" height="53" rx="11" stroke="#F68B1F" strokeWidth={3.5} />
      {/* Acento circunflexo (^) do "estudaê" / Seta de aprovação */}
      <path
        d="M20 24 L32 14 L44 24 L40.5 27.5 L32 20.5 L23.5 27.5 Z"
        fill="#F68B1F"
      />
      <circle cx="32" cy="25.5" r="2.6" fill="#FFFFFF" />
      {/* Livro aberto estilizado (Edital Verticalizado / Estudos) */}
      <path
        d="M15 31 C21 31 27 33 30.5 36.5 L30.5 48.5 C27 45.5 21 43.8 15 43.8 Z"
        fill="#FFFFFF"
      />
      <path
        d="M49 31 C43 31 37 33 33.5 36.5 L33.5 48.5 C37 45.5 43 43.8 49 43.8 Z"
        fill="#FFFFFF"
      />
      <path
        d="M18 47.5 C23 47.5 28 49 32 51.5 C36 49 41 47.5 46 47.5"
        stroke="#F68B1F"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export const EstudaeLogo = BnbLogo;
