/** GA receives only the route path. Query strings and fragments may contain search terms or tokens. */
export function analyticsPagePath(location: string): string {
  const path = location.split(/[?#]/, 1)[0] || '/';
  if (path === '/search' || path.startsWith('/search/')) return '/search';
  if (path.startsWith('/tenders/')) return '/tenders/:id';
  if (path.startsWith('/oportunidades/')) return '/oportunidades/:id';
  return path.startsWith('/') ? path : `/${path}`;
}
