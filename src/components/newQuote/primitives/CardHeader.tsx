import type { ReactNode } from 'react';

interface Props { icon: ReactNode; title: string; subtitle?: string; id?: string }

export function CardHeader({ icon, title, subtitle, id }: Props) {
  return <div className="flex items-center gap-3 px-4 py-3.5">
    <span aria-hidden="true" className="flex size-8 flex-none items-center justify-center rounded-lg bg-mac-tint text-mac-accent-text">{icon}</span>
    <div className="min-w-0">
      <h2 id={id} className="text-base font-semibold leading-tight text-mac-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-mac-ink-2">{subtitle}</p>}
    </div>
  </div>;
}
