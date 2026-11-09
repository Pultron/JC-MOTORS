import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';
import { CustomerProvider } from './store/CustomerContext';
import { QuotationProvider } from './store/QuotationContext';
import { StorageNoticeBridge } from './storage/StorageNoticeBridge';
import { bootStorage } from './storage/bootStorage';
import { preloadPdfWhenIdle } from './utils/pdfPreload';
import './styles.css';

bootStorage();
preloadPdfWhenIdle();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <StorageNoticeBridge />
        <ConfirmProvider>
          <QuotationProvider>
            <CustomerProvider>
              <App />
            </CustomerProvider>
          </QuotationProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
