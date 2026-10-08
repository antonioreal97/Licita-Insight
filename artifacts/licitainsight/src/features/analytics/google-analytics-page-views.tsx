import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { analyticsPagePath } from './analytics-route';
import { trackPageView } from './google-analytics';

export function GoogleAnalyticsPageViews() {
  const [location] = useLocation();

  useEffect(() => {
    trackPageView(analyticsPagePath(location));
  }, [location]);

  return null;
}
