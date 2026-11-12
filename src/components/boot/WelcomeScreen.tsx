export interface WelcomeScreenProps {
  /** El usuario eligió empezar con la base vacía. */
  onStartFresh: () => void | Promise<void>;
  /** Se restauró un respaldo y hay que cargar los datos. */
  onRestored: () => void;
}

/** Marcador de posición: la pantalla real (empezar desde cero / restaurar) la completa el paso de interfaz. */
export function WelcomeScreen({ onStartFresh }: WelcomeScreenProps) {
  return <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
    <div style={{ textAlign: 'center' }}>
      <h1>Bienvenido a JC Motors</h1>
      <button type="button" onClick={() => void onStartFresh()}>Empezar desde cero</button>
    </div>
  </main>;
}
