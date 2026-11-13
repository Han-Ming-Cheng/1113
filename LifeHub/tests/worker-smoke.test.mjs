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
                first: async () => sql.includes('FROM water_logs') ? { total: 300 } : null,
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
  return worker.fetch(new Request(`https://lifehub.test${path}`, {
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
