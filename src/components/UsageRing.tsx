/** Anillo de progreso de uso (v2.1): coral normal, ámbar ≥80%, rojo ≥95%. */
export function UsageRing({
  pct,
  label,
  title,
  size = 34,
}: {
  pct: number;
  label: string;
  title: string;
  size?: number;
}) {
  const level = pct >= 95 ? 'var(--error)' : pct >= 80 ? 'var(--warn)' : 'var(--primary)';
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, pct) / 100) * c;

  return (
    <span
      className="flex flex-col items-center gap-0.5"
      title={title}
      role="status"
      aria-label={title}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="3.5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={level}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 300ms ease, stroke 200ms' }}
        />
        <text
          x="50%"
          y="54%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fill="currentColor"
          className="text-fg"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span className="text-[10px] leading-none text-muted-fg">{label}</span>
    </span>
  );
}
