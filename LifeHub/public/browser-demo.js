(() => {
  const key = 'lifehub:browser-demo:v1';
  const empty = () => ({ expenses: [], todos: [], waterLogs: [], waterGoal: 2000, shopping: [], habits: [] });
  let memory = empty();
  const id = () => globalThis.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  const day = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = part => parts.find(item => item.type === part)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  };
  const stamp = () => new Date().toISOString().replace(/Z$/, '');
  const title = value => String(value || '').trim().slice(0, 120);
  const load = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      if (stored && Array.isArray(stored.expenses) && Array.isArray(stored.todos) && Array.isArray(stored.waterLogs) && Array.isArray(stored.shopping) && Array.isArray(stored.habits)) {
        memory = { ...empty(), ...stored };
      }
    } catch {}
    return memory;
  };
  const save = data => {
    memory = data;
    try { localStorage.setItem(key, JSON.stringify(data)) }
    catch { throw Error('瀏覽器無法保存 Demo 資料，請確認儲存空間設定。') }
  };
  const streak = (days, today) => {
    const dates = new Set(days);
    const date = new Date(today + 'T00:00:00Z');
    if (!dates.has(today)) date.setUTCDate(date.getUTCDate() - 1);
    let count = 0;
    while (dates.has(date.toISOString().slice(0, 10))) {
      count++;
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return count;
  };
  const state = data => {
    const today = day(), month = today.slice(0, 7);
    const expenses = data.expenses.filter(item => item.day?.startsWith(month)).slice().reverse().slice(0, 30);
    return {
      demo: true,
      expenses,
      expenseTotal: data.expenses.filter(item => item.day?.startsWith(month)).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      todos: data.todos.slice().reverse(),
      waterToday: data.waterLogs.filter(item => item.day === today).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      waterGoal: data.waterGoal || 2000,
      shopping: data.shopping.slice().reverse(),
      habits: data.habits.map(item => ({ id: item.id, title: item.title, created_at: item.created_at, streak: streak(item.days || [], today), checkedToday: (item.days || []).includes(today) })),
      today,
      month,
    };
  };
  function request(path, method = 'GET', body = {}) {
    const data = load();
    if (path === '/state' && method === 'GET') return state(data);
    const parts = path.split('/').filter(Boolean);
    const collection = parts[0], itemId = parts[1];
    const itemTitle = title(body.title);
    if (collection === 'expenses' && method === 'POST') {
      const amount = Number(body.amount);
      if (!itemTitle || !Number.isSafeInteger(amount) || amount < 1) throw Error('請輸入項目與正整數金額。');
      data.expenses.push({ id: id(), title: itemTitle, amount, day: day(), created_at: stamp() });
    } else if (collection === 'todos' && method === 'POST') {
      if (!itemTitle) throw Error('請輸入待辦內容。');
      data.todos.push({ id: id(), title: itemTitle, done: 0, created_at: stamp() });
    } else if (collection === 'todos' && method === 'PATCH') {
      const item = data.todos.find(row => row.id === itemId); if (item) item.done = body.done ? 1 : 0;
    } else if (collection === 'todos' && method === 'DELETE') {
      data.todos = data.todos.filter(row => row.id !== itemId);
    } else if (path === '/water' && method === 'POST') {
      const amount = Number(body.amount);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 5000) throw Error('飲水量需介於 1–5000 ml。');
      data.waterLogs.push({ id: id(), amount, day: day() });
    } else if (path === '/water/goal' && method === 'PUT') {
      const goal = Number(body.goal);
      if (!Number.isSafeInteger(goal) || goal < 250 || goal > 10000) throw Error('目標需介於 250–10000 ml。');
      data.waterGoal = goal;
    } else if (collection === 'shopping' && method === 'POST') {
      if (!itemTitle) throw Error('請輸入購物項目。');
      data.shopping.push({ id: id(), title: itemTitle, checked: 0, created_at: stamp() });
    } else if (collection === 'shopping' && method === 'PATCH') {
      const item = data.shopping.find(row => row.id === itemId); if (item) item.checked = body.checked ? 1 : 0;
    } else if (collection === 'shopping' && method === 'DELETE') {
      data.shopping = data.shopping.filter(row => row.id !== itemId);
    } else if (path === '/habits' && method === 'POST') {
      if (!itemTitle) throw Error('請輸入習慣名稱。');
      if (data.habits.some(row => row.title === itemTitle)) throw Error('這個習慣已經存在。');
      data.habits.push({ id: id(), title: itemTitle, days: [], created_at: stamp() });
    } else if (collection === 'habits' && parts[2] === 'check' && method === 'POST') {
      const item = data.habits.find(row => row.id === itemId);
      if (item && !item.days.includes(day())) item.days.push(day());
    } else if (collection === 'habits' && method === 'DELETE') {
      data.habits = data.habits.filter(row => row.id !== itemId);
    } else {
      throw Error('找不到此 Demo 操作。');
    }
    save(data);
    return { ok: true };
  }
  window.LifeHubBrowserDemo = { request };
})();
