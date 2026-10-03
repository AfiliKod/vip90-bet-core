import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import './index.css';
import './utils/scrollbar.js';

// yalnızca geliştirme: ?rrweb=1 ile oturum kaydı (landing oynatması için)
if (import.meta.env.DEV) import('./dev/rrwebRecorder.js');

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
