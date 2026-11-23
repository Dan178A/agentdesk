/**
 * AgentLogo — marca «constelación»: un nodo central (el orquestador) conectado
 * a tres nodos satélite (los agentes). Coral con degradado suave a ámbar.
 */
export function AgentLogo({
  size = 28,
  className = '',
  mono = false,
}: {
  size?: number;
  className?: string;
  mono?: boolean;
}) {
  const id = mono ? 'agm' : 'agc';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="14" y1="12" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#D97757" />
          <stop offset="1" stopColor={mono ? '#D97757' : '#E8A87C'} />
        </linearGradient>
      </defs>
      {/* Conexiones: del orquestador a cada agente */}
      <g stroke={`url(#${id}-g)`} strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
        <path d="M32 38 32 12" />
        <path d="M32 38 12 51" />
        <path d="M32 38 52 51" />
      </g>
      {/* Halo del nodo central */}
      <circle cx="32" cy="38" r="12.5" stroke={`url(#${id}-g)`} strokeWidth="1.5" opacity="0.28" />
      {/* Nodos satélite */}
      <circle cx="32" cy="12" r="4.5" fill={`url(#${id}-g)`} />
      <circle cx="12" cy="51" r="4.5" fill={`url(#${id}-g)`} />
      <circle cx="52" cy="51" r="4.5" fill={`url(#${id}-g)`} />
      {/* Nodo central */}
      <circle cx="32" cy="38" r="7.5" fill={`url(#${id}-g)`} />
      <circle cx="29.5" cy="35.5" r="2" fill="#FAF9F5" opacity="0.85" />
    </svg>
  );
}
