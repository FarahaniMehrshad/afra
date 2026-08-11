import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Fonts, shipped locally from @fontsource so nothing is fetched from a CDN.
// Weights match what the UI actually uses in inline styles (400/500/600).
// Each import brings in one @font-face rule + the .woff2 file it references;
// Vite bundles both into dist/assets/ with content-hashed names.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
