import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { resolveTheme, applyTheme } from './lib/theme';
import './index.css';

// Tema inicial: sigue al sistema hasta que settings (Task 10) diga otra cosa.
const prefersDark =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
applyTheme(resolveTheme('system', prefersDark));

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
