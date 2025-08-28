// Side panel script

async function render() {
  const imageInput = document.getElementById('image-input');
  const previewWrap = document.getElementById('image-preview-wrap');
  const previewImg = document.getElementById('image-preview');
  const imageMeta = document.getElementById('image-meta');
  const pasteImageBtn = document.getElementById('paste-image');
  const clearImageBtn = document.getElementById('clear-image');
  const ctxImportedSection = document.getElementById('context-imported-section');
  const ctxImportedImg = document.getElementById('context-imported-img');
  const ctxImportedMeta = document.getElementById('context-imported-meta');
  const ctxImportedSrc = document.getElementById('context-imported-src');
  const copyContextBase64Btn = document.getElementById('copy-context-base64');
  const copyContextImageBtn = document.getElementById('copy-context-image');
  const clearContextImageBtn = document.getElementById('clear-context-image');
  // compose UI is handled by top-level handlers

  // Load previously saved image (if any)
  const { lastImage } = await chrome.storage.local.get('lastImage');
  if (lastImage && typeof lastImage.dataUrl === 'string') {
    previewImg.src = lastImage.dataUrl;
    previewWrap.style.display = 'block';
    imageMeta.textContent = `${lastImage.name || '未命名'} · ${lastImage.type || ''} · ${Math.round((lastImage.dataUrl.length - (lastImage.dataUrl.indexOf(',') + 1)) / 4 * 3 / 1024)} KB`;
  }

  // Load context image info (if any)
  const { lastImageContext } = await chrome.storage.local.get('lastImageContext');
  // Load previously saved overlay image and render it
  {
    const { overlayImage } = await chrome.storage.local.get('overlayImage');
    if (overlayImage?.dataUrl) {
      ctxImportedImg.src = overlayImage.dataUrl;
      ctxImportedSection.style.display = 'block';
      ctxImportedMeta.textContent = `${overlayImage.name || 'overlay'} · ${overlayImage.type || ''}`;
      ctxImportedSrc.textContent = overlayImage.srcUrl || '';
    }
  }

  // Handle new image uploads
  imageInput.addEventListener('change', () => {
    const file = imageInput.files && imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      previewImg.src = dataUrl;
      previewWrap.style.display = 'block';
      imageMeta.textContent = `${file.name} · ${file.type} · ${Math.round(file.size / 1024)} KB`;
      // Persist base64 (data URL) so it survives reloads
      await chrome.storage.local.set({ lastImage: { name: file.name, type: file.type, dataUrl } });
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected if needed
    imageInput.value = '';
  });


  clearImageBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('lastImage');
    previewImg.removeAttribute('src');
    previewWrap.style.display = 'none';
    imageMeta.textContent = '';
  });

  // Paste image from OS clipboard via button (requires user gesture)
  pasteImageBtn.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        await chrome.storage.local.set({ lastImage: { name: 'clipboard', type: blob.type, dataUrl } });
        previewImg.src = dataUrl;
        previewWrap.style.display = 'block';
        imageMeta.textContent = `clipboard · ${blob.type} · ${Math.round(blob.size / 1024)} KB`;
        return;
      }
      pasteImageBtn.textContent = '剪貼簿無圖片';
      setTimeout(() => (pasteImageBtn.textContent = '從剪貼簿貼上圖片'), 1200);
    } catch {
      pasteImageBtn.textContent = '貼上失敗（需權限或手勢）';
      setTimeout(() => (pasteImageBtn.textContent = '從剪貼簿貼上圖片'), 1200);
    }
  });

  // Handle Cmd/Ctrl+V paste event
  document.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        await chrome.storage.local.set({ lastImage: { name: 'pasted', type: file.type, dataUrl } });
        previewImg.src = dataUrl;
        previewWrap.style.display = 'block';
        imageMeta.textContent = `pasted · ${file.type} · ${Math.round(file.size / 1024)} KB`;
        e.preventDefault();
        break;
      }
    }
  });

  async function importFromContext() {
    const { lastImageContext } = await chrome.storage.local.get('lastImageContext');
    const srcUrl = lastImageContext?.srcUrl;
    if (!srcUrl) return;
    try {
      const res = await fetch(srcUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      // Persist as separate overlay image (do not overwrite base upload)
      await chrome.storage.local.set({ overlayImage: { name: 'from-context', type: blob.type, dataUrl, srcUrl } });
      // Render only in the context section
      ctxImportedImg.src = dataUrl;
      ctxImportedSection.style.display = 'block';
      ctxImportedMeta.textContent = `from-context · ${blob.type} · ${Math.round(blob.size / 1024)} KB`;
      ctxImportedSrc.textContent = srcUrl;
      // Clear context to avoid repeated auto-imports
      await chrome.storage.local.remove('lastImageContext');
      // Auto-compose if prerequisites satisfied
      autoComposeIfReady();
    } catch (e) {
      ctxImportedSection.style.display = 'block';
      ctxImportedMeta.textContent = '無法取得圖片（可能受跨網域限制）';
      ctxImportedSrc.textContent = srcUrl || '';
    }
  }

  // Auto-import on load if context is present
  if (lastImageContext && lastImageContext.srcUrl) importFromContext();

  // Also react to late-arriving context from background (race fix)
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    const ctx = changes.lastImageContext;
    if (ctx && ctx.newValue && ctx.newValue.srcUrl) {
      importFromContext();
    }
    // React to overlayImage updates (set or clear)
    if (changes.overlayImage) {
      const val = changes.overlayImage.newValue;
      if (val && val.dataUrl) {
        ctxImportedImg.src = val.dataUrl;
        ctxImportedSection.style.display = 'block';
        ctxImportedMeta.textContent = `${val.name || 'overlay'} · ${val.type || ''}`;
        ctxImportedSrc.textContent = val.srcUrl || '';
        autoComposeIfReady();
      } else {
        ctxImportedImg.removeAttribute('src');
        ctxImportedSection.style.display = 'none';
        ctxImportedMeta.textContent = '';
        ctxImportedSrc.textContent = '';
      }
    }
  });

  async function autoComposeIfReady() {
    try {
      const { lastImage, overlayImage, apiConfig } = await chrome.storage.local.get([
        'lastImage',
        'overlayImage',
        'apiConfig'
      ]);
      const hasBase = !!lastImage?.dataUrl;
      const hasOverlay = !!overlayImage?.dataUrl || !!(ctxImportedImg.getAttribute('src') || '').startsWith('data:');
      const hasApi = !!(apiConfig?.endpoint && apiConfig?.key);
      if (hasBase && hasOverlay && hasApi) {
        composeImages();
      }
    } catch {}
  }
  copyContextBase64Btn.addEventListener('click', async () => {
    const src = ctxImportedImg.getAttribute('src') || '';
    if (!src) return;
    const base64 = src.slice(src.indexOf(',') + 1);
    try {
      await navigator.clipboard.writeText(base64);
      copyContextBase64Btn.textContent = '已複製';
      setTimeout(() => (copyContextBase64Btn.textContent = '複製 Base64'), 1200);
    } catch {
      copyContextBase64Btn.textContent = '複製失敗';
      setTimeout(() => (copyContextBase64Btn.textContent = '複製 Base64'), 1200);
    }
  });

  copyContextImageBtn.addEventListener('click', async () => {
    const src = ctxImportedImg.getAttribute('src') || '';
    if (!src.startsWith('data:')) return;
    try {
      const blob = dataUrlToBlob(src);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      copyContextImageBtn.textContent = '已複製圖片';
      setTimeout(() => (copyContextImageBtn.textContent = '複製圖片'), 1200);
    } catch {
      copyContextImageBtn.textContent = '複製失敗';
      setTimeout(() => (copyContextImageBtn.textContent = '複製圖片'), 1200);
    }
  });

  // Clear only the right-click imported (overlay) image
  clearContextImageBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['overlayImage', 'lastImageContext']);
    ctxImportedImg.removeAttribute('src');
    ctxImportedSection.style.display = 'none';
    ctxImportedMeta.textContent = '';
    ctxImportedSrc.textContent = '';
  });

}

document.addEventListener('DOMContentLoaded', render);

// Query compose-related elements for top-level handlers
const apiEndpointEl = document.getElementById('api-endpoint');
const apiKeyEl = document.getElementById('api-key');
const composePromptEl = document.getElementById('compose-prompt');
const saveApiBtn = document.getElementById('save-api');
const composeBtn = document.getElementById('compose-btn');
const composeStatus = document.getElementById('compose-status');
const composeResult = document.getElementById('compose-result');
const composeActions = document.getElementById('compose-actions');
const copyComposeBase64Btn = document.getElementById('copy-compose-base64');
const copyComposeImageBtn = document.getElementById('copy-compose-image');

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mimeMatch = /data:(.*?);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime });
}


// Load API config
{
  const { apiConfig } = await chrome.storage.local.get('apiConfig');
  if (apiConfig) {
    if (apiConfig.endpoint) apiEndpointEl.value = apiConfig.endpoint;
    if (apiConfig.key) apiKeyEl.value = apiConfig.key;
    if (apiConfig.prompt) composePromptEl.value = apiConfig.prompt;
  }
}

saveApiBtn.addEventListener('click', async () => {
  const endpoint = apiEndpointEl.value.trim();
  const key = apiKeyEl.value.trim();
  const prompt = composePromptEl.value.trim();
  await chrome.storage.local.set({ apiConfig: { endpoint, key, prompt } });
  composeStatus.textContent = '設定已儲存';
  setTimeout(() => (composeStatus.textContent = ''), 1200);
});

function getBase64FromDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function mimeAndBase64FromDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const m = /data:(.*?);base64/.exec(header);
  return { mime: m ? m[1] : 'image/png', base64 };
}

function extFromMime(mime) {
  if (!mime) return 'png';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

function downloadDataUrl(filenameBase, dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const m = /data:(.*?);base64/.exec(header);
  const mime = m ? m[1] : 'image/png';
  const ext = extFromMime(mime);
  const filename = `${filenameBase}.${ext}`;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function composeImages() {
  if (window.__isComposing) return;
  window.__isComposing = true;
  composeStatus.textContent = '合成中…';
  composeResult.style.display = 'none';
  composeActions.style.display = 'none';
  try {
    const { apiConfig } = await chrome.storage.local.get('apiConfig');
    const endpoint = apiConfig?.endpoint || '';
    const key = apiConfig?.key || '';
    const prompt = (composePromptEl?.value || apiConfig?.prompt || '').trim();
    const { lastImage } = await chrome.storage.local.get('lastImage');
    const baseDataUrl = lastImage?.dataUrl;
    // Prefer the already imported overlay from preview; fallback to lastImageContext fetch
    let overlayDataUrl = (document.getElementById('context-imported-img').getAttribute('src') || '');
    if (!overlayDataUrl || !overlayDataUrl.startsWith('data:')) {
      const { lastImageContext } = await chrome.storage.local.get('lastImageContext');
      const overlaySrcUrl = lastImageContext?.srcUrl;
      if (overlaySrcUrl) {
        const res = await fetch(overlaySrcUrl, { mode: 'cors' });
        if (!res.ok) throw new Error(`overlay HTTP ${res.status}`);
        const overlayBlob = await res.blob();
        overlayDataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = reject;
          r.readAsDataURL(overlayBlob);
        });
      }
    }

    // Also check persisted overlay image from storage
    if (!overlayDataUrl || !overlayDataUrl.startsWith('data:')) {
      const { overlayImage } = await chrome.storage.local.get('overlayImage');
      if (overlayImage?.dataUrl) overlayDataUrl = overlayImage.dataUrl;
    }

    if (!endpoint || !key || !baseDataUrl || !overlayDataUrl) {
      composeStatus.textContent = '缺少設定或圖片（需 API Key、Endpoint、基底與右鍵圖片）';
      return;
    }

    // Build Google Gemini generateContent payload
    const { mime: baseMime, base64: baseB64 } = mimeAndBase64FromDataUrl(baseDataUrl);
    const { mime: overlayMime, base64: overlayB64 } = mimeAndBase64FromDataUrl(overlayDataUrl);
    const parts = [];
    if (prompt) parts.push({ text: prompt + '。必需輸出圖片。' });
    parts.push({ inline_data: { mime_type: baseMime, data: baseB64 } });
    parts.push({ inline_data: { mime_type: overlayMime, data: overlayB64 } });
    const payload = { contents: [{ role: 'user', parts }] };

    // Append API key as query param (per Google REST docs)
    let url = endpoint;
    url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
    const composeRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!composeRes.ok) throw new Error(`compose HTTP ${composeRes.status}`);
    const json = await composeRes.json();
    // Try extracting first inline image from candidates
    let outB64 = '';
    if (Array.isArray(json.candidates)) {
      for (const cand of json.candidates) {
        const ps = cand?.content?.parts || [];
        for (const p of ps) {
          // Support both API variants: inlineData (camel) and inline_data (snake)
          if (p?.inlineData?.data) { outB64 = p.inlineData.data; break; }
          if (p?.inline_data?.data) { outB64 = p.inline_data.data; break; }
          const t = p?.text || '';
          const m = /^data:image\/\w+;base64,(.+)$/.exec(t);
          if (m) { outB64 = m[1]; break; }
        }
        if (outB64) break;
      }
    }
    if (!outB64) throw new Error('回應未包含產生的影像');
    const outUrl = `data:image/png;base64,${outB64}`;
    composeResult.src = outUrl;
    composeResult.style.display = 'block';
    composeActions.style.display = 'flex';
    composeStatus.textContent = '合成完成';
    await chrome.storage.local.set({ composedImage: outUrl });
  } catch (e) {
    composeStatus.textContent = `合成失敗：${e.message || e}`;
  } finally {
    window.__isComposing = false;
  }
}

composeBtn.addEventListener('click', () => {
  composeImages();
});

// Restore composed image if exists
{
  const { composedImage } = await chrome.storage.local.get('composedImage');
  if (composedImage) {
    composeResult.src = composedImage;
    composeResult.style.display = 'block';
    composeActions.style.display = 'flex';
  }
}

copyComposeBase64Btn.addEventListener('click', async () => {
  const src = composeResult.getAttribute('src') || '';
  if (!src) return;
  // Trigger a download of the composed image
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fn = `compose-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  try { downloadDataUrl(fn, src); } catch (e) { /* ignore */ }
});

copyComposeImageBtn.addEventListener('click', async () => {
  const src = composeResult.getAttribute('src') || '';
  if (!src.startsWith('data:')) return;
  const blob = dataUrlToBlob(src);
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
});
