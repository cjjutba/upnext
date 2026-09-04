if (import.meta.env.DEV) {
  import("react-grab");
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';

if (navigator.storage?.persist) {
  void navigator.storage.persist();
}

// Registered here, not injected into app.html, so the landing page's build stays script free.
if (import.meta.env.PROD) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
