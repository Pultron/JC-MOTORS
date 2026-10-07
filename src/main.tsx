import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import { CustomerProvider } from './store/CustomerContext';
import { QuotationProvider } from './store/QuotationContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <QuotationProvider>
        <CustomerProvider>
          <App />
        </CustomerProvider>
      </QuotationProvider>
    </HashRouter>
  </React.StrictMode>,
);
