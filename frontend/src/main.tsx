import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/router';
import './styles.css';
import './home-responsive.css';
import { GlobalQuickCapture } from './features/phase3/GlobalQuickCapture';
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: false
    }
  }
});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><RouterProvider router={router} /><GlobalQuickCapture /></QueryClientProvider>);
