/** The product's signature element: a compatibility arc that draws in, with the number set inside it. */
export function CompatRing({ score, size = 84 }: { score: number; size?: number }) {
  const stroke = Math.max(5, size * 0.085);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const len = (Math.min(99, Math.max(0, score)) / 100) * c;
  const tone = score >= 80 ? "#1F7A6B" : score >= 65 ? "#7FD8BE" : "#8A80A6";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${score}% compatible`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEE8FF" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${len} ${c}`} className="arc-draw" style={{ ["--arc-len" as string]: `${len}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display font-extrabold" style={{ fontSize: size * 0.3 }}>{score}<span style={{ fontSize: size * 0.16 }}>%</span></span>
        {size >= 72 && <span className="mt-0.5 text-[10px] font-semibold text-ink-faint">match</span>}
      </div>
    </div>
  );
}
