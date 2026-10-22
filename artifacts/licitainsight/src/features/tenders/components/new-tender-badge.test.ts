import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NewTenderBadge, NEW_TENDER_LABEL } from './new-tender-badge';

describe('NewTenderBadge', () => {
  it('renders visible and accessible copy with Pardal sage tokens', () => {
    const html = renderToStaticMarkup(createElement(NewTenderBadge, { isNew: true }));

    assert.match(html, />Novo</);
    assert.match(html, new RegExp(`aria-label="${NEW_TENDER_LABEL}"`));
    assert.match(html, /\bbg-salvia\b/);
    assert.doesNotMatch(html, /\bbg-destaque\b/);
    // Fixed petroleum ink on sage: `text-texto` turns cream in the Petróleo theme (contrast 1.54 on sage).
    assert.match(html, /\btext-petroleo\b/);
    assert.match(html, /\bborder-petroleo\b/);
    assert.doesNotMatch(html, /\btext-texto\b/);
    assert.match(html, /\brounded-pill\b/);
  });

  it('disappears when the server no longer marks the tender as new', () => {
    assert.equal(renderToStaticMarkup(createElement(NewTenderBadge, { isNew: false })), '');
  });
});
