import React from 'react';
import ReactDOM from 'react-dom/client';
import { WelcomeScreen } from './components/boot/WelcomeScreen';
import { bootData, finishBoot, startFresh } from './storage/dataBoot';
import type { BootResult } from './storage/dataBoot';
import { preloadPdfWhenIdle } from './utils/pdfPreload';
import './styles.css';
import './styles/focus.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(<div role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#6b7280' }}>Cargando JC Motors…</div>);

// Los servicios se crean al importar App, así que se importa DESPUÉS de decidir el backend (SQLite o localStorage).
async function launch(result: BootResult) {
  finishBoot(result);
  preloadPdfWhenIdle();
  const { default: App } = await import('./App');
  root.render(<React.StrictMode><App /></React.StrictMode>);
}

void bootData().then((result) => {
  if (result.state !== 'needs-welcome') return launch(result);
  root.render(<WelcomeScreen
    onStartFresh={async () => { await startFresh(); await launch({ state: 'ready' }); }}
    onRestored={() => window.location.reload()}
  />);
});
