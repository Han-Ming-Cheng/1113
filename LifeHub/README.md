# LifeHub｜LINE 五合一智慧生活助手

正式 LINE 串接、Cloudflare 變數、圖文選單與驗收步驟請看 [LINE_SETUP.md](LINE_SETUP.md)。

手機優先的 LINE LIFF 生活工具作品：記帳、待辦、喝水、購物清單、習慣打卡。Cloudflare Worker 提供頁面/API/Webhook，D1 保存經 LINE 驗證使用者的正式資料。LINE 尚未設定完成時，公開首頁會啟用瀏覽器 Demo，五個工具可直接操作，資料只保存在使用者自己的瀏覽器。正式 API 不接受前端指定 userId。

作品入口：`https://lifehub-line-five-in-one.han890131.workers.dev/`；問題回報：`/report.html`；互動說明簡報：`/slides.html`。

交作業可直接開啟 `https://lifehub-line-five-in-one.han890131.workers.dev/?demo=1`，強制進入五項工具的瀏覽器 Demo。若雲端部署尚未更新，也可直接開啟 `public/index.html` 體驗同一個前端 Demo；資料保存在目前瀏覽器。這些 Demo 資料不會寫入 D1。

## LifeHub 小助手

主畫面右下角的「✳ 小助手」可自由聊天、回答五個工具的操作問題、查詢目前畫面的今日摘要，也能替使用者新增資料。設定任一平台的憑證後可聊天，聊天會帶上最近六則問答作為上下文。輸入 `記帳 午餐 120`、`待辦 買牛奶`、`喝水 300`、`購物 雞蛋`、`新增習慣 運動`、`打卡 運動` 或 `設定喝水目標 2000`，確認預覽後才會寫入目前模式的資料來源。瀏覽器 Demo 寫入目前瀏覽器；LINE 驗證模式寫入 D1。這些指令不需要任何 AI 平台的 API Key。記帳紀錄若填錯，可在記帳介面按「修改」更正項目與金額，或按「刪除」並確認；本月總額會立即重算。

首頁右下角開啟「小助手」後，憑證區會直接展開並預選 Cloudflare；填入 Account ID 和 Workers AI API Token，按「設定」即可聊天。也可選 OpenAI（`gpt-6-luna`）、Google Gemini（`gemini-3.8-flash`）、Anthropic Claude（`claude-haiku-5-5`）、Cloudflare Workers AI（`@cf/google/gemma-4-26b-a4b-it`），或「自訂相容 API」。Cloudflare 選項需輸入自己的 **Account ID** 與 **Workers AI API Token**；請在 Cloudflare Dashboard 的 Workers AI → Use REST API 建立專用 Token。其他平台需各自的 Key。自訂選項須填服務商提供的 HTTPS Chat Completions 網址（以 `/chat/completions` 結尾）、模型名稱與 Key。Key／Token 僅存在目前頁面的記憶體，重新整理即清除，不寫入 Git、D1、localStorage 或網址。聊天經 Worker 轉送至所選服務，帶上最近六則對話；未設定憑證時仍可使用基本操作說明與確認後寫入資料。四個平台目前僅有 Mock 測試，尚未在正式站使用真實憑證驗證。

## 本機 Demo（零 npm 依賴）

需求：Python 3.9+。不需要安裝 npm 套件，也不需要網路連線：

```sh
cd /Users/hanmingcheng/LifeHub
python3 local_demo.py
```

在同一台電腦開啟 http://127.0.0.1:8787。SQLite 檔案保存在 `.local/lifehub.sqlite3`，資料會在重啟後保留。按 Ctrl-C 停止；刪除該 SQLite 檔案可重置 Demo。此模式固定綁定 localhost，登入標籤會顯示「本機 Demo」。

五項工具共用與 Worker 版相同的 API 欄位；在本機可新增、勾選、刪除、追蹤進度及連續打卡。LINE SDK 在沒有 LIFF ID 時不會啟用。

## Cloudflare 設定及部署

1. 安裝 Node.js 22.6+（`npm test` 使用 Node 原生 TypeScript strip 測試；部署本身需 Wrangler 支援的 Node.js），執行 `npm install`、`npx wrangler login`。
2. 建立 D1：`npx wrangler d1 create lifehub-db`，將輸出的 `database_id` 填入 `wrangler.toml`。
3. `npm run db:local` 建本機 schema；正式環境執行 `npm run db:remote`。
4. `npx wrangler secret put LINE_CHANNEL_ID`、`npx wrangler secret put LINE_CHANNEL_SECRET`、`npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN`，依提示輸入值。不要把秘密寫進 Git 或 `wrangler.toml`。LIFF ID 不是秘密，可在 `wrangler.toml` 的 `[vars]` 加 `LIFF_ID = "..."`。
5. `PUBLIC_BASE_URL` 可在 `[vars]` 設為部署網址，用於文件參照；應用不依賴它生成回呼網址。
6. `npm run deploy`。Worker 免費方案含 D1/Workers 免費用量限制，供小規模展示；請在 Cloudflare 儀表板檢查當期配額。

### 從 GitHub 部署完整 Worker

此 repo 同時保留原有根目錄網站。LifeHub Worker 的 Wrangler 設定位於 `LifeHub/wrangler.toml`，請建立一個**新的** Worker，不要把舊的 `1113` 靜態網站改成 LifeHub：

- Repository：`Han-Ming-Cheng/1113`；Branch：`main`
- Root directory：`LifeHub`（不可選 repo 根目錄）
- Worker name：`lifehub-line-five-in-one`
- Build command：`npm run build`（會執行 TypeScript typecheck）
- Deploy command：`npm run deploy`

`wrangler.toml` 的 `main = "src/index.ts"` 指向 Worker `fetch()` 入口；`[assets]` 使用 `./public`，binding 為 `ASSETS`；D1 binding 為 `DB`。`run_worker_first` 會將 `/api/*`、`/health`、`/webhook`、`/config.js` 交給 Worker 程式處理，其他靜態檔由 Workers Assets 提供。後端路由在 `src/index.ts`。

設定完成後先手動 Redeploy 一次，再開啟 `<worker-url>/health`；正式網址尚未設定 LINE channel 時會回報 `unconfigured`，首頁仍可用瀏覽器 Demo 體驗。部署後若 D1 初始化 SQL 已在 Cloudflare Console 執行，就不需重建資料庫。

## LINE Developers 設定

1. 建立 LINE Developers Provider；建立 LINE Login channel 和 Messaging API channel。兩個 channel 綁定同一 Provider。將 Login channel 的 Channel ID 設為 Worker `LINE_CHANNEL_ID`；Messaging API channel 的 Channel secret 和 Channel access token 各設為對應 Worker secret。
2. 在 LINE Login channel 建立 LIFF app，Endpoint URL 設為 `https://<worker-host>/`，Scope 至少選 `openid`、`profile`。把 LIFF ID 放到 Worker vars。LIFF 以 HTTPS 開啟，透過 `/config.js` 提供 LIFF ID，前端呼叫 `liff.getIDToken()`，Worker POST 至 LINE `/oauth2/v2.1/verify`，再以驗證結果的 `sub` 作為資料 user ID。正式環境不提供 Demo 登入。
3. 在 Messaging API channel 設 Webhook URL `https://<worker-host>/webhook`，啟用 Use webhook，按 Verify。Worker 對原始 request body 用 channel secret 驗證 `x-line-signature` (HMAC-SHA256)；驗證失敗回 401。
4. LINE OA Manager 的回應設定關閉會攔截指令的自動回應，並視需要開啟加入好友歡迎訊息。
5. 建立圖文選單，使用 `public/menu.html` 下載 PNG，或使用本機 `public/line-richmenu-2500x843.png`（2500×843）。三格 URL 及區域座標請看 `LINE_SETUP.md`。快速記錄區以 LIFF URL 的 `?quick=1` 開啟快速新增面板。

### Messaging API 指令

- `記帳 午餐 120`
- `待辦 買牛奶`
- `喝水 300`
- `購物 雞蛋`
- `打卡 運動`（不存在的習慣會先建立再打卡）
- `今日摘要`
- `幫助`

Webhook 來源 userId 是 LINE 簽章驗證過的事件來源；各筆資料均以該 ID 寫入。快捷指令可新增資料及摘要；待辦完成、刪除等管理請在 LIFF 操作。

## 互動簡報與圖文選單

- `/slides.html` 有 6 頁互動簡報，鍵盤左右鍵/按鈕切換。點「下載 PDF / 列印」，在系統列印視窗選「儲存為 PDF」。
- 圖文選單 PNG 已產生於 `public/line-richmenu-2500x843.png`。重製：`python3 scripts/generate-menu.py`（或 `npm run menu`）。
- 首頁五張功能卡下方的「填寫問題回報」會開啟 `/report.html`。操作失敗時會出現「回報這個錯誤」，表單自動帶入功能、錯誤訊息與操作資訊；使用者確認後可複製、分享或下載文字，再貼至 LINE 官方帳號，不建客服後台。

## 測試清單

本機 UI：啟動後新增支出並查看本月合計；新增/完成/刪除待辦；記錄飲水、改目標、確認進度；新增/勾選/刪除購物項目；新增習慣、打卡、查看連續天數；重整頁面確認 SQLite 保存。

API 安全：未帶 Bearer token 的 `/api/state` 預期 401；本機 Demo token 只在未設 `LINE_CHANNEL_ID` 時接受；正式環境應驗證無效/過期/不同 audience 的 LIFF token 為 401。Webhook 用錯誤簽章預期 401；正確簽章才會處理事件。用兩個 LINE 帳號各新增資料，確認彼此看不到對方資料。

自動化本機測試：`npm test`（測試 Demo API 與 Worker fetch/API 路由，包括 D1 的喝水目標 PUT）；`npm run typecheck`；`npm run build`。Cloudflare Worker 真正的遠端部署仍需在 Cloudflare Workers Builds 執行並查看 build log。

本機 Python Demo 可離線啟動。雲端部署、LINE 身分驗證與 Messaging API 尚未驗證；需在具備 npm registry 網路（或改用本機 Python Demo）、LINE 憑證與 Cloudflare 授權的環境執行上述步驟。
