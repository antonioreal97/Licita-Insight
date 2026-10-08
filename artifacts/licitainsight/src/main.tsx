import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { initializeGoogleAnalytics } from '@/features/analytics/google-analytics';

import './index.css';

const stopGoogleAnalyticsConsentSync = initializeGoogleAnalytics();
if (import.meta.hot) import.meta.hot.dispose(stopGoogleAnalyticsConsentSync);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
