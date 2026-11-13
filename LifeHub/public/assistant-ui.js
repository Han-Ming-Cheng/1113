(() => {
  const get = selector => document.querySelector(selector);
  const panel = get('#assistantPanel');
  const launcher = get('#assistantLauncher');
  const messages = get('#assistantMessages');
  const input = get('#assistantInput');
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
  function localHelp(question) {
    if (/今日摘要|今天摘要/.test(question)) {
      const state = window.LifeHubSummary?.();
      if (!state) return '資料還在載入，請稍後再問一次。';
      return `今天的 LifeHub：本月支出 $${Number(state.expenseTotal).toLocaleString()}；未完成待辦 ${state.todos.filter(item => !item.done).length} 件；喝水 ${state.waterToday}/${state.waterGoal} ml；待買 ${state.shopping.filter(item => !item.checked).length} 件；今日打卡 ${state.habits.filter(item => item.checkedToday).length} 次。`;
    }
    if (/記帳|支出|花費/.test(question)) return '點首頁「記帳」卡片，輸入項目與金額後按「記一筆」；卡片會顯示本月總額。';
    if (/待辦|任務/.test(question)) return '點「待辦清單」新增事項，完成後勾選；不需要的事項可按 × 刪除。';
    if (/喝水|飲水/.test(question)) return '點「喝水提醒」可快速記錄 150、250、300 或 500 ml，也能修改每日目標。';
    if (/購物|採買/.test(question)) return '點「購物清單」新增品項；買到後勾選，或按 × 刪除。';
    if (/習慣|打卡/.test(question)) return '點「習慣打卡」新增習慣，每天按一次「打卡」，就能查看連續天數。';
    if (/錯誤|問題|回報/.test(question)) return '首頁五張卡片下方有「填寫問題回報」。操作失敗時也會出現「回報這個錯誤」，表單會帶入錯誤資訊。';
    return '我可以教你使用記帳、待辦、喝水、購物清單與習慣打卡。若想自由提問，請先在下方設定自己的 OpenAI API Key。';
  }
  async function ask(question) {
    if (busy || !question.trim()) return;
    const text = question.trim().slice(0, 500);
    bubble('user', text);
    input.value = '';
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
        headers: { 'content-type': 'application/json', 'x-openai-api-key': apiKey },
        body: JSON.stringify({ message: text, history: prior }),
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
    apiKey = value;
    field.value = '';
    history = [];
    get('#assistantKeyStatus').textContent = '已在目前頁面啟用 OpenAI 小助手；重新整理後需重新輸入 Key。';
  });
  get('#assistantClearKey').addEventListener('click', () => {
    apiKey = '';
    history = [];
    get('#assistantKeyInput').value = '';
    get('#assistantKeyStatus').textContent = '已清除 Key。現在可繼續詢問五個工具的基本操作。';
  });
  document.querySelectorAll('[data-tip]').forEach(button => button.addEventListener('click', () => ask(button.dataset.tip)));
})();
