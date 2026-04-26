import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tooltip from '@radix-ui/react-tooltip';
import App from './App.tsx';
import { hydrateUiThemeProfile } from './stores/uiThemeStore.ts';
import './theme.css';
import './index.css';

hydrateUiThemeProfile();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tooltip.Provider delayDuration={200}>
      <App />
    </Tooltip.Provider>
  </StrictMode>,
);
