import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { followTheme } from '../shared/theme';
import './styles.css';

// The theme the user picked in the dashboard.
followTheme((t) => {
  document.documentElement.dataset.theme = t;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
