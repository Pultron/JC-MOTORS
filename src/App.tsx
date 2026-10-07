import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './layouts/AppLayout';
import { HomePage } from './pages/HomePage';
import { NewQuotationPage } from './pages/NewQuotationPage';
import { HistoryPage } from './pages/HistoryPage';
import { QuotationDetailPage } from './pages/QuotationDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { CustomersPage } from './pages/CustomersPage';
import { InternalControlPage } from './pages/InternalControlPage';
import { InternalControlDetailPage } from './pages/InternalControlDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="nueva-cotizacion" element={<NewQuotationPage />} />
        <Route path="historial" element={<HistoryPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="control-interno" element={<InternalControlPage />} />
        <Route path="control-interno/:quotationId" element={<InternalControlDetailPage />} />
        <Route path="cotizaciones/:id" element={<QuotationDetailPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
