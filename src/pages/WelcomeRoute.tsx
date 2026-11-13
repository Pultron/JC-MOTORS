import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { resolveWelcomeGate } from '../services/welcomeGate';
import { BienvenidaPage } from './BienvenidaPage';

/** Until the welcome is completed every app route redirects to /bienvenida. Re-evaluated on each navigation. */
export function WelcomeGuard() {
  useLocation();
  return resolveWelcomeGate() === 'welcome' ? <Navigate to="/bienvenida" replace /> : <Outlet />;
}

/** Once completed (or on an install that already has data) /bienvenida goes to Inicio. Decided on mount only, so the last step stays visible after the flag is set. */
export function WelcomeRoute() {
  const [skip] = useState(() => resolveWelcomeGate() !== 'welcome');
  return skip ? <Navigate to="/" replace /> : <BienvenidaPage />;
}
