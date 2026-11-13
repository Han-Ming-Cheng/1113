import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/browser-demo.js', import.meta.url), 'utf8');

function makeDemo(storage) {
  const context = {
    window: {},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  vm.runInNewContext(source, context);
  return context.window.LifeHubBrowserDemo.request;
}

test('browser Demo supports and persists all five tools without backend credentials', () => {
  const storage = new Map();
  let request = makeDemo(storage);
  request('/expenses', 'POST', { title: '午餐', amount: 120 });
  request('/todos', 'POST', { title: '買牛奶' });
  request('/water', 'POST', { amount: 300 });
  request('/water/goal', 'PUT', { goal: 1800 });
  request('/shopping', 'POST', { title: '雞蛋' });
  request('/habits', 'POST', { title: '運動' });

  let state = request('/state');
  assert.equal(state.demo, true);
  assert.equal(state.expenseTotal, 120);
  assert.equal(state.todos[0].title, '買牛奶');
  assert.equal(state.waterToday, 300);
  assert.equal(state.waterGoal, 1800);
  assert.equal(state.shopping[0].title, '雞蛋');
  assert.equal(state.habits[0].title, '運動');

  request(`/todos/${state.todos[0].id}`, 'PATCH', { done: true });
  request(`/shopping/${state.shopping[0].id}`, 'PATCH', { checked: true });
  request(`/habits/${state.habits[0].id}/check`, 'POST');

  request = makeDemo(storage);
  state = request('/state');
  assert.equal(state.todos[0].done, 1);
  assert.equal(state.shopping[0].checked, 1);
  assert.equal(state.habits[0].checkedToday, true);
  assert.equal(state.habits[0].streak, 1);

  request(`/todos/${state.todos[0].id}`, 'DELETE');
  request(`/shopping/${state.shopping[0].id}`, 'DELETE');
  request(`/habits/${state.habits[0].id}`, 'DELETE');
  state = request('/state');
  assert.equal(state.todos.length, 0);
  assert.equal(state.shopping.length, 0);
  assert.equal(state.habits.length, 0);
});
