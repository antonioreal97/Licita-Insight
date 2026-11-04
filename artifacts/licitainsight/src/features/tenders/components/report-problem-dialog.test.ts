import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportProblem } from './report-problem-dialog';

test('renders a discreet "Reportar problema" button that opens a dialog', () => {
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ReportProblem, { tenderId: 't1' })),
  );
  assert.match(html, /data-testid="button-report-problem"/);
  assert.match(html, /Reportar problema/);
  assert.match(html, /aria-haspopup="dialog"/);
  // The dialog content mounts only when opened.
  assert.doesNotMatch(html, /dialog-report-problem/);
});
