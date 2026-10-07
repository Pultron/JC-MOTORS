import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, description, icon, children, className = '' }: SectionCardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start gap-3">
        {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">{icon}</span>}
        <div>
          <h2 className="font-bold text-navy-950">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
