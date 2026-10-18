import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import { ToastProvider } from './components/Toast';
import { CustomerProvider } from './store/CustomerContext';
import { QuotationProvider } from './store/QuotationContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <QuotationProvider>
          <CustomerProvider>
            <App />
          </CustomerProvider>
        </QuotationProvider>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
