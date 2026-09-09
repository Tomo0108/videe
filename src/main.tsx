import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerPwa } from './pwa';
import '@fontsource-variable/inter-tight';
import './theme.css';
import './style.css';
registerPwa();
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
