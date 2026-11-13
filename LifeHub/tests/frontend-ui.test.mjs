import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const demoScript = readFileSync(new URL('../public/browser-demo.js', import.meta.url), 'utf8');
const appScript = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('homepage opens a tool in browser Demo and links to the report form', async () => {
  assert.ok(html.indexOf('browser-demo.js') < html.indexOf('app.js'));
  assert.match(html, /href="report\.html">填寫問題回報/);
  const handlers = new Map(), elements = new Map(), storage = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: selector === '#modal' || selector === '#errorNotice',
      style: {}, textContent: '', innerHTML: '',
      classList: { add() {}, remove() {} },
      addEventListener(type, handler) { handlers.set(selector + ':' + type, handler) },
      insertAdjacentHTML() {},
    });
    return elements.get(selector);
  }
  const context = vm.createContext({
    window: { LIFF_ID: 'configured-liff-id', LIFEHUB_AUTH_READY: true, addEventListener() {}, scrollTo() {} },
    document: { querySelector: element, addEventListener() {} },
    location: { hostname: 'lifehub.test', search: '?demo=1', href: '/' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sessionStorage: { setItem() {}, removeItem() {} },
    URLSearchParams, Intl, Date, Math, Number, String, Error, Set, JSON, console, setTimeout,
  });
  vm.runInContext(demoScript, context);
  vm.runInContext(appScript, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(vm.runInContext('state.demo', context), true);
  assert.match(element('.hero p').textContent, /Demo/);
  handlers.get('#cards:click')({ target: { closest: () => ({ dataset: { tool: 'expense' } }) } });
  assert.equal(element('#modal').hidden, false);
  assert.match(element('#sheetContent').innerHTML, /記帳/);
});
