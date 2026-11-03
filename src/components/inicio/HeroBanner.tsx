import type { CSSProperties } from 'react';
import { ArrowRight, FilePlus2, FileText } from 'lucide-react';
import { Link } from 'react-router';

const heroSrc = `${import.meta.env.BASE_URL}hero.png`;

export function HeroBanner() {
  return (
    <section className="hero-card rise" style={{ animationDelay: '60ms' }} aria-labelledby="hero-title">
      <span aria-hidden="true" className="hero-circle -right-24 -top-28 size-[340px] bg-white/35" />
      <span aria-hidden="true" className="hero-circle right-40 -bottom-40 size-[300px] bg-[#ffd9bf]/40" />
      <span aria-hidden="true" className="hero-circle -bottom-24 -left-20 size-[220px] bg-white/30" />

      <div className="flex flex-col items-center gap-2 px-6 py-6 sm:flex-row sm:justify-between sm:px-7 sm:py-5">
        <div className="flex w-full min-w-0 items-start gap-5 sm:w-auto sm:items-center">
          <span aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-[14px] bg-white text-mac-accent shadow-[0_1px_2px_rgb(0_0_0/6%),0_6px_16px_rgb(204_74_11/12%)]">
            <FilePlus2 size={24} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 id="hero-title" className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-mac-ink">Crea una nueva cotización</h2>
            <p className="mt-1.5 text-[13px] text-mac-ink-2">Captura al cliente, su vehículo y las refacciones en unos minutos.</p>
            <Link
              to="/nueva-cotizacion"
              data-testid="inicio-nueva-cotizacion"
              className="inicio-btn mt-4 inline-flex h-10 items-center gap-2 rounded-[10px] bg-mac-accent px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgb(120_40_0/35%),inset_0_1px_0_rgb(255_255_255/18%)] hover:bg-mac-accent-hover"
            >
              <FileText size={15} aria-hidden="true" />
              Nueva cotización
              <ArrowRight size={15} aria-hidden="true" className="inicio-cta-arrow" />
            </Link>
          </div>
        </div>

        <div className="hero-in" style={{ '--hero-src': `url("${heroSrc}")` } as CSSProperties}>
          <div className="hero-glow" />
          <div className="hero-shadow" />
          <div className="hero-float">
            <img src={heroSrc} alt="" aria-hidden="true" draggable={false} />
            <div className="hero-shine" />
          </div>
        </div>
      </div>
    </section>
  );
}
