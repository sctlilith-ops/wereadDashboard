// ============================================================
// dashboard.js — 微信读书数据看板 · 全部客户端逻辑
// 包含: 数据加载/融合 + 平滑滚动/导航 + 渐显动画 + 鼠标光晕
// 作为外部脚本引用，满足 Manifest V3 CSP 要求
// ============================================================

// ============================================================
// PART 1 — DATA LOADING: Chrome Storage → DOM Merge
// ============================================================
(async function loadWereadData() {
  // ── 0. Detect runtime environment ──
  const isExtension = !!(
    typeof chrome !== 'undefined' &&
    chrome.storage &&
    chrome.storage.local
  );

  if (!isExtension) {
    console.log('%c[wereadDashboard] 📄 数据来源：Local Fallback（静态演示数据）',
      'color:#C4A265;font-weight:bold;');
    console.log('%c[wereadDashboard] 💡 提示：作为 Chrome 插件加载 + 配置 API Key 以获取真实阅读数据',
      'color:#9C9488;');
    return; // 保持 HTML 中原有的硬编码静态数据不变
  }

  console.log('%c[wereadDashboard] 🔌 检测到 Chrome 插件环境，尝试读取缓存数据…',
    'color:#8AA38B;');

  let data;
  let stored = {};
  try {
    stored = await chrome.storage.local.get(['wereadData', 'lastFetch']);
    data = stored.wereadData;
  } catch (err) {
    console.warn('[wereadDashboard] ⚠️ chrome.storage.local 读取失败:', err.message);
    console.log('%c[wereadDashboard] 📄 数据来源：Local Fallback（存储读取异常，使用静态数据）',
      'color:#C0806B;font-weight:bold;');
    return;
  }

  if (!data || !data.summary || !data.summary.totalShelf) {
    console.log('%c[wereadDashboard] 📄 数据来源：Local Fallback（无有效缓存数据）',
      'color:#C4A265;');
    console.log('[wereadDashboard] 💡 请先点击插件图标 → "获取我的阅读数据"');
    return;
  }

  // ── 1. We have real data → log source ──
  const minutesAgo = stored.lastFetch
    ? Math.round((Date.now() - stored.lastFetch) / 60000)
    : '未知';
  const hoursAgo = minutesAgo >= 60
    ? `${Math.round(minutesAgo / 60)} 小时`
    : `${minutesAgo} 分钟`;
  console.log(
    `%c[wereadDashboard] ✅ 数据来源：Plugin Storage（${hoursAgo}前抓取 · ${data.summary.totalShelf} 本书 · ${data.summary.finishedBooks} 本已读完）`,
    'color:#8AA38B;font-weight:bold;'
  );

  // ── 2. Merge & update DOM ──
  const merged = buildMergedData(data);
  applyMergedData(merged);

  // Show AI analysis section (only when real data is available)
  const aiSection = document.getElementById('ai-analysis');
  if (aiSection) aiSection.style.display = 'block';

  console.log('[wereadDashboard] 🎨 数据融合完成 → Hero 全部指标 + 书籍影响力排行已更新为真实 API 数据');
})();

// ============================================================
// Data Merger: API 富数据 → DOM 全覆盖
//   - Hero 宏观指标: 书架总数/读完/笔记数/阅读时长/天数/书单数
//   - 书籍排行区: 完整渲染（笔记数/作者/书名全部来自 API）
// ============================================================

function buildMergedData(data) {
  const s = data.summary || {};
  const books = data.topNoteBooks || [];

  return {
    totalShelf:      s.totalShelf || s.books || books.length || 0,
    finishedBooks:   s.finishedBooks || 0,
    totalNotes:      s.totalNotes || 0,
    readingHours:    s.totalReadingHours || 0,
    readingDays:     s.readingDays || 0,
    booklists:       s.booklists || 0,
    topBooks:        books.slice(0, 10)
  };
}

function applyMergedData(merged) {
  updateStatCard('书架条目', merged.totalShelf);
  if (merged.finishedBooks > 0)    upsertStatCard('读完', merged.finishedBooks, '已读完');
  if (merged.totalNotes > 0)       updateStatCard('总笔记数', merged.totalNotes);
  if (merged.readingHours > 0)     updateStatCard('阅读小时数', merged.readingHours);
  if (merged.readingDays > 0)      updateStatCard('阅读天数', merged.readingDays);
  if (merged.booklists > 0)        updateStatCard('自建书单', merged.booklists);
  updateBookRanking(merged.topBooks);
}

function updateStatCard(labelText, value) {
  const cards = document.querySelectorAll('.hero .stat-card');
  for (const card of cards) {
    const label = card.querySelector('.label');
    if (label && label.textContent.trim() === labelText) {
      const num = card.querySelector('.num');
      if (num) {
        num.textContent = Number(value).toLocaleString();
        console.log(`[wereadDashboard]   ↻ 更新统计: ${labelText} → ${Number(value).toLocaleString()}`);
      }
      return;
    }
  }
}

function upsertStatCard(labelText, value, displayLabel) {
  const row = document.querySelector('.hero .stat-row');
  if (!row) return;

  const existing = row.querySelectorAll('.stat-card');
  for (const card of existing) {
    const label = card.querySelector('.label');
    if (label && label.textContent.trim() === labelText) {
      const num = card.querySelector('.num');
      if (num) num.textContent = Number(value).toLocaleString();
      return;
    }
  }

  const card = document.createElement('div');
  card.className = 'stat-card';
  card.innerHTML = `<div class="num">${Number(value).toLocaleString()}</div><div class="label">${displayLabel || labelText}</div>`;
  row.appendChild(card);
  console.log(`[wereadDashboard]   ＋ 新增统计: ${displayLabel || labelText} → ${Number(value).toLocaleString()}`);
}

// ============================================================
// Book Ranking — 完整 API 数据渲染
//   API 返回笔记数+作者+书名 → 恢复深度影响力排行展示
// ============================================================

function updateBookRanking(books) {
  const bookList = document.querySelector('.book-list');
  if (!bookList) return;

  if (!books || books.length === 0) {
    console.log('[wereadDashboard]   ↻ 书籍排行：无数据，保留静态内容');
    return;
  }

  // ── A. 恢复区块标题为"影响力排行" ──
  const rankingSection = document.querySelector('#books');
  const sectionTitle = rankingSection?.querySelector('h2');
  if (sectionTitle) sectionTitle.textContent = '书籍影响力排行';
  const sectionLabel = rankingSection?.querySelector('.section-label');
  if (sectionLabel) sectionLabel.textContent = '影响力分析';

  // ── B. 完整渲染（笔记数 + 作者 + 书名） ──
  bookList.innerHTML = books.map((book, i) => {
    const title  = escHtml(book.title || '未知书名');
    const author = book.author
      ? `<div class="bk-author">${escHtml(book.author)}</div>`
      : '';
    const badge = book.noteCount
      ? `<div class="bk-notes">${Number(book.noteCount).toLocaleString()} 笔记</div>`
      : '';

    return `
      <div class="book-item">
        <div class="bk-rank">#${i + 1}</div>
        <div class="bk-info">
          <div class="bk-title">${title}</div>
          ${author}
        </div>
        ${badge}
      </div>`;
  }).join('');

  console.log(`[wereadDashboard]   ↻ 更新书籍排行: ${books.length} 本书（完整 API 数据）`);
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// PART 1.5 — AI DEEP ANALYSIS: 流式调用 AI 生成深度阅读画像
// ============================================================

const AI_STORAGE_KEY = 'wereadAIConfig';

// ── Bind AI start button (injected into dashboard HTML) ──
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('ai-start-btn');
  if (btn) btn.addEventListener('click', startAIAnalysis);
});

async function startAIAnalysis() {
  // ── 1. Load AI config ──
  let aiCfg;
  try {
    const stored = await chrome.storage.local.get([AI_STORAGE_KEY]);
    aiCfg = stored[AI_STORAGE_KEY];
  } catch { aiCfg = null; }

  if (!aiCfg || !aiCfg.apiKey || !aiCfg.baseUrl) {
    alert('请先在插件弹窗中配置 AI 分析（API Key + Base URL）');
    return;
  }

  // ── 2. Load reading data ──
  let data;
  try {
    const stored = await chrome.storage.local.get(['wereadData']);
    data = stored.wereadData;
  } catch { data = null; }

  if (!data || !data.summary) {
    alert('请先获取微信读书数据，再运行 AI 分析');
    return;
  }

  // ── 3. UI: switch to loading ──
  const triggerArea = document.getElementById('ai-trigger-area');
  const loadingArea = document.getElementById('ai-loading');
  const contentArea = document.getElementById('ai-content');
  const aiSection  = document.getElementById('ai-analysis');

  if (aiSection) aiSection.style.display = 'block';
  if (triggerArea) triggerArea.style.display = 'none';
  if (loadingArea) loadingArea.style.display = 'block';
  if (contentArea) { contentArea.style.display = 'block'; contentArea.innerHTML = ''; }

  // Scroll to AI section
  if (aiSection) aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── 4. Build prompt ──
  const messages = buildAIPrompt(data);

  // ── 5. Stream response ──
  if (loadingArea) loadingArea.innerHTML = '<div class="ai-spinner"></div><p style="font-size:12px;color:var(--text-secondary);margin-top:12px;">AI 正在深度分析你的阅读数据…</p>';

  let fullText = '';
  try {
    await streamAIResponse(
      aiCfg.baseUrl,
      aiCfg.apiKey,
      aiCfg.model,
      messages,
      (chunk) => {
        fullText += chunk;
        if (contentArea) contentArea.innerHTML = renderMarkdown(fullText);
        if (loadingArea) loadingArea.style.display = 'none';
      }
    );
    console.log('[wereadDashboard] 🧠 AI 分析完成，共 ' + fullText.length + ' 字符');
  } catch (err) {
    console.error('[wereadDashboard] ❌ AI 分析失败:', err.message, err.stack);
    if (contentArea) contentArea.innerHTML = `<p style="color:#C0806B;">AI 分析失败: ${escHtml(err.message)}</p>`;
    if (loadingArea) loadingArea.style.display = 'none';
  }
}

// ============================================================
// Build AI prompt from reading data
// ============================================================
function buildAIPrompt(data) {
  const s = data.summary || {};
  const topBooks = (data.topNoteBooks || []).slice(0, 20);
  const topAuthors = (data.topAuthors || []).slice(0, 10);
  const topCats = (data.topCategories || []).slice(0, 8);

  // ── Build compact data summary ──
  const dataSummary = {
    总书架: s.totalShelf,
    读完: s.finishedBooks,
    笔记总数: s.totalNotes,
    阅读总时长小时: s.totalReadingHours,
    阅读天数: s.readingDays,
    注册日期: s.registDate,
    书单数: s.booklists,
    有笔记的书: s.booksWithNotes
  };

  const booksSummary = topBooks.map(b =>
    `《${b.title}》- ${b.author || '未知'}（${b.noteCount}条笔记）`
  ).join('\n');

  const authorsSummary = topAuthors.map(a =>
    `${a.name}: ${a.readTime}, ${a.count}本`
  ).join('\n');

  const catsSummary = topCats.map(c =>
    `${c.title}(${c.parent}): ${c.readingCount}本, ${Math.round(c.readingTime/60)}分钟`
  ).join('\n');

  const systemPrompt = `你是一位资深的阅读心理学分析师和文学评论家。你将收到一位读者的微信读书数据。请基于这些数据，生成一份深度、诚恳、有洞察力的「个人阅读画像分析报告」。

## 分析要求

请按以下结构输出（使用 Markdown 格式）：

### 一、阅读人格画像
用 2-3 句话精准概括这位读者的阅读人格特质。不要泛泛而谈，要基于数据中的具体书籍和主题。

### 二、核心主题与知识结构
分析读者关注的核心主题领域（从书籍和分类中推断），它们之间的关联，以及可能的知识结构特征。

### 三、思维模式与认知风格
基于阅读选择（书籍类型、作者偏好、跨学科广度）推断读者的思维习惯和认知偏好。

### 四、价值观与信念体系
从阅读主题中推断读者可能持有的核心价值观。每个判断需附带数据依据。

### 五、阅读行为模式
分析阅读时长分布、笔记密度、完成率等行为特征。

### 六、个性化阅读建议
基于现有知识结构，推荐 3-5 个值得探索的新方向或具体书籍类型。要具体，不要泛泛而谈。

## 写作风格
- 使用优雅、有文学感的中文，像一篇高质量的文学评论
- 保持诚恳和深度，避免空洞的赞美
- 数据和洞察并重
- 总字数控制在 800-1500 字`;

  const userMessage = `## 我的微信读书数据

### 基本统计
\`\`\`json
${JSON.stringify(dataSummary, null, 2)}
\`\`\`

### 笔记最多的书籍（前20本）
${booksSummary}

### 最常读的作者（前10位）
${authorsSummary}

### 阅读分类分布（前8类）
${catsSummary}

请基于以上数据，为我生成深度阅读画像分析报告。`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];
}

// ============================================================
// Streaming fetch to OpenAI-compatible API
// ============================================================
async function streamAIResponse(baseUrl, apiKey, model, messages, onChunk) {
  const url = `${baseUrl}/chat/completions`;
  console.log('[weread-ai] Streaming from:', url, 'model:', model);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[weread-ai] ❌ HTTP', res.status, errText.slice(0, 300));
    throw new Error(`AI API 返回 HTTP ${res.status}: ${errText.slice(0, 150)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) onChunk(content);
      } catch { /* skip malformed lines */ }
    }
  }
}

// ── Simple markdown → HTML renderer ──
function renderMarkdown(md) {
  let html = md;
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-family:var(--font-serif);font-size:18px;margin:24px 0 10px;color:var(--gold);">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-family:var(--font-serif);font-size:22px;margin:28px 0 12px;color:var(--gold);border-bottom:1px solid var(--glass-border);padding-bottom:8px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-family:var(--font-serif);font-size:26px;margin:32px 0 14px;color:var(--gold);">$1</h1>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--gold-dim);">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:3px;font-size:0.9em;">$1</code>');
  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (m) => {
    const code = m.replace(/```\w*\n?/g, '').replace(/```/g, '');
    return `<pre style="background:rgba(0,0,0,0.2);padding:14px;border-radius:8px;overflow-x:auto;font-size:11px;line-height:1.5;">${code}</pre>`;
  });
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:20px;list-style:disc;">$1</li>');
  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p style="margin:10px 0;line-height:1.85;">');
  html = '<p style="margin:10px 0;line-height:1.85;">' + html + '</p>';
  // Clean up empty paragraphs
  html = html.replace(/<p[^>]*><\/p>/g, '');
  html = html.replace(/<\/p><p[^>]*>/g, '\n');
  html = html.replace(/<p[^>]*>/g, '<p style="margin:10px 0;line-height:1.85;">');
  return html;
}

// ============================================================
// PART 2 — UI INTERACTIONS: 平滑滚动 / 导航 / 渐显 / 光晕
// ============================================================

// ── Smooth scroll + Active nav ──
document.querySelectorAll('nav a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('nav a');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => {
    const top = s.offsetTop - 100;
    if (window.scrollY >= top) current = s.getAttribute('id');
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + current);
  });
});

// ── Scroll-triggered reveal animations ──
const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

revealEls.forEach(el => observer.observe(el));

// ── Card mouse-follow glow (subtle) ──
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', `${x}%`);
    card.style.setProperty('--my', `${y}%`);
  });
  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--mx', '50%');
    card.style.setProperty('--my', '0%');
  });
});
