(() => {
  const get = selector => document.querySelector(selector);
  const panel = get('#assistantPanel');
  const launcher = get('#assistantLauncher');
  const messages = get('#assistantMessages');
  const input = get('#assistantInput');
  const providerSelect = get('#assistantProvider');
  const providerNames = { cloudflare: 'Cloudflare Workers AI', openai: 'OpenAI', gemini: 'Google Gemini', anthropic: 'Anthropic Claude', custom: '自訂相容 API' };
  let apiKey = '';
  let history = [];
  let busy = false;

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) messages.scrollTop = messages.scrollHeight;
  }
  function bubble(role, text) {
    const item = document.createElement('p');
    item.className = 'assistant-bubble ' + role;
    item.textContent = text;
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }
  function parseAction(text) {
    const command = text.trim().replace(/^(幫我|請|我要|我想要)\s*/, '');
    let match = command.match(/^(?:記帳|新增支出)\s+(.+?)\s+(\d+)(?:\s*元)?$/);
    if (match) return { type: 'expense', title: match[1].trim(), amount: Number(match[2]) };
    match = command.match(/^(?:設定喝水目標|喝水目標)\s*(\d+)(?:\s*ml|\s*毫升)?$/i);
    if (match) return { type: 'goal', amount: Number(match[1]) };
    match = command.match(/^(?:喝水|記錄喝水)\s*(\d+)(?:\s*ml|\s*毫升)?$/i);
    if (match) return { type: 'water', amount: Number(match[1]) };
    match = command.match(/^(?:待辦|新增待辦)\s+(.+)$/);
    if (match) return { type: 'todo', title: match[1].trim() };
    match = command.match(/^(?:購物|加入購物清單)\s+(.+)$/);
    if (match) return { type: 'shopping', title: match[1].trim() };
    match = command.match(/^(?:新增習慣|建立習慣)\s+(.+)$/);
    if (match) return { type: 'habit', title: match[1].trim() };
    match = command.match(/^打卡\s+(.+)$/);
    if (match) return { type: 'check', title: match[1].trim() };
    return null;
  }
  function actionLabel(action) {
    if (action.type === 'expense') return `記帳「${action.title}」$${action.amount}`;
    if (action.type === 'water') return `記錄喝水 ${action.amount} ml`;
    if (action.type === 'goal') return `設定每日喝水目標 ${action.amount} ml`;
    if (action.type === 'check') return `為「${action.title}」打卡`;
    return `${{ todo: '新增待辦', shopping: '新增購物項目', habit: '新增習慣' }[action.type]}「${action.title}」`;
  }
  function confirmAction(action) {
    const card = document.createElement('div');
    card.className = 'assistant-action';
    const label = document.createElement('p');
    label.textContent = `請確認：${actionLabel(action)}`;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = '確認新增';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'cancel';
    cancel.textContent = '取消';
    card.append(label, confirm, cancel);
    messages.append(card);
    messages.scrollTop = messages.scrollHeight;
    confirm.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      confirm.disabled = cancel.disabled = true;
      try {
        const result = await window.LifeHubRunAction(action);
        card.remove();
        bubble('bot', result);
        history.push({ role: 'user', text: actionLabel(action) }, { role: 'assistant', text: result.slice(0, 500) });
        history = history.slice(-6);
      } catch (error) {
        bubble('bot', error?.message || '儲存失敗，請稍後再試。');
        confirm.disabled = cancel.disabled = false;
      } finally {
        busy = false;
      }
    });
    cancel.addEventListener('click', () => {
      card.remove();
      bubble('bot', '已取消，沒有新增資料。');
    });
  }
  function localHelp(question) {
    if (/今日摘要|今天摘要/.test(question)) {
      const state = window.LifeHubSummary?.();
      if (!state) return '資料還在載入，請稍後再問一次。';
      return `今天的 LifeHub：本月支出 $${Number(state.expenseTotal).toLocaleString()}；未完成待辦 ${state.todos.filter(item => !item.done).length} 件；喝水 ${state.waterToday}/${state.waterGoal} ml；待買 ${state.shopping.filter(item => !item.checked).length} 件；今日打卡 ${state.habits.filter(item => item.checkedToday).length} 次。`;
    }
    if (/記帳|支出|花費/.test(question)) return '點首頁「記帳」卡片，輸入項目與金額後按「記一筆」；卡片會顯示本月總額；填錯時可在紀錄旁按「刪除」。';
    if (/待辦|任務/.test(question)) return '點「待辦清單」新增事項，完成後勾選；不需要的事項可按 × 刪除。';
    if (/喝水|飲水/.test(question)) return '點「喝水提醒」可快速記錄 150、250、300 或 500 ml，也能修改每日目標。';
    if (/購物|採買/.test(question)) return '點「購物清單」新增品項；買到後勾選，或按 × 刪除。';
    if (/習慣|打卡/.test(question)) return '點「習慣打卡」新增習慣，每天按一次「打卡」，就能查看連續天數。';
    if (/錯誤|問題|回報/.test(question)) return '首頁五張卡片下方有「填寫問題回報」。操作失敗時也會出現「回報這個錯誤」，表單會帶入錯誤資訊。';
    return '我可以幫你記錄資料。試試「記帳 午餐 120」、「待辦 買牛奶」、「喝水 300」、「購物 雞蛋」或「打卡 運動」；確認後才會寫入。若想自由提問，可選擇 AI 平台並設定自己的 API Key。';
  }
  async function ask(question) {
    if (busy || !question.trim()) return;
    const text = question.trim().slice(0, 500);
    bubble('user', text);
    input.value = '';
    const action = parseAction(text);
    if (action) {
      confirmAction(action);
      return;
    }
    if (!apiKey || /今日摘要|今天摘要/.test(text)) {
      bubble('bot', localHelp(text));
      return;
    }
    busy = true;
    get('#assistantForm button').disabled = true;
    const prior = history.slice(-6);
    try {
      const response = await fetch('api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-assistant-api-key': apiKey },
        body: JSON.stringify({
          message: text, history: prior, provider: providerSelect.value,
          ...(providerSelect.value === 'custom' ? {
            endpoint: get('#assistantEndpoint').value.trim(),
            model: get('#assistantModel').value.trim(),
          } : {}),
          ...(providerSelect.value === 'cloudflare' ? { accountId: get('#assistantAccountId').value.trim() } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(result.error || '小助手暫時無法回應。');
      bubble('bot', result.answer);
      history.push({ role: 'user', text }, { role: 'assistant', text: result.answer.slice(0, 500) });
      history = history.slice(-6);
    } catch (error) {
      bubble('bot', error?.message || '連線失敗，請稍後再試。');
    } finally {
      busy = false;
      get('#assistantForm button').disabled = false;
    }
  }

  launcher.addEventListener('click', () => setOpen(panel.hidden));
  get('#assistantClose').addEventListener('click', () => setOpen(false));
  get('#assistantForm').addEventListener('submit', event => {
    event.preventDefault();
    ask(input.value);
  });
  get('#assistantKeyForm').addEventListener('submit', event => {
    event.preventDefault();
    const field = get('#assistantKeyInput');
    const value = field.value.trim();
    if (!value) {
      get('#assistantKeyStatus').textContent = '請先輸入 API Key。';
      return;
    }
    if (providerSelect.value === 'custom' && (!get('#assistantEndpoint').value.trim() || !get('#assistantModel').value.trim())) {
      get('#assistantKeyStatus').textContent = '請先填寫 API 網址和模型名稱。';
      return;
    }
    if (providerSelect.value === 'cloudflare' && !get('#assistantAccountId').value.trim()) {
      get('#assistantKeyStatus').textContent = '請先填寫 Cloudflare Account ID。';
      return;
    }
    apiKey = value;
    field.value = '';
    history = [];
    get('#assistantKeyStatus').textContent = `已在目前頁面啟用 ${providerNames[providerSelect.value]} 小助手；重新整理後需重新輸入 Key。`;
  });
  get('#assistantClearKey').addEventListener('click', () => {
    apiKey = '';
    history = [];
    get('#assistantKeyInput').value = '';
    get('#assistantKeyStatus').textContent = '已清除 Key。現在可繼續詢問五個工具的基本操作。';
  });
  providerSelect.addEventListener('change', () => {
    apiKey = '';
    history = [];
    get('#assistantCustomFields').hidden = providerSelect.value !== 'custom';
    get('#assistantCloudflareFields').hidden = providerSelect.value !== 'cloudflare';
    get('#assistantKeyInput').value = '';
    get('#assistantKeyInput').placeholder = providerSelect.value === 'cloudflare' ? '貼上 Workers AI API Token' : `貼上你的 ${providerNames[providerSelect.value]} API Key`;
    get('#assistantKeyStatus').textContent = providerSelect.value === 'cloudflare'
      ? '請輸入自己的 Cloudflare Account ID 與 Workers AI API Token；Token 僅留在目前頁面。'
      : providerSelect.value === 'custom'
      ? '請填可信任服務商的 API 網址、模型與 Key；Key 會送往該網址。'
      : `已切換到 ${providerNames[providerSelect.value]}，請輸入該平台的 API Key。`;
  });
  document.querySelectorAll('[data-tip]').forEach(button => button.addEventListener('click', () => ask(button.dataset.tip)));
})();
