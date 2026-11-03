import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ToastProvider } from './components/ui/Toast';
import { CustomerProvider } from './store/CustomerContext';
import { QuotationProvider } from './store/QuotationContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
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
