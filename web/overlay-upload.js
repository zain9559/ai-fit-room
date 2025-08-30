// Web-only helper to load an overlay image and store it as overlayImage
// so that src/sidepanel/index.js can pick it up via the existing listeners.

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('choose-overlay');
  const input = document.getElementById('overlay-file');
  const section = document.getElementById('context-imported-section');
  if (!btn || !input) return;

  // Ensure the overlay section is visible on web at start
  if (section) section.style.display = 'block';

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    // Append into overlayImages list to match sidepanel/index.js behavior
    const id = `ov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { overlayImages } = await chrome.storage.local.get('overlayImages');
    const next = Array.isArray(overlayImages) ? overlayImages.slice() : [];
    next.push({ id, name: file.name, type: file.type, dataUrl, srcUrl: '', part: 'other' });
    await chrome.storage.local.set({ overlayImages: next });
    // Reset for re-selecting same file
    input.value = '';
  });
});
