import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NewTenderBadge, NEW_TENDER_LABEL } from './new-tender-badge';

describe('NewTenderBadge', () => {
  it('renders visible and accessible copy with Pardal highlight tokens', () => {
    const html = renderToStaticMarkup(createElement(NewTenderBadge, { isNew: true }));

    assert.match(html, />Novo</);
    assert.match(html, new RegExp(`aria-label="${NEW_TENDER_LABEL}"`));
    assert.match(html, /\bbg-destaque\b/);
    assert.match(html, /\btext-texto-sobre-destaque\b/);
    assert.match(html, /\brounded-pill\b/);
  });

  it('disappears when the server no longer marks the tender as new', () => {
    assert.equal(renderToStaticMarkup(createElement(NewTenderBadge, { isNew: false })), '');
  });
});
