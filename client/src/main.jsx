import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { preloadInitialLocale } from './i18n/index.js';
import './index.css';
import './utils/scrollbar.js';

// yalnızca geliştirme: ?rrweb=1 ile oturum kaydı (landing oynatması için)
if (import.meta.env.DEV) import('./dev/rrwebRecorder.js');

// A returning visitor's language (one small chunk) loads before the first
// render; Turkish needs no wait. A failed load falls back to Turkish.
preloadInitialLocale().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <I18nProvider>
      <App />
    </I18nProvider>
  );
});
