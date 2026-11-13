import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { PreferencesProvider } from './lib/i18n.tsx';

createRoot(document.getElementById('root')!).render(
  <PreferencesProvider>
    <App />
  </PreferencesProvider>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-critical if preview environment restricts SW scope
    });
  });
}
