// Side panel script

async function render() {
  const imageInput = document.getElementById('image-input');
  const previewWrap = document.getElementById('image-preview-wrap');
  const previewImg = document.getElementById('image-preview');
  const imageMeta = document.getElementById('image-meta');
  const pasteImageBtn = document.getElementById('paste-image');
  const clearImageBtn = document.getElementById('clear-image');
  const ctxImportedSection = document.getElementById('context-imported-section');
  const ctxList = document.getElementById('context-list');
  const clearContextAllBtn = document.getElementById('clear-context-all');
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
  // Render previously saved overlay images list
  await renderOverlayList();

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
      // Append to overlayImages array (do not overwrite base upload)
      const id = `ov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { overlayImages } = await chrome.storage.local.get('overlayImages');
      const next = Array.isArray(overlayImages) ? overlayImages.slice() : [];
      next.push({ id, name: 'from-context', type: blob.type, dataUrl, srcUrl, part: 'auto' });
      await chrome.storage.local.set({ overlayImages: next });
      await renderOverlayList();
      // Clear context to avoid repeated auto-imports
      await chrome.storage.local.remove('lastImageContext');
    } catch (e) {
      ctxImportedSection.style.display = 'block';
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
    // React to overlayImages updates
    if (changes.overlayImages) {
      await renderOverlayList();
    }
  });

  // Clear all overlay images
  clearContextAllBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['overlayImages', 'lastImageContext']);
    await renderOverlayList();
  });

  // Render overlay list from storage
  async function renderOverlayList() {
    const { overlayImages } = await chrome.storage.local.get('overlayImages');
    const list = Array.isArray(overlayImages) ? overlayImages : [];
    ctxList.innerHTML = '';
    const isWeb = !!document.getElementById('choose-overlay');
    if (!list.length) {
      // In web mode keep the section visible so user can add overlays
      ctxImportedSection.style.display = isWeb ? 'block' : 'none';
      return;
    }
    ctxImportedSection.style.display = 'block';
    for (const item of list) {
      const wrap = document.createElement('div');
      wrap.style.border = '1px solid #8884';
      wrap.style.borderRadius = '8px';
      wrap.style.padding = '8px';
      wrap.style.display = 'grid';
      wrap.style.gap = '6px';
      wrap.dataset.id = item.id;

      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '96px 1fr';
      row.style.gap = '10px';

      const img = document.createElement('img');
      img.src = item.dataUrl;
      img.style.maxWidth = '96px';
      img.style.height = 'auto';
      img.style.borderRadius = '6px';
      img.style.border = '1px solid #8884';

      const meta = document.createElement('div');
      meta.style.display = 'grid';
      meta.style.gap = '6px';
      const srcLine = document.createElement('div');
      srcLine.className = 'muted';
      srcLine.style.wordBreak = 'break-all';
      srcLine.textContent = item.srcUrl || '';

      const partWrap = document.createElement('label');
      partWrap.textContent = '參考部位：';
      const select = document.createElement('select');
      select.innerHTML = [
        ['hair', '髮型'],
        ['top', '上衣'],
        ['outer', '外套'],
        ['bottom', '下裝'],
        ['pants', '褲子'],
        ['shoes', '鞋子'],
        ['bag', '包包'],
        ['accessory', '配件'],
        ['jewelry', '首飾'],
        ['pose', '動作'],
        ['other', '其他']
      ].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
      select.value = item.part || 'auto';
      select.addEventListener('change', async () => {
        const { overlayImages } = await chrome.storage.local.get('overlayImages');
        const arr = Array.isArray(overlayImages) ? overlayImages : [];
        const idx = arr.findIndex((x) => x.id === item.id);
        if (idx >= 0) { arr[idx].part = select.value; await chrome.storage.local.set({ overlayImages: arr }); }

        const partsText = [];
        if (arr.length) {
          const labels = { hair: '髮型', top: '上衣', outer: '外套', bottom: '下裝', pants: '褲子', shoes: '鞋子', bag: '包包', accessory: '配件', jewelry: '首飾', pose: '動作', other: '其他' };
          const desc = arr.map((o, i) => `僅將圖${i + 2}中人物的${labels[o.part || 'auto']}換到我身上`).join('；');
          const orderStr = `${arr.length + 1}張圖合成一張，圖片順序：圖1是我，不改變我的視角，保持我的臉型與體態`;
          partsText.push(`${orderStr}。\n覆蓋來源項目：${desc}；邊緣無鋸齒；匹配場景光影，生成合理陰影。請依項目意圖進行合成，並輸出圖片。`);
        }
        composePromptEl.value = partsText.join('\n');
      });
      partWrap.appendChild(select);

      const btns = document.createElement('div');
      btns.style.display = 'flex';
      btns.style.gap = '8px';
      btns.style.flexWrap = 'wrap';

      const copyImg = document.createElement('button');
      copyImg.textContent = '複製圖片';
      copyImg.addEventListener('click', async () => {
        try { const blob = dataUrlToBlob(item.dataUrl); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); copyImg.textContent = '已複製圖片'; setTimeout(() => copyImg.textContent = '複製圖片', 1200); } catch { }
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = '刪除';
      delBtn.addEventListener('click', async () => {
        const { overlayImages } = await chrome.storage.local.get('overlayImages');
        const arr = Array.isArray(overlayImages) ? overlayImages : [];
        const next = arr.filter((x) => x.id !== item.id);
        await chrome.storage.local.set({ overlayImages: next });
        await renderOverlayList();
      });
      btns.appendChild(copyImg);
      btns.appendChild(delBtn);

      meta.appendChild(srcLine);
      meta.appendChild(partWrap);
      meta.appendChild(btns);
      row.appendChild(img);
      row.appendChild(meta);
      wrap.appendChild(row);
      ctxList.appendChild(wrap);
    }
  }

}

document.addEventListener('DOMContentLoaded', render);

// Query compose-related elements for top-level handlers
const apiEndpointEl = document.getElementById('api-endpoint');
const apiKeyEl = document.getElementById('api-key');
const composePromptEl = document.getElementById('compose-prompt');
const promptPresetEl = document.getElementById('prompt-preset');
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


// 預設「試衣間」情境模板
const PROMPT_PRESETS = [
  {
    id: 'tshirt',
    label: '換上 T 恤',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，將覆蓋圖中的上衣自然合成到我身上，視需要去背。請對齊肩線與頸口，保持布料皺褶與自然垂墜；匹配光源方向、色溫與對比；邊緣平滑無鋸齒，避免遮蓋臉與頭髮。畫面要真實、無違和。'
  },
  {
    id: 'jacket',
    label: '換上外套/夾克',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，將覆蓋圖中的外套合成到我身上，對齊肩膀與胸前位置，保持立體感與開合自然。調整陰影與反光，避免穿模；與背景光線一致，邊緣自然融合。'
  },
  {
    id: 'dress',
    label: '換上下裝',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，將覆蓋圖中的下裝合成到我身上，依照身形比例微調長度與腰線，保持布料紋理與皺褶；光影一致、邊緣平滑，避免遮擋不該遮擋的部位。'
  },
  {
    id: 'sunglasses',
    label: '試戴墨鏡',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，將覆蓋圖中的墨鏡對位到我臉部，準確對齊鼻樑與眼睛位置，控制比例與角度；鏡片反光與陰影合理，邊緣平滑，避免遮蓋眉毛與髮絲的不自然重疊。'
  },
  {
    id: 'hat',
    label: '試戴帽子',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，將覆蓋圖中的帽子戴到我頭部，對齊頭頂與前額位置，調整透視與比例；與髮絲自然相交，邊緣無鋸齒；匹配場景光影，生成合理陰影。'
  },
  {
    id: 'hair',
    label: '試髮型',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，將覆蓋圖中的髮型換到我頭部，不改變覆蓋圖原有髮型、不改變覆蓋圖原有髮色、不改變覆蓋圖原有髮型的結構與長度；邊緣無鋸齒；匹配場景光影，生成合理陰影。'
  },
  {
    id: 'indoor-soft',
    label: '室內試衣（柔光）',
    text:
      '第一張為基底圖，第二張之後為覆蓋圖，請以柔和室內光線風格進行合成：光線散射、色溫偏暖、陰影柔和。確保覆蓋圖與我之光影一致、銜接自然，畫面整體協調。'
  },
  {
    id: 'outdoor-sunny',
    label: '戶外街拍（陽光）',
    text:
      '請以戶外晴天街拍風格進行合成：光線方向明確、對比略高、陰影清晰；匹配日光色溫與環境反光，使畫面自然可信。'
  }
];


// Initialize prompt preset options (if the select exists on this page)
if (promptPresetEl) {
  for (const p of PROMPT_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    promptPresetEl.appendChild(opt);
  }
}

// Load API config
{
  const { apiConfig } = await chrome.storage.local.get('apiConfig');
  if (apiConfig) {
    if (apiConfig.endpoint) apiEndpointEl.value = apiConfig.endpoint;
    if (apiConfig.key) apiKeyEl.value = apiConfig.key;
    if (apiConfig.prompt) composePromptEl.value = apiConfig.prompt;
    if (promptPresetEl) {
      const sel = apiConfig.promptPreset || 'custom';
      promptPresetEl.value = sel;
      const found = PROMPT_PRESETS.find((p) => p.id === sel);
      if (found && (!apiConfig.prompt || apiConfig.prompt === found.text)) {
        composePromptEl.value = found.text;
      }
    }
  }
}

saveApiBtn.addEventListener('click', async () => {
  const endpoint = apiEndpointEl.value.trim();
  const key = apiKeyEl.value.trim();
  const prompt = composePromptEl.value.trim();
  const { apiConfig: prev } = await chrome.storage.local.get('apiConfig');
  const preset = promptPresetEl ? promptPresetEl.value : ((prev && prev.promptPreset) || 'custom');
  await chrome.storage.local.set({ apiConfig: { ...(prev || {}), endpoint, key, prompt, promptPreset: preset } });
  composeStatus.textContent = '設定已儲存';
  setTimeout(() => (composeStatus.textContent = ''), 1200);
});

// Auto-save when API Key is filled (web-friendly UX)
{
  let autoSaveTimer = null;
  const tryAutoSave = async () => {
    const key = apiKeyEl.value.trim();
    if (!key) return; // avoid saving empty key
    const endpoint = apiEndpointEl.value.trim();
    const prompt = composePromptEl.value.trim();
    const { apiConfig: prev } = await chrome.storage.local.get('apiConfig');
    const preset = promptPresetEl ? promptPresetEl.value : ((prev && prev.promptPreset) || 'custom');
    await chrome.storage.local.set({ apiConfig: { ...(prev || {}), endpoint, key, prompt, promptPreset: preset } });
    if (composeStatus) {
      composeStatus.textContent = '已自動儲存 API 設定';
      setTimeout(() => (composeStatus.textContent = ''), 1200);
    }
  };
  apiKeyEl.addEventListener('input', () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(tryAutoSave, 400);
  });
  apiKeyEl.addEventListener('change', tryAutoSave);
  apiKeyEl.addEventListener('blur', tryAutoSave);
}

// When user changes preset, sync prompt text and store
if (promptPresetEl) {
  promptPresetEl.addEventListener('change', async () => {
    const id = promptPresetEl.value;
    const { apiConfig } = await chrome.storage.local.get('apiConfig');
    if (id === 'custom') {
      await chrome.storage.local.set({ apiConfig: { ...(apiConfig || {}), promptPreset: 'custom', prompt: composePromptEl.value } });
      return;
    }
    const found = PROMPT_PRESETS.find((p) => p.id === id);
    if (found) {
      composePromptEl.value = found.text;
      await chrome.storage.local.set({ apiConfig: { ...(apiConfig || {}), promptPreset: id, prompt: found.text } });
    }
  });
  // If user edits prompt manually, mark as custom unless exactly matches a preset
  composePromptEl.addEventListener('input', async () => {
    const current = composePromptEl.value;
    const matched = PROMPT_PRESETS.find((p) => p.text === current);
    const id = matched ? matched.id : 'custom';
    if (promptPresetEl.value !== id) {
      promptPresetEl.value = id;
      const { apiConfig } = await chrome.storage.local.get('apiConfig');
      await chrome.storage.local.set({ apiConfig: { ...(apiConfig || {}), prompt: current, promptPreset: id } });
    }
  });
}

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
    const prompt = (composePromptEl?.value || '').trim();
    const { lastImage } = await chrome.storage.local.get('lastImage');
    const baseDataUrl = lastImage?.dataUrl;
    const { overlayImages } = await chrome.storage.local.get('overlayImages');
    const overlays = (Array.isArray(overlayImages) ? overlayImages : []).filter((x) => x?.dataUrl);

    if (!endpoint || !key || !baseDataUrl || overlays.length === 0) {
      composeStatus.textContent = '缺少設定或圖片（需 API Key、Endpoint、基底與至少一張右鍵圖片）';
      return;
    }

    // Build Google Gemini generateContent payload（多覆蓋圖）
    const { mime: baseMime, base64: baseB64 } = mimeAndBase64FromDataUrl(baseDataUrl);
    const parts = [];

    parts.push({ text: prompt });
    // 先放基底圖
    parts.push({ inline_data: { mime_type: baseMime, data: baseB64 } });
    // 依序放入所有覆蓋圖
    for (const o of overlays) {
      const { mime, base64 } = mimeAndBase64FromDataUrl(o.dataUrl);
      parts.push({ inline_data: { mime_type: mime, data: base64 } });
    }
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
