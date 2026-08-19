import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { BrandingProvider } from './context/Branding';
import './index.css';

// Native (Capacitor) shell: the SPA is served from a local scheme, so API calls
// must target the deployed API origin. Default to the production site; the base
// can be overridden at runtime by setting localStorage 'lux_api_base' before the
// app boots (e.g. to point the app at a staging deployment).
if (typeof Capacitor !== 'undefined' && Capacitor.getPlatform && Capacitor.getPlatform() !== 'web') {
  window.__LUX_API_BASE__ = localStorage.getItem('lux_api_base') || 'https://lux-official.netlify.app';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <BrandingProvider>
        <App />
      </BrandingProvider>
    </BrowserRouter>
  </React.StrictMode>
);