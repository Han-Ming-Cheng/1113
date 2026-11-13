import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const demoScript = readFileSync(new URL('../public/browser-demo.js', import.meta.url), 'utf8');
const appScript = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const assistantScript = readFileSync(new URL('../public/assistant-ui.js', import.meta.url), 'utf8');

test('homepage opens a tool in browser Demo and links to the report form', async () => {
  assert.ok(html.indexOf('browser-demo.js') < html.indexOf('app.js'));
  assert.ok(html.indexOf('app.js') < html.indexOf('assistant-ui.js'));
  assert.match(html, /id="assistantLauncher"/);
  assert.match(html, /class="assistant-settings" open/);
  assert.match(html, /id="assistantCloudflareFields" class="assistant-custom-fields"/);
  assert.match(html, /id="assistantKeyInput" type="password"/);
  assert.match(html, /href="report\.html">填寫問題回報/);
  const handlers = new Map(), elements = new Map(), storage = new Map();
  let confirmDelete = false;
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
    window: { LIFF_ID: 'configured-liff-id', LIFEHUB_AUTH_READY: true, addEventListener() {}, scrollTo() {}, confirm: () => confirmDelete },
    document: { querySelector: element, addEventListener() {} },
    location: { hostname: 'lifehub.test', search: '?demo=1', href: '/' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    sessionStorage: { setItem() {}, removeItem() {} },
    URLSearchParams, Intl, Date, Math, Number, String, Error, Set, JSON, console, setTimeout,
    FormData: class {
      constructor(form) { this.form = form; }
      *[Symbol.iterator]() {
        yield ['id', this.form.dataset.id];
        yield ['title', this.form.values.title];
        yield ['amount', this.form.values.amount];
      }
    },
  });
  vm.runInContext(demoScript, context);
  vm.runInContext(appScript, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(vm.runInContext('state.demo', context), true);
  assert.match(element('.hero p').textContent, /Demo/);
  handlers.get('#cards:click')({ target: { closest: () => ({ dataset: { tool: 'expense' } }) } });
  assert.equal(element('#modal').hidden, false);
  assert.match(element('#sheetContent').innerHTML, /記帳/);
  await context.window.LifeHubRunAction({ type: 'expense', title: '午餐', amount: 120 });
  await context.window.LifeHubRunAction({ type: 'todo', title: '買牛奶' });
  await context.window.LifeHubRunAction({ type: 'water', amount: 300 });
  await context.window.LifeHubRunAction({ type: 'shopping', title: '雞蛋' });
  await context.window.LifeHubRunAction({ type: 'check', title: '運動' });
  const updated = vm.runInContext('state', context);
  assert.equal(updated.expenseTotal, 120);
  assert.equal(updated.todos[0].title, '買牛奶');
  assert.equal(updated.waterToday, 300);
  assert.equal(updated.shopping[0].title, '雞蛋');
  assert.equal(updated.habits[0].checkedToday, true);
  handlers.get('#cards:click')({ target: { closest: () => ({ dataset: { tool: 'expense' } }) } });
  assert.match(element('#sheetContent').innerHTML, /data-delete="expense"/);
  assert.match(element('#sheetContent').innerHTML, /data-edit-expense=/);
  const expenseId = updated.expenses[0].id;
  handlers.get('#modal:click')({ target: { closest: selector => selector === '[data-edit-expense]' ? { dataset: { editExpense: expenseId } } : null } });
  assert.match(element('#sheetContent').innerHTML, /id="expenseEdit"/);
  handlers.get('#modal:submit')({ preventDefault() {}, target: { id: 'expenseEdit', dataset: { id: expenseId }, values: { title: '晚餐', amount: '150' } } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(vm.runInContext('state.expenseTotal', context), 150);
  const deleteEvent = { target: { closest: selector => selector === '[data-delete]' ? { dataset: { delete: 'expense', id: expenseId } } : null } };
  handlers.get('#modal:click')(deleteEvent);
  assert.equal(vm.runInContext('state.expenseTotal', context), 150);
  confirmDelete = true;
  handlers.get('#modal:click')(deleteEvent);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(vm.runInContext('state.expenseTotal', context), 0);
});

test('assistant gives local help without a key and clears an entered key from the field', async () => {
  const handlers = new Map(), elements = new Map(), bubbles = [];
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: selector === '#assistantPanel',
      value: '', textContent: '', dataset: {},
      disabled: false, scrollTop: 0, scrollHeight: 0,
      setAttribute() {},
      addEventListener(type, handler) { handlers.set(selector + ':' + type, handler) },
      append(node) { bubbles.push(node) },
    });
    return elements.get(selector);
  }
  const context = vm.createContext({
    window: { LifeHubSummary: () => ({ expenseTotal: 120, todos: [], waterToday: 300, waterGoal: 2000, shopping: [], habits: [] }) },
    document: { querySelector: element, querySelectorAll: () => [], createElement: () => ({ className: '', textContent: '' }) },
    fetch: async (url, options) => {
      assert.equal(url, 'api/assistant');
      const provider = JSON.parse(options.body).provider;
      if (provider === 'openai') assert.equal(options.headers['x-assistant-api-key'], 'sk-test-private');
      else {
        assert.equal(provider, 'cloudflare');
        assert.equal(options.headers['x-assistant-api-key'], 'cf-test-token');
        assert.equal(JSON.parse(options.body).accountId, 'a'.repeat(32));
      }
      return Response.json({ answer: '可以從首頁開始。' });
    },
    Response,
  });
  vm.runInContext(assistantScript, context);
  element('#assistantProvider').value = 'openai';
  element('#assistantInput').value = '今日摘要';
  handlers.get('#assistantForm:submit')({ preventDefault() {} });
  assert.ok(bubbles.some(item => item.textContent.includes('喝水 300/2000 ml')));
  element('#assistantKeyInput').value = 'sk-test-private';
  handlers.get('#assistantKeyForm:submit')({ preventDefault() {} });
  assert.equal(element('#assistantKeyInput').value, '');
  element('#assistantInput').value = '怎麼開始？';
  handlers.get('#assistantForm:submit')({ preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(bubbles.some(item => item.textContent === '可以從首頁開始。'));
  element('#assistantProvider').value = 'gemini';
  handlers.get('#assistantProvider:change')();
  assert.match(element('#assistantKeyStatus').textContent, /Google Gemini/);
  element('#assistantInput').value = '怎麼開始？';
  handlers.get('#assistantForm:submit')({ preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(bubbles.at(-1).textContent, /幫你記錄資料/);
  element('#assistantProvider').value = 'cloudflare';
  handlers.get('#assistantProvider:change')();
  assert.equal(element('#assistantCloudflareFields').hidden, false);
  assert.match(element('#assistantKeyLabel').textContent, /Cloudflare Workers AI API Token/);
  element('#assistantAccountId').value = 'a'.repeat(32);
  element('#assistantKeyInput').value = 'cf-test-token';
  handlers.get('#assistantKeyForm:submit')({ preventDefault() {} });
  element('#assistantInput').value = '可以聊天嗎？';
  handlers.get('#assistantForm:submit')({ preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(bubbles.at(-1).textContent, '可以從首頁開始。');
});

test('assistant asks for confirmation before saving a parsed expense', async () => {
  const handlers = new Map(), elements = new Map(), nodes = [], actions = [];
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: selector === '#assistantPanel', value: '', textContent: '',
      disabled: false, scrollTop: 0, scrollHeight: 0,
      setAttribute() {},
      addEventListener(type, handler) { handlers.set(selector + ':' + type, handler) },
      append(node) { nodes.push(node) },
    });
    return elements.get(selector);
  }
  const context = vm.createContext({
    window: { LifeHubRunAction: async action => { actions.push(action); return '已記帳。' } },
    document: {
      querySelector: element,
      querySelectorAll: () => [],
      createElement: () => ({
        className: '', textContent: '', children: [], listeners: {},
        append(...children) { this.children.push(...children) },
        addEventListener(type, handler) { this.listeners[type] = handler },
        remove() {},
      }),
    },
  });
  vm.runInContext(assistantScript, context);
  element('#assistantInput').value = '記帳 午餐 120';
  handlers.get('#assistantForm:submit')({ preventDefault() {} });
  assert.equal(actions.length, 0);
  const card = nodes.find(node => node.className === 'assistant-action');
  assert.match(card.children[0].textContent, /午餐.*120/);
  await card.children[1].listeners.click();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'expense');
  assert.equal(actions[0].amount, 120);
});
