# AI Fit Room (Chrome MV3 擴充功能)

https://github.com/user-attachments/assets/2459b428-60e3-416b-8d7d-9cc1c6eb86bf



AI Fit Room 是一款基於 Chrome Extensions Manifest V3 的側邊欄工具。使用者可在側邊欄上傳基底圖片，於任意網頁對圖片按右鍵即自動將其載入為覆蓋圖，並與 Google Gemini 影像模型整合，產生合成結果。支援 OS 原生剪貼簿與跨分頁共享同一個 side panel。

## 功能特性
- 上傳基底圖：支援檔案上傳、剪貼簿貼上、複製 Base64 / 複製圖片。
- 右鍵覆蓋圖：只在圖片上顯示右鍵選單，選取後自動載入到側欄的覆蓋圖區塊；可一鍵清除，不會覆蓋基底圖。
- 自動合成：基底圖、覆蓋圖與 API 設定齊備時，會自動呼叫合成；也可手動點擊「合成圖片」。
- 結果操作：合成完成後可「下載圖片」或「複製圖片」到剪貼簿。
- 共享側邊欄：所有分頁共用同一個 side panel，狀態儲存在 `chrome.storage.local`。

## 安裝（開發者模式）
1. 下載或 `git clone` 本倉庫至本機。
2. 在 Chrome 進入 `chrome://extensions`。
3. 開啟「開發人員模式」。
4. 點「載入未封裝項目」，選取本專案根目錄。

完成後，工具列會出現擴充功能圖示；此專案會在安裝與啟動時全域啟用 side panel。

## 使用說明
1. 開啟側邊欄：
   - 在任意分頁對圖片按右鍵 → 選「在側邊欄開啟（圖片）」；side panel 會以這次手勢直接開啟。
   - 或按工具列圖示開啟。
2. 設定 API：在側邊欄底部輸入 Google Gemini 的 Endpoint 與 API Key（以及可選的提示詞 Prompt），點「儲存設定」。
3. 上傳基底圖：在「圖片上傳與預覽」區塊上傳或貼上基底圖。
4. 選擇覆蓋圖：在任意網站對想要合成的圖片按右鍵 → 選「在側邊欄開啟（圖片）」。覆蓋圖會出現在下方「自動載入的圖片（來自右鍵）」區塊，可清除或複製。
5. 產生合成：
   - 條件齊備時（基底＋覆蓋＋API 設定），系統會自動開始合成。
   - 也可手動點「合成圖片」。
6. 下載或複製：在「合成結果」區塊可下載圖片或複製圖片。

貼心提醒：合成過程中按鈕會避免重複觸發，完成後會還原狀態。

## Google Gemini 設定
- 建議 Endpoint（可於面板中修改）：
  - `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent`
- 取得 API Key：請至 Google AI Studio 建立與管理；請勿將金鑰提交到版本控制。
- 請求內容：傳送文字（可選）與兩張影像（基底＋覆蓋）。
- 回應解析：同時支援 `inlineData` 與 `inline_data` 兩種欄位格式提取影像資料。
- Host 權限：`https://generativelanguage.googleapis.com/*`

## 權限與隱私
- `permissions`：
  - `sidePanel`：使用側邊欄。
  - `contextMenus`：在圖片上顯示右鍵選單。
  - `storage`：儲存使用者狀態與設定。
  - `clipboardRead`、`clipboardWrite`：OS 原生剪貼簿複製/貼上。
- `host_permissions`：
  - `https://generativelanguage.googleapis.com/*` 用於呼叫 Gemini API。
- 隱私：API Key 僅儲存於瀏覽器 `chrome.storage.local`，不會上傳到任何伺服器；請勿將金鑰或產出內容提交到版本控制。

## 檔案結構
- `manifest.json`：擴充功能設定。
- `src/background/background.js`：建立右鍵選單、處理開啟 side panel、寫入 `lastImageContext`。
- `src/sidepanel/index.html`、`src/sidepanel/index.js`：面板 UI 與互動邏輯（上傳/貼上/複製、右鍵覆蓋圖、自動合成、下載/複製結果）。
- `src/content/content_script.js`：可選；目前預留為空，若需要可以在頁面互動時傳送 `OPEN_SIDEPANEL` 訊息。
- `AGENTS.md`：貢獻指南（Repository Guidelines）。

## 疑難排解
- 看不到右鍵選單：請確認是在圖片元素上按右鍵，且擴充功能已重新載入。
- 圖片無法載入至覆蓋圖區塊：可能遇到跨網域（CORS）限制；可先嘗試公共圖片來源（如維基百科圖片）。
- 自動合成未執行：請確認已上傳基底圖、已有右鍵覆蓋圖、並正確填寫 Endpoint 與 API Key。
- 產生錯誤 `compose HTTP 4xx/5xx`：請檢查 API Key 是否有效、Endpoint 是否正確或配額限制。

## 開發
- 語言：JavaScript（無 TypeScript）。
- 風格：2 空白縮排，遵循現有程式碼風格。
- 重新載入：修改後到 `chrome://extensions` 點擊「重新載入」。
- 若要提交 PR：請閱讀 `AGENTS.md` 之「Repository Guidelines」。

## 路線圖（Roadmap）
- 支援更多模型與快速切換。
- 視需要加入可調式壓縮或縮放，避免 storage 容量過大。
- 選用 content script 提供額外頁面互動（選擇非 `<img>` 的背景圖等）。

---

若有問題或建議，歡迎提交 Issue 或 Pull Request！
