import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { Inicio } from './pages/Inicio';
import { NuevaCotizacionPage } from './pages/NuevaCotizacionPage';
import { HistoryPage } from './pages/HistoryPage';
import { QuotationDetailPage } from './pages/QuotationDetailPage';
import { CustomersPage } from './pages/CustomersPage';
import { FacturasPage } from './pages/FacturasPage';
import { InternalControlPage } from './pages/InternalControlPage';
import { InternalControlDetailPage } from './pages/InternalControlDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route path="nueva-cotizacion" element={<NuevaCotizacionPage />} />
        <Route path="historial" element={<HistoryPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="facturas" element={<FacturasPage />} />
        <Route path="control-interno"element={<InternalControlPage />} />
        <Route path="control-interno/:quotationId" element={<InternalControlDetailPage />} />
        <Route path="cotizaciones/:id" element={<QuotationDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
