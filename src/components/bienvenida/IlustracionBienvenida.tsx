import { useId } from 'react';

/** Decorative illustration of the welcome's left panel. Positions, colors and texts come from the approved design. */
export function IlustracionBienvenida() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const glowId = `ilGlow-${uid}`;
  const shadowId = `ilSh-${uid}`;
  return (
    <svg viewBox="0 0 400 580" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FF9A4D" stopOpacity=".5" /><stop offset="1" stopColor="#FF9A4D" stopOpacity="0" /></radialGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#000" floodOpacity=".32" /></filter>
      </defs>
      <ellipse className="bv-glow" cx="200" cy="290" rx="200" ry="250" fill={`url(#${glowId})`} />
      <g className="flota" style={{ animationDuration: '7s' }}>
        <g transform="translate(58 58) rotate(-5 84 100) scale(1.36)" filter={`url(#${shadowId})`}>
          <rect width="168" height="200" rx="14" fill="#fff" />
          <rect width="168" height="6" rx="3" fill="#F97316" />
          <circle cx="24" cy="32" r="11" fill="#13294B" />
          <text x="24" y="36" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fontWeight="800" fill="#F97316">JC</text>
          <text x="42" y="28" fontFamily="Inter, sans-serif" fontSize="7.5" fontWeight="600" letterSpacing=".08em" fill="#8A96A8">COTIZACIÓN</text>
          <text x="42" y="40" fontFamily="Inter, sans-serif" fontSize="12" fontWeight="700" fill="#13294B">JC-0001</text>
          <rect x="14" y="56" width="140" height="18" rx="5" fill="#13294B" />
          <rect x="22" y="63" width="40" height="4" rx="2" fill="rgba(255,255,255,.7)" />
          <rect x="122" y="63" width="24" height="4" rx="2" fill="rgba(255,255,255,.7)" />
          <rect x="22" y="84" width="74" height="5" rx="2.5" fill="#D6DDE8" /><rect x="118" y="84" width="28" height="5" rx="2.5" fill="#B9C4D4" />
          <rect x="22" y="100" width="58" height="5" rx="2.5" fill="#D6DDE8" /><rect x="118" y="100" width="28" height="5" rx="2.5" fill="#B9C4D4" />
          <rect x="14" y="112" width="140" height="18" rx="4" fill="#FFF4EA" />
          <rect x="14" y="112" width="3" height="18" fill="#F97316" />
          <rect x="24" y="119" width="66" height="5" rx="2.5" fill="#F7B98A" /><rect x="118" y="119" width="28" height="5" rx="2.5" fill="#F08A3C" />
          <rect x="14" y="152" width="140" height="34" rx="8" fill="#13294B" />
          <text x="26" y="173" fontFamily="Inter, sans-serif" fontSize="8.5" fontWeight="700" fill="#fff" letterSpacing=".04em">TOTAL</text>
          <text x="144" y="174" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="800" fill="#FF8A3C">$1,270.20</text>
          <circle cx="160" cy="8" r="15" fill="#30B05A" stroke="#fff" strokeWidth="3" />
          <path d="M153 8.5l4.5 4.5 9-9.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <g className="flota" style={{ animationDuration: '6s', animationDelay: '-2s' }}>
        <g transform="translate(190 356) scale(1.2)" filter={`url(#${shadowId})`}>
          <path d="M16 0h132a16 16 0 0 1 16 16v30a16 16 0 0 1-16 16H16l-8 8 2-9A16 16 0 0 1 0 46V16A16 16 0 0 1 16 0z" fill="#E3F6D8" />
          <rect x="12" y="12" width="28" height="34" rx="6" fill="#fff" />
          <path d="M19 19h10l4 4v16H19z" fill="none" stroke="#E5484D" strokeWidth="2" strokeLinejoin="round" />
          <text x="48" y="26" fontFamily="Inter, sans-serif" fontSize="9.5" fontWeight="700" fill="#1D3A26">Cotización JC-0001</text>
          <text x="48" y="39" fontFamily="Inter, sans-serif" fontSize="8" fill="#4E6B57">PDF · 84 KB</text>
          <text x="152" y="52" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="7.5" fill="#4E6B57">6:48 p.m.</text>
          <path d="M98 49l2.5 2.5 4.5-5 M102 49l2.5 2.5 4.5-5" fill="none" stroke="#2F9BE0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <g className="flota" style={{ animationDuration: '5.5s', animationDelay: '-1.2s' }}>
        <g transform="translate(52 404) scale(1.3)">
          <rect width="58" height="58" rx="16" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.22)" />
          <path d="M22 14h14v9H22z M18 23h22v20a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
          <rect x="25" y="17" width="3" height="3" fill="#fff" /><rect x="31" y="17" width="3" height="3" fill="#fff" />
          <path d="M29 30v9 M25.5 35.5L29 39l3.5-3.5" fill="none" stroke="#FF9A55" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <circle cx="40" cy="90" r="3" fill="#FF9A55" opacity=".8" />
      <circle cx="372" cy="250" r="2.5" fill="#fff" opacity=".6" />
      <circle cx="360" cy="520" r="3.5" fill="#FF9A55" opacity=".5" />
      <circle cx="160" cy="540" r="2" fill="#fff" opacity=".5" />
      <circle cx="24" cy="330" r="2" fill="#fff" opacity=".45" />
    </svg>
  );
}
