# LifeHub LINE 串接與驗收

正式網址：`https://lifehub-line-five-in-one.han890131.workers.dev/`。目前 Cloudflare D1 binding 名稱為 `DB`，資料庫 `lifehub-db`。LIFF 與 Webhook 的 LINE channel 必須位於**同一 Provider**，否則同一人的 LINE user ID 不同，網頁與聊天指令的資料無法合併。

## 1. 建立 LINE Login Channel 和 LIFF

1. 登入 [LINE Developers Console](https://developers.line.biz/console/)，選取已啟用 Messaging API 的官方帳號所在 **Provider**。
2. 在同一 Provider 內新增 **LINE Login** channel，應用類型選 **Web app**，填名稱、描述、電子郵件等欄位。此 LINE Login channel 的 **Channel ID** 是下表 `LINE_CHANNEL_ID`，不是 Messaging API channel ID。
3. 進入這個 LINE Login channel 的 **LIFF** 分頁，新增 LIFF App：Size 建議 **Full**；Endpoint URL 填 `https://lifehub-line-five-in-one.han890131.workers.dev/`；Scopes 勾 **openid** 和 **profile**。建立後複製 LIFF ID。
4. 在新 Worker `lifehub-line-five-in-one` 的 **Settings → Variables and Secrets** 設定下表項目。若全部在 Dashboard 設定，`LIFF_ID` 也選 **Secret**（值本身不是機密，但 Secret 可在後續 Wrangler 部署中保留）；若要使用一般變數，請把 LIFF ID 寫入 GitHub 的 `wrangler.toml` `[vars]`。儲存後部署新版本。
5. 開啟 `https://liff.line.me/<LIFF_ID>`，同意授權後在首頁新增一筆測試資料並重整。`/health` 的 `mode` 應為 `line-auth`。如果 `openid` 沒選，前端無法取得 ID token。

LIFF 前端只傳 `liff.getIDToken()` 的原始 ID token。Worker 向 LINE 驗證端點檢查 channel ID、`sub`、`iss` 和過期時間，再以驗證後的 `sub` 查 D1。前端傳入的 `userId` 不會用於識別身分。

## 2. Messaging API Webhook

在同一 Provider 的 Messaging API channel 取得 Channel secret 與 Channel access token，分別設定到 Worker Secrets。Webhook URL：

`https://lifehub-line-five-in-one.han890131.workers.dev/webhook`

在 LINE Developers Console 開啟 **Use webhook** 並按 **Verify**。程式會先以 Messaging API Channel secret 驗證原始 request body 的 `x-line-signature`，才處理事件。新增類指令使用 LINE `webhookEventId` 作 D1 主鍵，SQL `INSERT OR IGNORE` 讓重送不重複記錄；習慣打卡另有 `(habit_id, day)` 唯一限制。

可用文字：`記帳 午餐 120`、`待辦 買牛奶`、`喝水 300`、`購物 雞蛋`、`打卡 運動`、`今日摘要`、`幫助`。

## 3. Cloudflare Variables and Secrets

| 名稱 | 類型 | 來源與用途 |
| --- | --- | --- |
| `LINE_CHANNEL_ID` | Secret | **LINE Login** channel ID；LIFF ID token 驗證時作 `client_id` / audience |
| `LINE_CHANNEL_SECRET` | Secret | **Messaging API** channel secret；Webhook HMAC-SHA256 驗簽 |
| `LINE_CHANNEL_ACCESS_TOKEN` | Secret | **Messaging API** channel access token；回覆聊天訊息 |
| `LIFF_ID` | Dashboard 設 Secret；或寫入 `wrangler.toml` `[vars]` 作一般變數 | **LINE Login channel 的 LIFF App** ID；前端 `liff.init()`。ID 會送到瀏覽器，並非真正機密 |
| `PUBLIC_BASE_URL` | 可省略 | 程式目前未使用；不是 LINE 串接的必要設定 |

Secret 不放到 GitHub、README 或聊天。`wrangler.toml` 的 `[vars]` 區塊沒有寫入任何憑證。
Cloudflare 的 Git 部署使用 Wrangler；Dashboard 上手動新增的一般變數可能在下一次部署被 Wrangler 設定覆寫。因此 LIFF ID 請依上表選擇一種可持續的設定方式。

## 4. 三格圖文選單

到 `https://lifehub-line-five-in-one.han890131.workers.dev/menu.html` 下載 2500 × 843 PNG，或使用本機 `public/line-richmenu-2500x843.png`。LINE Official Account Manager 建立三等分圖文選單並上傳圖片，三格位置參照 `public/richmenu-areas.json`：

| 區域 | 座標 (x, y, 寬, 高) | 動作 |
| --- | --- | --- |
| 生活管理 | 0, 0, 833, 843 | URI：`https://liff.line.me/<LIFF_ID>` |
| 快速記錄 | 833, 0, 833, 843 | URI：`https://liff.line.me/<LIFF_ID>/?quick=1` |
| 使用教學 | 1666, 0, 834, 843 | URI：`https://lifehub-line-five-in-one.han890131.workers.dev/slides.html` |

替換 `<LIFF_ID>` 後儲存並套用圖文選單，從 LINE 手機版官方帳號聊天視窗點擊驗收。快速記錄會打開五工具選擇面板。

## 5. 驗收

- 網頁：首頁載入、`/health` 回 `line-auth`；LIFF 加一筆記帳，重整後仍在；待辦勾選/刪除，水目標調整，購物勾選，習慣連續天數。
- LINE 對話：逐一送出七種指令，確認回覆，回 LIFF 查看同一帳號資料。
- 身分隔離：用第二個 LINE 帳號打開 LIFF，應看不到第一個帳號的資料。
- Webhook：無簽章 POST `/webhook` 應回 401；LINE Verify 應成功。重送同一 `webhookEventId` 不應產生第二筆支出或飲水。
- 簡報：`/slides.html` 六頁、上一頁/下一頁及列印另存 PDF。

若 `/health` 為 `unconfigured`，表示 Worker 尚未設定 LINE Login Channel ID。若 `line-auth` 但網頁無法登入，請先確認 `LIFF_ID`、LIFF Endpoint URL 和 `openid` scope。
