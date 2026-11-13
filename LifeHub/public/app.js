const $=s=>document.querySelector(s);let token='',state=null,liffProfile=null,browserDemo=false;const isDemo=()=>token==='lifehub-local-demo-token';
const reportKey='lifehub:lastError';
function clearError(){const notice=$('#errorNotice');if(notice)notice.hidden=true;try{sessionStorage.removeItem(reportKey)}catch{}}
function showError(error,fallbackTool='整體／不確定'){
  const detail=error?.report||{};
  const message=String(error?.message||'操作失敗，請稍後再試。').slice(0,180);
  const issue={source:'app-error',category:detail.category||'畫面或操作問題',tool:detail.tool||fallbackTool,description:message,steps:detail.endpoint?`操作：${detail.endpoint}${detail.status?`；HTTP ${detail.status}`:''}`:'LifeHub 畫面操作時發生錯誤',at:Date.now()};
  try{sessionStorage.setItem(reportKey,JSON.stringify(issue))}catch{}
  $('#errorMessage').textContent=message;
  if(!$('#modal').hidden)$('#modal').hidden=true;
  $('#errorNotice').hidden=false;
  window.scrollTo(0,0);
}
async function boot(){
  if(window.LIFF_ID&&window.LIFEHUB_AUTH_READY){
    if(!window.liff){showError(new Error('LIFF SDK 載入失敗，請重新開啟。'));return}
    try{
      await liff.init({liffId:window.LIFF_ID});
      if(!liff.isLoggedIn()){liff.login();return}
      token=liff.getIDToken()||'';
      if(!token)throw Error('無法取得 LINE ID token，請確認 LIFF 的 openid scope。');
      try{liffProfile=await liff.getProfile()}catch(e){console.warn('LINE profile',e)}
    }catch(e){showError(e,'整體／不確定');return}
  }else if(['localhost','127.0.0.1'].includes(location.hostname)){
    const r=await fetch('/api/auth/demo',{method:'POST'});
    if(r.ok){token=(await r.json()).accessToken;$('#profile').textContent='D'}else{showError(new Error('本機 Demo 登入失敗。'));return}
  }else{
    browserDemo=true;
    $('.hero p').textContent='立即體驗五個工具。Demo 資料只保存在這個瀏覽器。';
  }
  if(liffProfile)$('#profile').textContent=(liffProfile.displayName||'☺').slice(0,1);
  $('#today').textContent=new Intl.DateTimeFormat('zh-TW',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
  await refresh();
  if(state&&new URLSearchParams(location.search).has('quick'))showQuick();
}
async function api(path,method='GET',data){
  const section=path.split('/').filter(Boolean)[0]||'state';
  const tool={expenses:'記帳',todos:'待辦',water:'喝水',shopping:'購物清單',habits:'習慣打卡'}[section]||'整體／不確定';
  const endpoint=`${method} /api/${section}`;
  if(browserDemo){try{return window.LifeHubBrowserDemo.request(path,method,data)}catch(error){error.report={category:method==='GET'?'資料顯示異常':'資料無法儲存',tool,endpoint};throw error}}
  let response;
  try{response=await fetch('/api'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})}
  catch{const error=new Error('網路連線失敗，請檢查網路後重試。');error.report={category:'畫面或操作問題',tool,endpoint};throw error}
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(result.error||'操作失敗');error.report={category:response.status===401?'無法登入':method==='GET'?'資料顯示異常':'資料無法儲存',tool,endpoint,status:response.status};throw error}
  return result;
}
async function refresh(){try{state=await api('/state');$('#expenseTotal').textContent='$'+Number(state.expenseTotal).toLocaleString();$('#todoCount').innerHTML=`${state.todos.filter(x=>!x.done).length} <small>件待辦</small>`;$('#waterSummary').innerHTML=`${state.waterToday.toLocaleString()} <small>ml</small>`;$('#waterHint').textContent=`目標 ${state.waterGoal.toLocaleString()} ml　→`;$('#waterMini').style.width=Math.min(100,state.waterToday/state.waterGoal*100)+'%';$('#shopCount').innerHTML=`${state.shopping.filter(x=>!x.checked).length} <small>項目</small>`;$('#habitCount').innerHTML=`${state.habits.length} <small>個習慣</small>`;if(state.demo&&!document.querySelector('.mode'))$('.brand').insertAdjacentHTML('beforeend',browserDemo?'<span class="mode">瀏覽器 Demo · 僅此裝置</span>':'<span class="mode">本機 Demo</span>');clearError()}catch(e){showError(e)}}
function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}function open(title,sub,html){$('#sheetContent').innerHTML=`<h2>${title}</h2><p class="sub">${sub}</p>${html}`;$('#modal').hidden=false}function close(){$('#modal').hidden=true}document.addEventListener('click',e=>{if(e.target.matches('[data-close]'))close()});
async function act(fn){try{await fn();await refresh();const name=$('#sheetContent h2')?.textContent;const tool={'記帳':'expense','待辦清單':'todo','喝水進度':'water','購物清單':'shopping','習慣打卡':'habit'}[name];if(!$('#modal').hidden&&tool)showTool(tool)}catch(e){showError(e,$('#sheetContent h2')?.textContent||'整體／不確定')}}const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function form(placeholder,button,extra=''){return `<form class="form-row" id="entry"><input name="title" placeholder="${placeholder}" required maxlength="120">${extra}<button class="btn">${button}</button></form>`}
function renderList(items,type){if(!items.length)return '<div class="empty">目前還沒有內容，新增一項開始吧 ✦</div>';return `<div class="list">${items.map(x=>`<div class="row ${x.done||x.checked?'done checked':''}"><input type="checkbox" ${x.done||x.checked?'checked':''} data-toggle="${type}" data-id="${x.id}"><span class="label">${esc(x.title)}</span>${type==='habit'?`<span class="meta">${x.streak?`🔥 ${x.streak} 天`:'尚未開始'}</span>${x.checkedToday?'<span class="meta">今日完成</span>':`<button class="btn soft" data-check="${x.id}">打卡</button>`}`:''}<button class="delete" data-delete="${type}" data-id="${x.id}" aria-label="刪除">×</button></div>`).join('')}</div>`}
function showTool(tool){if(tool==='expense'){open('記帳',`本月合計 $${state.expenseTotal.toLocaleString()}`,form('例如：午餐','記一筆','<input name="amount" type="number" min="1" placeholder="$ 金額" required style="max-width:120px">')+`<div class="list">${state.expenses.length?state.expenses.map(x=>`<div class="row"><span class="label">${esc(x.title)}</span><span class="meta">${new Date(x.created_at+'Z').toLocaleDateString('zh-TW')}</span><b>$${Number(x.amount).toLocaleString()}</b></div>`).join(''):'<div class="empty">本月還沒有支出紀錄</div>'}</div>`)}
if(tool==='todo'){open('待辦清單',`${state.todos.filter(x=>!x.done).length} 件待完成`,form('下一件要做的事','新增')+renderList(state.todos,'todo'))}
if(tool==='water'){const pct=Math.min(100,Math.round(state.waterToday/state.waterGoal*100));open('喝水進度',`今天已喝 ${state.waterToday.toLocaleString()} / ${state.waterGoal.toLocaleString()} ml`, `<div class="waterbar"><span style="width:${pct}%"></span></div><p style="font-size:12px;color:#829087">${pct}% · ${state.waterToday>=state.waterGoal?'目標達成，做得好！':'每一口都是照顧自己的開始。'}</p><div class="water-actions">${[150,250,300,500].map(n=>`<button class="btn soft" data-water="${n}">＋ ${n} ml</button>`).join('')}</div><form class="form-row" id="waterEntry"><input name="amount" type="number" placeholder="自訂 ml" min="1" required><button class="btn">記錄</button></form><form class="form-row" id="goalEntry"><input name="goal" type="number" value="${state.waterGoal}" min="250" max="10000" required><button class="btn soft">更新每日目標</button></form>`)}
if(tool==='shopping'){open('購物清單',`${state.shopping.filter(x=>!x.checked).length} 項還沒買`,form('要買什麼？','加入')+renderList(state.shopping,'shopping'))}
if(tool==='habit'){open('習慣打卡','每天一點點，累積成喜歡的自己。',form('例如：運動 20 分鐘','新增')+renderList(state.habits,'habit'))}}
function showQuick(){open('快速記錄','選一個工具，馬上新增今天的紀錄。',`<div class="quick-grid">${[['expense','↗ 記帳'],['todo','✓ 待辦'],['water','◒ 喝水'],['shopping','▱ 購物'],['habit','✳ 習慣打卡']].map(([key,label])=>`<button class="btn soft" data-quick-tool="${key}">${label}</button>`).join('')}</div>`)}
$('#modal').addEventListener('click',e=>{const quick=e.target.closest('[data-quick-tool]');if(quick)showTool(quick.dataset.quickTool)});
$('#cards').addEventListener('click',e=>{const card=e.target.closest('[data-tool]');if(card)showTool(card.dataset.tool)});
$('#modal').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(e.target.id==='entry'){const tool=$('#sheetContent h2').textContent;act(async()=>{if(tool==='記帳')await api('/expenses','POST',{title:d.title,amount:Number(d.amount)});if(tool==='待辦清單')await api('/todos','POST',{title:d.title});if(tool==='購物清單')await api('/shopping','POST',{title:d.title});if(tool==='習慣打卡')await api('/habits','POST',{title:d.title});showTool({記帳:'expense',待辦清單:'todo',購物清單:'shopping',習慣打卡:'habit'}[tool]);toast('已新增 ✦')})}if(e.target.id==='waterEntry')act(()=>api('/water','POST',{amount:Number(d.amount)}).then(()=>{showTool('water');toast('喝水紀錄已更新')}));if(e.target.id==='goalEntry')act(()=>api('/water/goal','PUT',{goal:Number(d.goal)}).then(()=>{showTool('water');toast('每日目標已更新')}))});
$('#modal').addEventListener('click',e=>{const t=e.target.closest('[data-toggle]'),del=e.target.closest('[data-delete]'),check=e.target.closest('[data-check]'),water=e.target.closest('[data-water]');if(t)act(()=>api(`/${t.dataset.toggle==='todo'?'todos':'shopping'}/${t.dataset.id}`,'PATCH',t.dataset.toggle==='todo'?{done:t.checked}:{checked:t.checked}).then(()=>showTool(t.dataset.toggle==='todo'?'todo':'shopping')));if(del)act(()=>api(`/${del.dataset.delete==='todo'?'todos':del.dataset.delete==='shopping'?'shopping':'habits'}/${del.dataset.id}`,'DELETE').then(()=>{showTool(del.dataset.delete==='todo'?'todo':del.dataset.delete==='shopping'?'shopping':'habit');toast('已刪除')}));if(check)act(()=>api(`/habits/${check.dataset.check}/check`,'POST',{}).then(()=>{showTool('habit');toast('今日打卡成功 ✦')}));if(water)act(()=>api('/water','POST',{amount:Number(water.dataset.water)}).then(()=>{showTool('water');toast('已記錄喝水 ✦')}))});
$('#helpLink').onclick=()=>location.href='/slides.html#howto';$('#report').onclick=()=>location.href='/report.html';$('#errorRetry').onclick=()=>location.reload();window.addEventListener('error',()=>showError(new Error('畫面發生錯誤，請重新載入後再試。')));window.addEventListener('unhandledrejection',()=>showError(new Error('操作未完成，請重新載入後再試。')));boot();
