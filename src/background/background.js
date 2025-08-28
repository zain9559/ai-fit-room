// Background service worker (MV3)
// Creates a context menu and opens the side panel on click.

const MENU_ID = 'open-sidepanel';

chrome.runtime.onInstalled.addListener(() => {
  // Enable a single global side panel for all tabs
  try {
    chrome.sidePanel.setOptions({ path: 'src/sidepanel/index.html', enabled: true });
  } catch (e) { }
  try {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '我要試穿（AI試衣間）',
      contexts: ['image']
    });
  } catch (e) {
    // Ignore errors if the menu already exists (e.g., during re-install in dev)
  }
});

chrome.runtime.onStartup.addListener(() => {
  try {
    chrome.sidePanel.setOptions({ path: 'src/sidepanel/index.html', enabled: true });
  } catch (e) { }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || !tab.id) return;

  // IMPORTANT: Call open() directly within the gesture handler (no await/then beforehand).
  try {
    chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('Failed to open side panel:', e);
  }

  // Persist context image info (fire-and-forget).
  const imageSrc = typeof info.srcUrl === 'string' ? info.srcUrl : '';
  const payload = { lastImageContext: { srcUrl: imageSrc, pageUrl: info.pageUrl || '' } };
  chrome.storage.local.set(payload).catch(() => { });
});

// Optional: allow toolbar icon click to open the side panel as well
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  try {
    chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error('Failed to open side panel via action:', e);
  }
});

// Optional: allow content_scripts to request opening the side panel and/or pass image src
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'OPEN_SIDEPANEL') {
    if (message.srcUrl) {
      const srcUrl = String(message.srcUrl);
      const pageUrl = sender?.tab?.url || '';
      chrome.storage.local.set({ lastImageContext: { srcUrl, pageUrl } });
    }
    const tabId = sender?.tab?.id;
    if (tabId) {
      try { chrome.sidePanel.open({ tabId }); } catch (e) { /* may require user gesture */ }
    }
  }
  if (message.type === 'SAVE_API_CONFIG') {
    const { endpoint, key } = message;
    chrome.storage.local.set({ apiConfig: { endpoint: String(endpoint || ''), key: String(key || '') } });
  }
});
