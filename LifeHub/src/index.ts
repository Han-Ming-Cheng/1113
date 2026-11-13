export interface Env {
  DB: D1Database; ASSETS: Fetcher; LIFF_ID?: string; LINE_CHANNEL_ID?: string;
  LINE_CHANNEL_SECRET?: string; LINE_CHANNEL_ACCESS_TOKEN?: string; PUBLIC_BASE_URL?: string;
}
type Ctx = { userId: string; demo: boolean };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const id = () => crypto.randomUUID();
const day = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (part: string) => parts.find(p => p.type === part)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const month = () => day().slice(0, 7);
const fail = (message: string, status = 400) => json({ error: message }, status);
const isLocal = (req: Request) => ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname);
async function authenticate(req: Request, env: Env): Promise<Ctx | Response> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return fail('請先登入 LIFF 或啟用本機 Demo。', 401);
  if (!env.LINE_CHANNEL_ID) {
    if (!isLocal(req)) return fail('LINE 登入尚未設定。', 503);
    if (token !== 'lifehub-local-demo-token') return fail('本機 Demo token 無效。', 401);
    return { userId: 'local-demo-user', demo: true };
  }
  const form = new URLSearchParams({ id_token: token, client_id: env.LINE_CHANNEL_ID });
  const verify = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  if (!verify.ok) return fail('LINE 身分驗證失敗，請重新登入。', 401);
  const claims = await verify.json() as { sub?: string; aud?: string; exp?: number; iss?: string };
  if (!claims.sub || claims.aud !== env.LINE_CHANNEL_ID || (claims.exp ?? 0) <= Date.now() / 1000 || claims.iss !== 'https://access.line.me') return fail('LIFF token claims 無效。', 401);
  return { userId: claims.sub, demo: false };
}
async function lineSignatureValid(raw: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const encoded = btoa(String.fromCharCode(...digest));
  return encoded === signature;
}
const txt = (s: string) => s.trim().slice(0, 120);
async function dataApi(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const u = new URL(req.url), p = u.pathname.replace(/^\/api/, ''), method = req.method;
  const db = env.DB, user = ctx.userId;
  if (p === '/state' && method === 'GET') {
    const [expenses, expSum, todos, waterRows, setting, shopping, habits] = await Promise.all([
      db.prepare("SELECT id,title,amount,created_at FROM expenses WHERE user_id=? AND strftime('%Y-%m',created_at,'+8 hours')=? ORDER BY created_at DESC LIMIT 30").bind(user, month()).all(),
      db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE user_id=? AND strftime('%Y-%m',created_at,'+8 hours')=?").bind(user, month()).first<{total:number}>(),
      db.prepare('SELECT id,title,done,created_at FROM todos WHERE user_id=? ORDER BY done,created_at DESC LIMIT 100').bind(user).all(),
      db.prepare("SELECT COALESCE(SUM(amount),0) total FROM water_logs WHERE user_id=? AND date(created_at,'+8 hours')=?").bind(user, day()).first<{total:number}>(),
      db.prepare('SELECT daily_goal FROM water_settings WHERE user_id=?').bind(user).first<{daily_goal:number}>(),
      db.prepare('SELECT id,title,checked,created_at FROM shopping_items WHERE user_id=? ORDER BY checked,created_at DESC').bind(user).all(),
      db.prepare('SELECT id,title,created_at FROM habits WHERE user_id=? ORDER BY created_at').bind(user).all()
    ]);
    const enriched = await Promise.all((habits.results as {id:string;title:string;created_at:string}[]).map(async h => {
      const logs = await db.prepare('SELECT day FROM habit_logs WHERE user_id=? AND habit_id=? ORDER BY day DESC LIMIT 400').bind(user,h.id).all<{day:string}>();
      const dates = new Set(logs.results.map(x=>x.day)); let streak=0; const d=new Date(`${day()}T00:00:00Z`);
      if (!dates.has(day())) d.setUTCDate(d.getUTCDate()-1);
      while (dates.has(d.toISOString().slice(0,10))) { streak++; d.setUTCDate(d.getUTCDate()-1); }
      return {...h, streak, checkedToday: dates.has(day())};
    }));
    const goal=setting?.daily_goal ?? 2000;
    return json({ demo:ctx.demo, expenses:expenses.results, expenseTotal:expSum?.total??0, todos:todos.results, waterToday:waterRows?.total??0, waterGoal:goal, shopping:shopping.results, habits:enriched, today:day(), month:month() });
  }
  const body = ['POST','PATCH','PUT'].includes(method) ? await req.json().catch(()=>null) as Record<string, unknown>|null : null;
  if (!body && ['POST','PATCH','PUT'].includes(method)) return fail('無法讀取資料。');
  if (p === '/expenses' && method === 'POST') { const title=txt(String(body?.title??'')), amount=Number(body?.amount); if(!title||!Number.isInteger(amount)||amount<1)return fail('請輸入項目與正整數金額。'); await db.prepare('INSERT INTO expenses(id,user_id,title,amount) VALUES(?,?,?,?)').bind(id(),user,title,amount).run(); return json({ok:true},201); }
  if (p === '/todos' && method === 'POST') { const title=txt(String(body?.title??'')); if(!title)return fail('請輸入待辦內容。'); const item=id(); await db.prepare('INSERT INTO todos(id,user_id,title) VALUES(?,?,?)').bind(item,user,title).run(); return json({ok:true,id:item},201); }
  if (p.startsWith('/todos/') && method === 'PATCH') { const item=p.split('/')[2]; await db.prepare('UPDATE todos SET done=? WHERE id=? AND user_id=?').bind(body?.done?1:0,item,user).run(); return json({ok:true}); }
  if (p.startsWith('/todos/') && method === 'DELETE') { await db.prepare('DELETE FROM todos WHERE id=? AND user_id=?').bind(p.split('/')[2],user).run(); return json({ok:true}); }
  if (p === '/water' && method === 'POST') { const amount=Number(body?.amount); if(!Number.isInteger(amount)||amount<1||amount>5000)return fail('飲水量需介於 1–5000 ml。'); await db.prepare('INSERT INTO water_logs(id,user_id,amount) VALUES(?,?,?)').bind(id(),user,amount).run(); return json({ok:true},201); }
  if (p === '/water/goal' && method === 'PUT') { const goal=Number(body?.goal); if(!Number.isInteger(goal)||goal<250||goal>10000)return fail('目標需介於 250–10000 ml。'); await db.prepare('INSERT INTO water_settings(user_id,daily_goal) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET daily_goal=excluded.daily_goal').bind(user,goal).run(); return json({ok:true}); }
  if (p === '/shopping' && method === 'POST') { const title=txt(String(body?.title??'')); if(!title)return fail('請輸入購物項目。'); const item=id(); await db.prepare('INSERT INTO shopping_items(id,user_id,title) VALUES(?,?,?)').bind(item,user,title).run(); return json({ok:true,id:item},201); }
  if (p.startsWith('/shopping/') && method === 'PATCH') { await db.prepare('UPDATE shopping_items SET checked=? WHERE id=? AND user_id=?').bind(body?.checked?1:0,p.split('/')[2],user).run(); return json({ok:true}); }
  if (p.startsWith('/shopping/') && method === 'DELETE') { await db.prepare('DELETE FROM shopping_items WHERE id=? AND user_id=?').bind(p.split('/')[2],user).run(); return json({ok:true}); }
  if (p === '/habits' && method === 'POST') { const title=txt(String(body?.title??'')); if(!title)return fail('請輸入習慣名稱。'); try { await db.prepare('INSERT INTO habits(id,user_id,title) VALUES(?,?,?)').bind(id(),user,title).run(); } catch { return fail('這個習慣已經存在。'); } return json({ok:true},201); }
  if (p.startsWith('/habits/') && p.endsWith('/check') && method === 'POST') { const habit=p.split('/')[2]; await db.prepare('INSERT OR IGNORE INTO habit_logs(id,habit_id,user_id,day) SELECT ?,id,?,? FROM habits WHERE id=? AND user_id=?').bind(id(),user,day(),habit,user).run(); return json({ok:true}); }
  if (p.startsWith('/habits/') && method === 'DELETE') { await db.prepare('DELETE FROM habits WHERE id=? AND user_id=?').bind(p.split('/')[2],user).run(); return json({ok:true}); }
  return fail('找不到此 API。',404);
}
async function replyLine(env:Env, token:string, message:string) {
  if(!env.LINE_CHANNEL_ACCESS_TOKEN)return;
  await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({replyToken:token,messages:[{type:'text',text:message.slice(0,5000)}]})});
}
async function handleWebhook(req:Request,env:Env):Promise<Response>{
  const raw=await req.text();
  if(!env.LINE_CHANNEL_SECRET||!await lineSignatureValid(raw,req.headers.get('x-line-signature'),env.LINE_CHANNEL_SECRET))return fail('Invalid LINE signature',401);
  const payload=JSON.parse(raw) as {events?:Array<{type:string;webhookEventId?:string;replyToken:string;source?:{userId?:string};message?:{type:string;text?:string}}>};
  const help='可用指令：\n記帳 午餐 120\n待辦 買牛奶\n喝水 300\n購物 雞蛋\n打卡 運動\n今日摘要\n幫助';
  for(const e of payload.events??[]){
    if(e.type!=='message'||e.message?.type!=='text'||!e.source?.userId)continue;
    const user=e.source.userId, eventId=e.webhookEventId||id(), input=(e.message.text??'').trim();
    const parts=input.split(/\s+/), command=parts.shift()??'', arg=parts.join(' ');
    let result=help;
    if(command==='記帳'){
      const m=arg.match(/^(.+?)\s+(\d+)$/), amount=m?Number(m[2]):0;
      if(m&&Number.isSafeInteger(amount)&&amount>0){
        await env.DB.prepare('INSERT OR IGNORE INTO expenses(id,user_id,title,amount) VALUES(?,?,?,?)').bind(eventId,user,txt(m[1]),amount).run();
        result=`已記帳：${m[1]} $${amount}`;
      }else result='格式：記帳 午餐 120';
    }else if(command==='待辦'&&arg){
      await env.DB.prepare('INSERT OR IGNORE INTO todos(id,user_id,title) VALUES(?,?,?)').bind(eventId,user,txt(arg)).run();
      result=`已新增待辦：${arg}`;
    }else if(command==='喝水'){
      const amount=Number(arg);
      if(/^\d+$/.test(arg)&&Number.isSafeInteger(amount)&&amount>=1&&amount<=5000){
        await env.DB.prepare('INSERT OR IGNORE INTO water_logs(id,user_id,amount) VALUES(?,?,?)').bind(eventId,user,amount).run();
        result=`已記錄飲水 ${amount} ml。`;
      }else result='格式：喝水 300（1–5000 ml）';
    }else if(command==='購物'&&arg){
      await env.DB.prepare('INSERT OR IGNORE INTO shopping_items(id,user_id,title) VALUES(?,?,?)').bind(eventId,user,txt(arg)).run();
      result=`已加入購物清單：${arg}`;
    }else if(command==='打卡'&&arg){
      const title=txt(arg);
      await env.DB.prepare('INSERT OR IGNORE INTO habits(id,user_id,title) VALUES(?,?,?)').bind(eventId,user,title).run();
      const habit=await env.DB.prepare('SELECT id FROM habits WHERE user_id=? AND title=?').bind(user,title).first<{id:string}>();
      if(habit)await env.DB.prepare('INSERT OR IGNORE INTO habit_logs(id,habit_id,user_id,day) VALUES(?,?,?,?)').bind(eventId,habit.id,user,day()).run();
      result=`✅ ${title} 已完成今日打卡！`;
    }else if(command==='今日摘要'){
      const [todayExpense,monthExpense,todo,water,goal,shopping,habits]=await Promise.all([
        env.DB.prepare("SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE user_id=? AND date(created_at,'+8 hours')=?").bind(user,day()).first<{n:number}>(),
        env.DB.prepare("SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE user_id=? AND strftime('%Y-%m',created_at,'+8 hours')=?").bind(user,month()).first<{n:number}>(),
        env.DB.prepare('SELECT COUNT(*) n FROM todos WHERE user_id=? AND done=0').bind(user).first<{n:number}>(),
        env.DB.prepare("SELECT COALESCE(SUM(amount),0) n FROM water_logs WHERE user_id=? AND date(created_at,'+8 hours')=?").bind(user,day()).first<{n:number}>(),
        env.DB.prepare('SELECT daily_goal n FROM water_settings WHERE user_id=?').bind(user).first<{n:number}>(),
        env.DB.prepare('SELECT COUNT(*) n FROM shopping_items WHERE user_id=? AND checked=0').bind(user).first<{n:number}>(),
        env.DB.prepare('SELECT COUNT(*) n FROM habit_logs WHERE user_id=? AND day=?').bind(user,day()).first<{n:number}>()
      ]);
      result=`📊 LifeHub 今日摘要\n今日支出：$${todayExpense?.n??0}（本月 $${monthExpense?.n??0}）\n待辦未完成：${todo?.n??0} 件\n今日喝水：${water?.n??0}/${goal?.n??2000} ml\n待買項目：${shopping?.n??0} 件\n今日習慣打卡：${habits?.n??0} 次`;
    }
    await replyLine(env,e.replyToken,result);
  }
  return new Response('OK');
}
async function handleAssistant(req:Request):Promise<Response>{
  const origin=req.headers.get('origin');
  if(origin&&origin!==new URL(req.url).origin)return fail('請從 LifeHub 頁面使用小助手。',403);
  const key=req.headers.get('x-assistant-api-key')?.trim()??'';
  if(!key||key.length>500||/[\r\n]/.test(key))return fail('請先在小助手設定所選平台的 API Key。');
  const raw=await req.text();
  if(raw.length>12000)return fail('訊息太長。',413);
  let data:{message?:unknown;history?:unknown;provider?:unknown;endpoint?:unknown;model?:unknown};
  try{data=JSON.parse(raw)}catch{return fail('訊息格式錯誤。')}
  const provider=data.provider;
  if(provider!=='openai'&&provider!=='gemini'&&provider!=='anthropic'&&provider!=='custom')return fail('不支援的 AI 平台。');
  let customEndpoint='';
  let customModel='';
  if(provider==='custom'){
    if(typeof data.endpoint!=='string'||data.endpoint.length>500||typeof data.model!=='string'||data.model.length>120)return fail('請填寫相容 API 網址和模型名稱。');
    let endpoint:URL;
    try{endpoint=new URL(data.endpoint)}catch{return fail('相容 API 網址格式錯誤。')}
    const host=endpoint.hostname.toLowerCase().replace(/\.$/,'');
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.port||endpoint.search||endpoint.hash||!host.includes('.')||host.startsWith('[')||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)||!/\/chat\/completions\/?$/.test(endpoint.pathname))return fail('請填寫公開 HTTPS 網址，路徑須以 /chat/completions 結尾。');
    customModel=data.model.trim();
    if(!/^[A-Za-z0-9._:/-]{1,120}$/.test(customModel))return fail('模型名稱格式錯誤。');
    customEndpoint=endpoint.href;
  }
  const message=typeof data.message==='string'?data.message.trim():'';
  if(!message||message.length>500)return fail('請輸入 1–500 字的問題。');
  const history=Array.isArray(data.history)?data.history.slice(-6).filter((item:unknown):item is {role:string;text:string}=>{
    if(!item||typeof item!=='object')return false;
    const row=item as Record<string,unknown>;
    return (row.role==='user'||row.role==='assistant')&&typeof row.text==='string'&&row.text.length<=500;
  }):[];
  const conversation=history.map(item=>`${item.role==='user'?'使用者':'助手'}：${item.text}`).join('\n');
  const input=`${conversation?conversation+'\n':''}使用者：${message}`;
  const instructions='你是 LifeHub 五合一生活助手，請用繁體中文簡短回答。LifeHub 有記帳、待辦、喝水、購物清單、習慣打卡；使用者可點首頁卡片操作，也可在 LINE 聊天輸入指令。你只能提供說明與建議，不能宣稱已替使用者新增或修改資料。不要索取 API Key、密碼或 LINE 憑證。';
  let upstream:Response;
  try{
    if(provider==='openai')upstream=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
      body:JSON.stringify({
        model:'gpt-6-luna',
        reasoning:{effort:'low'},
        instructions,
        input,
        store:false,
        max_output_tokens:400,
      }),
    });
    else if(provider==='gemini')upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{
      method:'POST',
      headers:{'x-goog-api-key':key,'content-type':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:`${instructions}\n\n${input}`}]}],generationConfig:{maxOutputTokens:500}}),
    });
    else if(provider==='anthropic')upstream=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{authorization:`Bearer ${key}`,'anthropic-version':'2026-10-21','content-type':'application/json'},
      body:JSON.stringify({model:'claude-haiku-5-5',max_tokens:500,system:instructions,messages:[{role:'user',content:input}]}),
    });
    else upstream=await fetch(customEndpoint,{
      method:'POST',redirect:'error',
      headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
      body:JSON.stringify({model:customModel,messages:[{role:'system',content:instructions},{role:'user',content:input}],max_tokens:500}),
    });
  }catch{return fail('AI 服務暫時無法連線，請稍後再試。',502)}
  const providerName={openai:'OpenAI',gemini:'Gemini',anthropic:'Claude',custom:'自訂 AI'}[provider];
  if(!upstream.ok){
    if(upstream.status===401||upstream.status===403)return fail(`${providerName} API Key 無效或沒有權限，請重新設定。`,401);
    if(upstream.status===429)return fail(`${providerName} 額度或速率限制已達上限。`,429);
    return fail(`${providerName} 無法完成請求，請確認 API Key 和模型可用。`,502);
  }
  let result:unknown;
  try{result=await upstream.json()}catch{return fail('AI 回應格式錯誤。',502)}
  const body=result as {
    output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;
    candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>;
    content?:Array<{type?:string;text?:string}>;
    choices?:Array<{message?:{content?:string}}>;
  };
  const answer=(provider==='openai'
    ?body.output?.filter(item=>item.type==='message').flatMap(item=>item.content??[]).filter(item=>item.type==='output_text').map(item=>item.text??'').join('\n')
    :provider==='gemini'
      ?body.candidates?.[0]?.content?.parts?.map(item=>item.text??'').join('\n')
      :provider==='anthropic'
        ?body.content?.filter(item=>item.type==='text').map(item=>item.text??'').join('\n')
        :body.choices?.[0]?.message?.content)?.trim()??'';
  return answer?json({answer:answer.slice(0,3000)}):fail('AI 未回傳文字，請換個問法再試。',502);
}
export default { async fetch(req:Request,env:Env):Promise<Response>{
  const url=new URL(req.url);
  if(url.pathname==='/webhook'&&req.method==='POST')return handleWebhook(req,env);
  if(url.pathname==='/api/assistant'&&req.method==='POST')return handleAssistant(req);
  if(url.pathname==='/health')return json({
    ok:true,
    diagnosticVersion:'bindings-20261113',
    mode:env.LINE_CHANNEL_ID?'line-auth':isLocal(req)?'local-demo':'unconfigured',
    liffConfigured:!!env.LIFF_ID,
    messagingConfigured:!!(env.LINE_CHANNEL_SECRET&&env.LINE_CHANNEL_ACCESS_TOKEN),
    bindings:{
      LINE_CHANNEL_ID:!!env.LINE_CHANNEL_ID,
      LINE_CHANNEL_SECRET:!!env.LINE_CHANNEL_SECRET,
      LINE_CHANNEL_ACCESS_TOKEN:!!env.LINE_CHANNEL_ACCESS_TOKEN,
      LIFF_ID:!!env.LIFF_ID,
    },
  });
  if(url.pathname==='/config.js')return new Response(`window.LIFF_ID=${JSON.stringify(env.LIFF_ID??'')};window.LIFEHUB_AUTH_READY=${!!(env.LIFF_ID&&env.LINE_CHANNEL_ID)};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'}});
  if(url.pathname==='/api/auth/demo'&&req.method==='POST')return env.LINE_CHANNEL_ID||!isLocal(req)?fail('正式環境不提供 Demo 登入。',403):json({accessToken:'lifehub-local-demo-token',mode:'demo'});
  if(url.pathname.startsWith('/api/')){const ctx=await authenticate(req,env);if(ctx instanceof Response)return ctx;try{return await dataApi(req,env,ctx);}catch(e){console.error(e);return fail('資料操作失敗，請確認 D1 migration 已套用。',500);}}
  return env.ASSETS.fetch(req);
}};
