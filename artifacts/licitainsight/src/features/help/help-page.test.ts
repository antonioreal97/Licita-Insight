import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { Popover } from '@/components/ui/popover';
import { GlossaryDefinition, GlossaryTerm } from './components/glossary-term';
import { GLOSSARY, GLOSSARY_DISCLAIMER_SHORT, glossaryById } from './glossary';
import { PROCESS_TRACKS, SOURCE_GUIDES } from './guide-data';
import HelpPage, { HELP_DESCRIPTION, HELP_TITLE } from './help-page';
import { searchGlossary } from './lib/glossary-search';

const at = (path: string, node: ReturnType<typeof h>) => renderToStaticMarkup(h(Router, { ssrPath: path }, node));

test('the term trigger is a real button announced as opening a dialog', () => {
  const html = at('/tenders/x', h(GlossaryTerm, { termId: 'sicaf' }, 'SICAF'));
  assert.match(html, /<button type="button"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.match(html, /data-state="closed"/);
  assert.match(html, /SICAF<span class="sr-only"> \(o que é\?\)<\/span>/);
});

test('the icon trigger has an accessible name', () => {
  const html = at('/search', h(GlossaryTerm, { termId: 'pregao', variant: 'icon' }));
  assert.match(html, /aria-label="O que é Pregão eletrônico\?"/);
  assert.match(html, /aria-hidden="true"/);
});

test('an unknown term renders its text without a popover', () => {
  assert.equal(at('/', h(GlossaryTerm, { termId: 'nao-existe' }, 'Texto')), 'Texto');
});

test('the definition has a labelled title, what to do, official links in a new tab, disclaimer and the glossary link', () => {
  const entry = glossaryById.get('cnd')!;
  const html = at('/tenders/x', h(Popover, null, h(GlossaryDefinition, { entry, titleId: 'titulo-cnd' })));
  assert.match(html, /id="titulo-cnd"/);
  assert.ok(html.includes(entry.definition));
  assert.match(html, /O que fazer: /);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /\(abre em nova aba\)/);
  assert.ok(html.includes(GLOSSARY_DISCLAIMER_SHORT));
  assert.match(html, /href="\/ajuda#termo-cnd"/);
  // Already on /ajuda the link is a plain in-page jump.
  assert.match(at('/ajuda', h(GlossaryDefinition, { entry, titleId: 't' })), /href="#termo-cnd"/);
});

test('popover content respects reduced motion', () => {
  const source = readFileSync(new URL('./components/glossary-term.tsx', import.meta.url), 'utf8');
  assert.match(source, /motion-reduce:animate-none/);
});

test('/ajuda renders the learning paths, process guides, sources and every glossary entry', () => {
  const html = at('/ajuda', h(HelpPage));
  assert.match(html, /<h1[^>]*>Ajuda para participar de oportunidades públicas<\/h1>/);
  assert.match(html, /<h2[^>]*>Por onde você quer começar\?<\/h2>/);
  assert.match(html, /<h2[^>]*>Como vender ao governo<\/h2>/);
  assert.match(html, /role="tab"[^>]*>Pregão eletrônico<\/button>/);
  assert.match(html, /Termos das fontes nacionais/);
  assert.match(html, /Termos das fontes internacionais/);
  for (const source of ['PNCP e Compras.gov.br', 'Mapas Culturais', 'FINEP, CNPq e CAPES', 'Transferegov.br', 'Banco Mundial e BID', 'União Europeia (Funding &amp; Tenders)']) {
    assert.ok(html.includes(source), `missing source ${source}`);
  }
  assert.match(html, /<h2[^>]*>Glossário<\/h2>/);
  assert.match(html, /não é orientação jurídica/i);
  const steps = html.match(/<ol[^>]*>[\s\S]*?<\/ol>/)![0];
  assert.equal((steps.match(/<li/g) ?? []).length, 6);
  assert.equal((html.match(/data-testid="glossary-entry"/g) ?? []).length, GLOSSARY.length);
  assert.match(html, /<label for="[^"]+"[^>]*>Buscar termo<\/label>/);
  assert.match(html, /<label for="[^"]+"[^>]*>Filtrar por assunto<\/label>/);
  assert.match(html, /data-testid="select-glossary-category"/);
  assert.match(html, /role="search"/);
  assert.match(html, /id="termo-sicaf"/);
  // The steps mark glossary terms (popovers) once each.
  assert.equal((html.match(/data-testid="glossary-term-sicaf"/g) ?? []).length, 1);
  assert.match(HELP_TITLE, /Pardal Digital/);
  assert.ok(HELP_DESCRIPTION.length > 50 && HELP_DESCRIPTION.length <= 160);
});

test('glossary search ignores accents and case, ranks name matches first and returns nothing for unknown words', () => {
  assert.equal(searchGlossary('sicaf')[0].id, 'sicaf');
  assert.equal(searchGlossary('CERTIDAO NEGATIVA')[0].id, 'cnd');
  assert.equal(searchGlossary('impugnacao')[0].id, 'impugnacao');
  assert.ok(searchGlossary('simples nacional').some((entry) => entry.id === 'regularizacao-me-epp'), 'searches the text too');
  assert.ok(searchGlossary('Mapas Culturais').some((entry) => entry.id === 'agente-cultural'));
  assert.ok(searchGlossary('FINEP').some((entry) => entry.id === 'subvencao-economica'));
  assert.equal(searchGlossary('EOI')[0].id, 'expressao-interesse');
  assert.ok(searchGlossary('Funding Tenders').some((entry) => entry.id === 'call-topic'));
  assert.deepEqual(searchGlossary('xyzw'), []);
  assert.equal(searchGlossary('  ').length, GLOSSARY.length);
});

test('guides cover every opportunity source displayed by the product', () => {
  const guideNames = SOURCE_GUIDES.map((guide) => guide.sources).join(' ');
  for (const source of ['PNCP', 'Mapas Culturais', 'FINEP', 'CNPq', 'CAPES', 'Transferegov.br', 'Funarte', 'Ministério da Cultura', 'Lei Rouanet (Salic)', 'Banco Mundial', 'União Europeia (Funding & Tenders)', 'BID']) {
    assert.ok(guideNames.includes(source), `missing ${source}`);
  }
  assert.deepEqual(PROCESS_TRACKS.map((track) => track.id), ['pregao', 'dispensa', 'fomento']);
  assert.ok(PROCESS_TRACKS.every((track) => track.stages.length >= 5));
});

test('/ajuda is routed, titled and linked from the menu and the landing footer', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<Route path="\/ajuda">/);
  assert.match(app, /'\/ajuda': HELP_TITLE/);
  assert.match(readFileSync(new URL('../../components/app-shell.tsx', import.meta.url), 'utf8'), /href: '\/ajuda'/);
  assert.match(readFileSync(new URL('../landing/landing-page.tsx', import.meta.url), 'utf8'), /href="\/ajuda"/);
});
