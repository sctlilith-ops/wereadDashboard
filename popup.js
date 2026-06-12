// ============================================================
// popup.js — 微信读书数据看板 · BYOK 弹出窗口逻辑
// ============================================================

const STORAGE_KEY_API = 'wereadApiKey';

// ── DOM refs ──
const apiKeyInput  = document.getElementById('api-key-input');
const saveKeyBtn   = document.getElementById('save-key-btn');
const statusArea   = document.getElementById('status-area');
const fetchBtn     = document.getElementById('fetch-btn');
const getKeyBtn    = document.getElementById('get-key-btn');
const progress     = document.getElementById('progress');
const toast        = document.getElementById('toast');

// ── State ──
let savedApiKey = '';

// ============================================================
// 1. Init: load saved API key
// ============================================================
async function init() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY_API]);
    savedApiKey = stored[STORAGE_KEY_API] || '';
  } catch (err) {
    savedApiKey = '';
  }

  if (savedApiKey) {
    apiKeyInput.value = maskKey(savedApiKey);
    apiKeyInput.placeholder = '已保存 (仅显示后4位)';
    saveKeyBtn.textContent = '✓ 已保存';
    saveKeyBtn.classList.add('saved');
    fetchBtn.disabled = false;
    renderStatus('ok', 'API Key 已就绪 · 点击获取数据');
    getKeyBtn.style.display = 'none';
  } else {
    apiKeyInput.placeholder = '输入 API Key (wrk-...)';
    fetchBtn.disabled = true;
    renderStatus('warn', '请先输入并保存你的 API Key');
    getKeyBtn.style.display = 'inline-flex';
  }
}

function maskKey(key) {
  if (key.length <= 8) return key;
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

// ============================================================
// 2. Save API Key
// ============================================================
saveKeyBtn.addEventListener('click', async () => {
  const rawValue = apiKeyInput.value.trim();

  // Allow re-saving with the masked value if unchanged
  const keyToSave = (rawValue === maskKey(savedApiKey) && savedApiKey)
    ? savedApiKey
    : rawValue;

  if (!keyToSave || !keyToSave.startsWith('wrk-')) {
    showToast('error', 'API Key 格式不正确（应以 wrk- 开头）');
    return;
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEY_API]: keyToSave });
    savedApiKey = keyToSave;
    apiKeyInput.value = maskKey(keyToSave);
    apiKeyInput.placeholder = '已保存 (仅显示后4位)';
    saveKeyBtn.textContent = '✓ 已保存';
    saveKeyBtn.classList.add('saved');
    fetchBtn.disabled = false;
    renderStatus('ok', 'API Key 已就绪 · 点击获取数据');
    getKeyBtn.style.display = 'none';
    showToast('success', 'API Key 已安全保存到本地');
  } catch (err) {
    showToast('error', `保存失败: ${err.message}`);
  }
});

// Allow re-editing: clicking into the masked field clears it
apiKeyInput.addEventListener('focus', () => {
  if (savedApiKey && apiKeyInput.value === maskKey(savedApiKey)) {
    apiKeyInput.value = '';
    apiKeyInput.placeholder = '粘贴新的 API Key';
  }
});

// ============================================================
// 3. Fetch data via API
// ============================================================
fetchBtn.addEventListener('click', async () => {
  if (!savedApiKey) {
    showToast('error', '请先保存 API Key');
    return;
  }

  fetchBtn.classList.add('loading');
  fetchBtn.textContent = '正在通过 API 获取…';
  progress.classList.add('visible');
  toast.style.display = 'none';
  fetchBtn.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'FETCH_WEREAD_DATA',
      apiKey: savedApiKey
    });

    if (result && result.success) {
      showToast('success',
        `✅ ${result.bookCount} 本书 · ${result.noteCount || 0} 条笔记 · ${result.readingHours || 0} 小时 · 看板即将打开`);
    } else {
      showToast('error', result?.error || 'API 请求失败，请检查 Key 是否有效');
    }
  } catch (err) {
    console.error('[popup] fetch error:', err);
    showToast('error', `通信异常：${err.message}`);
  } finally {
    fetchBtn.classList.remove('loading');
    fetchBtn.textContent = '获取我的阅读数据';
    progress.classList.remove('visible');
    fetchBtn.disabled = false;
  }
});

// ============================================================
// 4. Get API Key link
// ============================================================
getKeyBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://weread.qq.com/r/weread-skills' });
});

// ============================================================
// 5. Helpers
// ============================================================
function renderStatus(type, message) {
  if (type === 'ok') {
    statusArea.innerHTML = `<div class="status-ok"><span class="dot"></span> ${message}</div>`;
  } else {
    statusArea.innerHTML = `<div class="status-warn"><span>📖 ${message}</span></div>`;
  }
}

function showToast(type, message) {
  toast.textContent = message;
  toast.className = type;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 6000);
}

// ============================================================
// 6. AI Config Management
// ============================================================
const AI_PROVIDERS = {
  deepseek:  { baseUrl: 'https://api.deepseek.com/v1',            model: 'deepseek-chat' },
  openai:    { baseUrl: 'https://api.openai.com/v1',              model: 'gpt-4o' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1',           model: 'claude-sonnet-4-20250514' },
  custom:    { baseUrl: '',                                        model: '' }
};

const STORAGE_KEY_AI = 'wereadAIConfig';

function initAIConfig() {
  const toggle  = document.getElementById('ai-toggle');
  const panel   = document.getElementById('ai-config');
  const provider = document.getElementById('ai-provider');
  const apiKeyEl = document.getElementById('ai-apikey');
  const baseUrlEl = document.getElementById('ai-baseurl');
  const modelEl   = document.getElementById('ai-model');
  const saveBtn   = document.getElementById('save-ai-btn');

  // ── Toggle ──
  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('visible');
    toggle.classList.toggle('open', open);
  });

  // ── Provider presets ──
  provider.addEventListener('change', () => {
    const cfg = AI_PROVIDERS[provider.value] || AI_PROVIDERS.custom;
    baseUrlEl.value = cfg.baseUrl;
    baseUrlEl.placeholder = cfg.baseUrl || 'https://your-api.com/v1';
    modelEl.value = cfg.model;
    modelEl.placeholder = cfg.model || 'your-model-name';
  });

  // ── Load saved config ──
  chrome.storage.local.get([STORAGE_KEY_AI]).then(stored => {
    const cfg = stored[STORAGE_KEY_AI];
    if (!cfg) return;
    if (cfg.provider) { provider.value = cfg.provider; provider.dispatchEvent(new Event('change')); }
    if (cfg.apiKey)   { apiKeyEl.value = '••••••••' + cfg.apiKey.slice(-4); apiKeyEl.dataset.saved = cfg.apiKey; }
    if (cfg.baseUrl)  { baseUrlEl.value = cfg.baseUrl; }
    if (cfg.model)    { modelEl.value = cfg.model; }
    saveBtn.textContent = '✓ 已保存';
    saveBtn.classList.add('saved');
  });

  // ── Clear masked field on focus ──
  apiKeyEl.addEventListener('focus', () => {
    if (apiKeyEl.dataset.saved && apiKeyEl.value.startsWith('••••')) {
      apiKeyEl.value = '';
      apiKeyEl.placeholder = '粘贴新的 AI API Key';
    }
  });

  // ── Save ──
  saveBtn.addEventListener('click', async () => {
    const rawKey = apiKeyEl.value.trim();
    const finalKey = (rawKey.startsWith('••••') && apiKeyEl.dataset.saved)
      ? apiKeyEl.dataset.saved
      : rawKey;

    if (!finalKey) {
      showToast('error', '请输入 AI API Key');
      return;
    }
    if (!baseUrlEl.value.trim()) {
      showToast('error', '请输入 API Base URL');
      return;
    }

    const config = {
      provider: provider.value,
      apiKey: finalKey,
      baseUrl: baseUrlEl.value.trim().replace(/\/+$/, ''),
      model: modelEl.value.trim() || AI_PROVIDERS[provider.value]?.model || ''
    };

    try {
      await chrome.storage.local.set({ [STORAGE_KEY_AI]: config });
      apiKeyEl.dataset.saved = finalKey;
      apiKeyEl.value = '••••••••' + finalKey.slice(-4);
      saveBtn.textContent = '✓ 已保存';
      saveBtn.classList.add('saved');
      showToast('success', 'AI 配置已安全保存到本地');
    } catch (err) {
      showToast('error', `保存失败: ${err.message}`);
    }
  });
}

// ============================================================
// Boot
// ============================================================
init();
initAIConfig();
