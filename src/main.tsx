import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './features/auth/auth.css';
import './features/catalogs/catalogs.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
