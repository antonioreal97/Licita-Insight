import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterSidebar, filterWorkspaceClass } from './filter-sidebar';

const render = (collapsed: boolean, activeCount = 0) =>
  renderToStaticMarkup(
    createElement(
      FilterSidebar,
      {
        collapsed,
        onCollapsedChange: () => undefined,
        activeCount,
        onClear: () => undefined,
        panelId: 'test-panel',
        titleId: 'test-title',
      },
      createElement('p', null, 'Conteúdo'),
    ),
  );

test('trilho compartilhado mantém 264 px aberto e 40 px recolhido, sem movimento obrigatório', () => {
  assert.match(filterWorkspaceClass(false), /264px_minmax/);
  assert.match(filterWorkspaceClass(true), /40px_minmax/);
  assert.match(filterWorkspaceClass(false), /motion-reduce:transition-none/);
});

test('barra lateral anuncia e recolhe os filtros, preservando o conteúdo no DOM', () => {
  const open = render(false, 2);
  assert.match(open, /id="test-title"[^>]*>Filtros/);
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /Limpar \(2\)/);
  assert.match(open, /id="test-panel">/);

  const collapsed = render(true, 2);
  assert.match(collapsed, /aria-label="Filtros"/);
  assert.match(collapsed, /aria-expanded="false"/);
  assert.match(collapsed, /id="test-panel" hidden=""/);
  assert.doesNotMatch(collapsed, /Limpar \(2\)/);
});
