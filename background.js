// ============================================================
// background.js — Service Worker (Manifest V3)
// 微信读书数据看板 · BYOK API 数据获取与存储
//
// API 文档来源: https://github.com/Tencent/WeChatReading
// API Key 获取: https://weread.qq.com/r/weread-skills
// ============================================================

const API_GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VERSION = '1.0';

// ============================================================
// 1. Message router
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_WEREAD_DATA') {
    handleFetchWereadData(message.apiKey)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ============================================================
// 2. Core: fetch all weread data via API
// ============================================================
async function handleFetchWereadData(apiKey) {
  if (!apiKey || !apiKey.startsWith('wrk-')) {
    throw new Error('无效的 API Key（应以 wrk- 开头）');
  }

  // ── Fetch all three data sources concurrently ──
  let shelfData, notebookData, statsData;
  try {
    [shelfData, notebookData, statsData] = await Promise.all([
      apiCall(apiKey, '/shelf/sync', {}),
      fetchAllNotebooks(apiKey),
      apiCall(apiKey, '/readdata/detail', { mode: 'overall' })
    ]);
  } catch (err) {
    console.error('[weread-api] ❌ 批量请求失败:', err.message, err.stack);
    throw new Error(`API 请求失败: ${err.message}`);
  }

  if (!shelfData || !shelfData.books) {
    throw new Error('书架数据为空，请检查 API Key 是否有效');
  }

  // ── Transform to dashboard schema ──
  const dashboardData = transformToDashboardSchema(shelfData, notebookData, statsData);

  // ── Store ──
  await chrome.storage.local.set({
    wereadData: dashboardData,
    lastFetch: Date.now()
  });

  // ── Auto-open dashboard ──
  chrome.tabs.create({ url: chrome.runtime.getURL('reading-visualization.html') });

  return {
    success: true,
    bookCount: dashboardData.summary.totalShelf,
    noteCount: dashboardData.summary.totalNotes,
    readingHours: dashboardData.summary.totalReadingHours
  };
}

// ============================================================
// 3. API call helper
// ============================================================
async function apiCall(apiKey, apiName, params = {}) {
  const body = JSON.stringify({
    api_name: apiName,
    skill_version: SKILL_VERSION,
    ...params
  });

  console.log(`[weread-api] Fetching: ${API_GATEWAY}  →  api_name=${apiName}`, params);

  let res;
  try {
    res = await fetch(API_GATEWAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body
    });
  } catch (netErr) {
    console.error(`[weread-api] ❌ ${apiName} → 网络错误:`, netErr.message, netErr.stack);
    throw new Error(`无法连接到网关（${netErr.message}）。请检查网络连接。`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[weread-api] ❌ ${apiName} → HTTP ${res.status}:`, errText.slice(0, 300));
    throw new Error(`API ${apiName} 返回 HTTP ${res.status}${errText ? ': ' + errText.slice(0, 200) : ''}`);
  }

  const json = await res.json();
  console.log(`[weread-api] ✅ ${apiName} → 成功`);
  return json;
}

// ============================================================
// 4. Fetch all notebooks (paginated)
// ============================================================
async function fetchAllNotebooks(apiKey) {
  const allBooks = [];
  let lastSort = null;
  let hasMore = true;
  let totalBookCount = 0;
  let totalNoteCount = 0;

  while (hasMore) {
    const params = { count: 50 };
    if (lastSort !== null) params.lastSort = lastSort;

    const data = await apiCall(apiKey, '/user/notebooks', params);

    if (data.books && data.books.length > 0) {
      allBooks.push(...data.books);
      lastSort = data.books[data.books.length - 1].sort;
    }

    totalBookCount = data.totalBookCount || totalBookCount;
    totalNoteCount = data.totalNoteCount || totalNoteCount;
    hasMore = data.hasMore === 1;
  }

  return { books: allBooks, totalBookCount, totalNoteCount };
}

// ============================================================
// 5. Data transformer: API responses → dashboard schema
//    Merges data from /shelf/sync, /user/notebooks, /readdata/detail
// ============================================================
function transformToDashboardSchema(shelf, notebooks, stats) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Shelf: books + albums + mp ──
  const shelfBooks = shelf.books || [];
  const albums = shelf.albums || [];
  const hasMp = shelf.mp != null;
  const totalShelf = shelfBooks.length + albums.length + (hasMp ? 1 : 0);
  const finishedBooks = shelfBooks.filter(b => b.finishReading === 1).length;
  const publicBooks = shelfBooks.filter(b => b.secret === 0).length;
  const privateBooks = shelfBooks.filter(b => b.secret === 1).length;

  // ── Notebooks: note stats ──
  const noteBooks = notebooks.books || [];
  const totalNotes = notebooks.totalNoteCount || 0;
  const booksWithNotes = notebooks.totalBookCount || noteBooks.length;

  // ── Stats: reading time, days, authors, categories ──
  const totalReadSeconds = stats.totalReadTime || 0;
  const totalReadHours = Math.round((totalReadSeconds / 3600) * 10) / 10;
  const readingDays = stats.readDays || 0;
  const registDate = stats.registTime
    ? new Date(stats.registTime * 1000).toISOString().slice(0, 10)
    : '未知';

  // ── Yearly reading ──
  const yearlyMap = {};
  if (stats.yearReport && Array.isArray(stats.yearReport)) {
    stats.yearReport.forEach(yr => {
      if (yr.year && yr.totalReadTime) {
        yearlyMap[yr.year] = yr.totalReadTime;
      }
    });
  }
  const yearlyReading = [];
  for (let y = 2018; y <= currentYear; y++) {
    yearlyReading.push({
      year: y,
      hours: Math.round(((yearlyMap[y] || 0) / 3600) * 10) / 10
    });
  }

  // ── Top authors (from stats.preferAuthor) ──
  const topAuthors = (stats.preferAuthor || []).slice(0, 10).map(a => ({
    name: a.name || '未知',
    readTime: a.readTime || '',
    count: a.count || 0
  }));

  // ── Top categories (from stats.preferCategory) ──
  const topCategories = (stats.preferCategory || [])
    .sort((a, b) => (b.readingTime || 0) - (a.readingTime || 0))
    .slice(0, 10)
    .map(c => ({
      title: c.categoryTitle || '未分类',
      parent: c.parentCategoryTitle || c.categoryTitle || '',
      readingCount: c.readingCount || 0,
      readingTime: c.readingTime || 0
    }));

  // ── Top note books (from notebooks, sorted by note count) ──
  const topNoteBooks = noteBooks
    .map(nb => {
      const totalBookNotes = (nb.reviewCount || 0) + (nb.noteCount || 0) + (nb.bookmarkCount || 0);
      return {
        title: (nb.book && nb.book.title) || '未知书名',
        author: (nb.book && nb.book.author) || '',
        noteCount: totalBookNotes,
        bookId: nb.bookId || ''
      };
    })
    .sort((a, b) => b.noteCount - a.noteCount)
    .slice(0, 30);

  // ── Booklists (from shelf.archive) ──
  const booklists = (shelf.archive || []).map(a => ({
    name: a.name || '未命名',
    bookCount: (a.bookIds || []).length
  }));

  // ── Read longest (from stats.readLongest) ──
  const readLongest = (stats.readLongest || []).slice(0, 10).map(r => {
    const book = r.book || {};
    return {
      title: book.title || '未知书名',
      author: book.author || '',
      readTimeHours: Math.round(((r.readTime || 0) / 3600) * 10) / 10
    };
  });

  // ── Medals ──
  const medals = (stats.medals || []).map(m => ({
    name: m.name || m.medalName || '',
    hint: m.hint || m.description || '',
    displayText: m.displayText || m.name || ''
  }));

  return {
    summary: {
      totalShelf,
      books: totalShelf,
      albums: albums.length,
      articleCollections: hasMp ? 1 : 0,
      booksWithNotes,
      totalNotes,
      totalReadingHours: totalReadHours,
      readingDays,
      registDate,
      finishedBooks,
      publicBooks,
      privateBooks,
      booklists: booklists.length
    },
    yearlyReading,
    topAuthors,
    topCategories,
    topNoteBooks,
    booklists,
    readLongest,
    medals
  };
}
