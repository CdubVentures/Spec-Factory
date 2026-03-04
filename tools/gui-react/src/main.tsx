import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tooltip from '@radix-ui/react-tooltip';
import App from './App';
import { hydrateUiThemeProfile } from './stores/uiStore';
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
