import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { isUnauthenticated } from './api/client';
import { applyNonce, startTheme } from './theme';
import { ToastProvider, TooltipProvider } from './ui';
import './styles/tokens.css';
import './styles/base.css';
import './styles/prose.css';
import './styles/layout.css';

applyNonce();
startTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !isUnauthenticated(error) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
