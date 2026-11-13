import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

function mockEnv() {
  const statements = [];
  return {
    statements,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...values) {
              const statement = { sql, values };
              statements.push(statement);
              return {
                run: async () => ({ success: true }),
                all: async () => ({ results: [] }),
                first: async () => sql.includes('SELECT id FROM habits') ? { id: 'habit-1' } : sql.includes('FROM water_logs') ? { total: 300 } : null,
              };
            },
          };
        },
      },
      ASSETS: { fetch: async () => new Response('static asset') },
    },
  };
}

async function call(env, path, method = 'GET', body, auth = true) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) headers.authorization = 'Bearer lifehub-local-demo-token';
  return worker.fetch(new Request(`http://localhost${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env);
}

test('health, static assets, auth guard and webhook signature guard', async () => {
  const { env } = mockEnv();
  const health = await call(env, '/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mode, 'local-demo');
  assert.equal(await (await call(env, '/')).text(), 'static asset');
  assert.equal((await call(env, '/api/state', 'GET', undefined, false)).status, 401);
  assert.equal((await call(env, '/webhook', 'POST', {})).status, 401);
});

test('state reads the single water total returned by D1 first()', async () => {
  const { env } = mockEnv();
  const response = await call(env, '/api/state');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).waterToday, 300);
});

test('five tool API mutations reach D1, including PUT water goal', async () => {
  const { env, statements } = mockEnv();
  const operations = [
    ['/api/expenses', 'POST', { title: '午餐', amount: 120 }, 201],
    ['/api/todos', 'POST', { title: '買牛奶' }, 201],
    ['/api/todos/todo-1', 'PATCH', { done: true }, 200],
    ['/api/todos/todo-1', 'DELETE', undefined, 200],
    ['/api/water', 'POST', { amount: 300 }, 201],
    ['/api/water/goal', 'PUT', { goal: 2200 }, 200],
    ['/api/shopping', 'POST', { title: '雞蛋' }, 201],
    ['/api/shopping/item-1', 'PATCH', { checked: true }, 200],
    ['/api/shopping/item-1', 'DELETE', undefined, 200],
    ['/api/habits', 'POST', { title: '運動' }, 201],
    ['/api/habits/habit-1/check', 'POST', {}, 200],
    ['/api/habits/habit-1', 'DELETE', undefined, 200],
  ];
  for (const [path, method, body, status] of operations) {
    assert.equal((await call(env, path, method, body)).status, status, `${method} ${path}`);
  }
  assert.ok(statements.some(s => s.sql.includes('water_settings') && s.values.includes(2200)),
    'PUT /api/water/goal must persist its submitted goal');
  assert.ok(statements.some(s => s.sql.includes('INSERT INTO expenses')));
  assert.ok(statements.some(s => s.sql.includes('INSERT INTO todos')));
  assert.ok(statements.some(s => s.sql.includes('INSERT INTO water_logs')));
  assert.ok(statements.some(s => s.sql.includes('INSERT INTO shopping_items')));
  assert.ok(statements.some(s => s.sql.includes('INSERT INTO habits')));
});

test('signed LINE commands bind the verified source user and stable event ID', async () => {
  const { env, statements } = mockEnv();
  env.LINE_CHANNEL_SECRET = 'test-secret';
  const commands = ['記帳 午餐 120', '待辦 買牛奶', '喝水 300', '購物 雞蛋', '打卡 運動', '今日摘要', '幫助'];
  const events = commands.map((text, index) => ({
    type: 'message', webhookEventId: `event-${index}`, replyToken: `reply-${index}`,
    source: { userId: index === 1 ? 'U-second' : 'U-first' },
    message: { type: 'text', text },
  }));
  const raw = JSON.stringify({ events });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LINE_CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))).toString('base64');
  const send = () => worker.fetch(new Request('https://lifehub.test/webhook', {
    method: 'POST', headers: { 'x-line-signature': signature }, body: raw,
  }), env);
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 200);
  const inserts = statements.filter(s => s.sql.startsWith('INSERT OR IGNORE INTO'));
  assert.ok(inserts.some(s => s.sql.includes('expenses') && s.values[0] === 'event-0' && s.values[1] === 'U-first'));
  assert.ok(inserts.some(s => s.sql.includes('todos') && s.values[0] === 'event-1' && s.values[1] === 'U-second'));
  assert.ok(inserts.some(s => s.sql.includes('water_logs') && s.values[0] === 'event-2'));
  assert.ok(inserts.some(s => s.sql.includes('shopping_items') && s.values[0] === 'event-3'));
  assert.ok(inserts.some(s => s.sql.includes('habit_logs') && s.values[0] === 'event-4'));
  assert.equal(inserts.filter(s => s.sql.includes('expenses')).length, 2);
  assert.ok(statements.some(s => s.sql.includes('SELECT COUNT(*) n FROM todos') && s.values[0] === 'U-first'));
});

test('public Worker without LINE config rejects shared demo identity', async () => {
  const { env } = mockEnv();
  const response = await worker.fetch(new Request('https://lifehub.test/api/auth/demo', { method: 'POST' }), env);
  assert.equal(response.status, 403);
});

test('LIFF API uses verified LINE sub instead of submitted userId', async () => {
  const { env, statements } = mockEnv();
  env.LINE_CHANNEL_ID = 'login-channel';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
    assert.equal(new URLSearchParams(options.body).get('client_id'), 'login-channel');
    return Response.json({ sub: 'U-verified', aud: 'login-channel', iss: 'https://access.line.me', exp: Math.floor(Date.now() / 1000) + 3600 });
  };
  try {
    const request = new Request('https://lifehub.test/api/expenses', {
      method: 'POST', headers: { authorization: 'Bearer line-id-token', 'content-type': 'application/json' },
      body: JSON.stringify({ title: '午餐', amount: 120, userId: 'U-forged' }),
    });
    assert.equal((await worker.fetch(request, env)).status, 201);
    const insert = statements.find(s => s.sql.includes('INSERT INTO expenses'));
    assert.equal(insert.values[1], 'U-verified');
    assert.ok(!insert.values.includes('U-forged'));
  } finally { globalThis.fetch = originalFetch; }
});

test('daily and monthly records use Taipei calendar dates', async () => {
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-30T20:00:00Z'])); }
  };
  try {
    const { env, statements } = mockEnv();
    assert.equal((await call(env, '/api/habits/habit-1/check', 'POST', {})).status, 200);
    assert.ok(statements.some(s => s.sql.includes('habit_logs') && s.values.includes('2026-12-01')));
    assert.equal((await call(env, '/api/state')).status, 200);
    assert.ok(statements.some(s => s.sql.includes("strftime('%Y-%m'") && s.values.includes('2026-12')));
  } finally { globalThis.Date = RealDate; }
});
