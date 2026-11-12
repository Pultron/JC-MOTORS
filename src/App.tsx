import { Navigate, Outlet, RouterProvider, createHashRouter } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { ChoiceProvider } from './components/ui/ChoiceDialog';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';
import { Inicio } from './pages/Inicio';
import { NuevaCotizacionPage } from './pages/NuevaCotizacionPage';
import { HistoryPage } from './pages/HistoryPage';
import { QuotationDetailPage } from './pages/QuotationDetailPage';
import { CustomersPage } from './pages/CustomersPage';
import { FacturasPage } from './pages/FacturasPage';
import { InternalControlPage } from './pages/InternalControlPage';
import { InternalControlDetailPage } from './pages/InternalControlDetailPage';
import { BackupPage } from './pages/BackupPage';
import { WorkshopPage } from './pages/WorkshopPage';
import { ShortcutsPage } from './pages/ShortcutsPage';
import { FULL_BLEED } from './routes/routeHandle';
import { StorageNoticeBridge } from './storage/StorageNoticeBridge';
import { CustomerProvider } from './store/CustomerContext';
import { QuotationProvider } from './store/QuotationContext';

/** App-wide providers. They live inside the router so any of them may use router hooks. */
function Providers() {
  return (
    <ToastProvider>
      <StorageNoticeBridge />
      <ConfirmProvider>
        <ChoiceProvider>
          <QuotationProvider>
            <CustomerProvider>
              <Outlet />
            </CustomerProvider>
          </QuotationProvider>
        </ChoiceProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

// A data router (not <Routes>) so the layout can read route `handle`s with useMatches().
const router = createHashRouter([
  {
    element: <Providers />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Inicio />, handle: FULL_BLEED },
          { path: 'nueva-cotizacion', element: <NuevaCotizacionPage />, handle: FULL_BLEED },
          { path: 'historial', element: <HistoryPage />, handle: FULL_BLEED },
          { path: 'clientes', element: <CustomersPage />, handle: FULL_BLEED },
          { path: 'facturas', element: <FacturasPage />, handle: FULL_BLEED },
          { path: 'control-interno', element: <InternalControlPage /> },
          { path: 'control-interno/:quotationId', element: <InternalControlDetailPage /> },
          { path: 'respaldo', element: <BackupPage /> },
          { path: 'datos-del-taller', element: <WorkshopPage /> },
          { path: 'atajos', element: <ShortcutsPage /> },
          { path: 'cotizaciones/:id', element: <QuotationDetailPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
