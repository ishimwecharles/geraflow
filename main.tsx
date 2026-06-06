import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from "./components/ErrorBoundary";
import './index.css';

// Service Worker disabled temporarily to solve production bootstrap freeze issues
if ('serviceWorker' in navigator && typeof window !== 'undefined') {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

// Clear old web cache versions to load fresh operational code
if (typeof caches !== 'undefined') {
  caches.keys().then((names) => {
    for (const name of names) {
      if (name !== 'gerapay-qr-v1.3') {
        caches.delete(name).then((cleared) => {
          if (cleared) console.log(`[GeraPay Cache] Cleared old cache store: ${name}`);
        });
      }
    }
  }).catch((e) => console.warn('[GeraPay Cache] Obsolete cache check bypassed:', e));
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


