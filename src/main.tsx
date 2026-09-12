import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {PasswordGate} from './security';
import { registerPwa } from './pwa';
import '@fontsource-variable/geist';
import './style.css';
registerPwa();
createRoot(document.getElementById('root')!).render(<React.StrictMode><PasswordGate><App /></PasswordGate></React.StrictMode>);
