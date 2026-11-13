import { ChevronRight, FileDown, Flag, Lock } from 'lucide-react';

interface Props {
  onFresh: () => void;
  onRestore: () => void;
  disabled?: boolean;
}

/** Step 1: choose how to start. */
export function PasoInicio({ onFresh, onRestore, disabled }: Props) {
  return <div data-testid="welcome-step-inicio">
    <h1 className="bv-title">Bienvenido<br />a <span className="bv-title-accent">JC Motors</span></h1>
    <p className="bv-sub">Elige cómo quieres empezar.</p>
    <div className="bv-cards">
      <button type="button" className="bv-card" data-testid="welcome-fresh" disabled={disabled} onClick={onFresh}>
        <span className="bv-card-icon bv-card-icon--fresh"><Flag size={32} strokeWidth={2.2} fill="currentColor" aria-hidden="true" /></span>
        <span className="bv-card-text">
          <span className="bv-card-title">Empezar de cero</span>
          <span className="bv-card-desc">Configura los datos de tu taller y crea tu primera cotización.</span>
        </span>
        <ChevronRight className="bv-chevron" size={26} aria-hidden="true" />
      </button>
      <button type="button" className="bv-card" data-testid="welcome-restore" disabled={disabled} onClick={onRestore}>
        <span className="bv-card-icon bv-card-icon--restore"><FileDown size={32} strokeWidth={2} aria-hidden="true" /></span>
        <span className="bv-card-text">
          <span className="bv-card-title">Restaurar un respaldo</span>
          <span className="bv-card-desc">¿Cambiaste de computadora? Importa el archivo de tu USB.</span>
        </span>
        <ChevronRight className="bv-chevron" size={26} aria-hidden="true" />
      </button>
    </div>
    <p className="bv-foot">
      <Lock size={17} aria-hidden="true" />
      <span>Tus datos se guardan solo en esta computadora. Respáldalos en una USB desde la pantalla Respaldo.</span>
    </p>
  </div>;
}
