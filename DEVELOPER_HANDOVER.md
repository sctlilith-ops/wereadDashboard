# 微信读书数据看板 — 技术复盘与交接文档

> **目标读者**：未来重新接手本项目的开发者（包括几个月后的自己）。  
> **最后更新**：2026-06-12  
> **项目版本**：v1.1.0（Chrome Extension Manifest V3）

---

## 目录

1. [项目概览](#1-项目概览)
2. [架构与通信图谱](#2-架构与通信图谱)
3. [核心业务逻辑与数据流](#3-核心业务逻辑与数据流)
4. [状态管理与本地持久化](#4-状态管理与本地持久化)
5. [踩坑记录与核心技术决策](#5-踩坑记录与核心技术决策)
6. [文件职责速查表](#6-文件职责速查表)

---

## 1. 项目概览

这是一个 **Chrome 浏览器扩展（Manifest V3）**，功能是：

- 用户提供微信读书 API Key（`wrk-...`）→ 一键拉取书架、笔记、阅读统计
- 用户提供 AI API Key → 流式生成深度阅读画像分析报告
- 纯本地运行：**零后端、零数据库、零服务器**

### 技术选型原则

| 决策 | 理由 |
|------|------|
| **纯 HTML/CSS/JS（零框架）** | ① 避免 React/Vue 打包步骤破坏 Chrome 扩展的即插即用体验；② Manifest V3 CSP 禁止 `unsafe-eval`，许多框架的模板编译器会违规；③ Dashboard 是独立页面（`chrome-extension://` 协议），加载速度要求极快 |
| **CSS Grid Bento Box** | 12 列错落有致的杂志排版，比 Flexbox 更适合大规模内容重组 |
| **BYOK 模式** | 不持有用户任何数据/密钥，不触碰任何服务器——这是隐私安全的核心卖点 |
| **SSE Streaming in extension page** | 利用 `host_permissions` 绕过 CORS，直接在 Dashboard 扩展页面流式消费 AI API——比通过 Service Worker 转发更简洁 |

---

## 2. 架构与通信图谱

### 2.1 组件拓扑

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension                       │
│                                                          │
│  ┌─────────────┐     chrome.runtime.sendMessage          │
│  │  popup.html  │───────{type:'FETCH_WEREAD_DATA'}──────►│
│  │  popup.js    │◄──────{success, bookCount, ...}────────│
│  │  (配置面板)   │                                        │
│  └──────┬──────┘                                        │
│         │ chrome.storage.local                           │
│         │ .set('wereadApiKey',...)                       │
│         │ .set('wereadAIConfig',...)                     │
│         ▼                                               │
│  ┌──────────────────────────────────────┐               │
│  │        chrome.storage.local           │               │
│  │  - wereadApiKey    (string)           │               │
│  │  - wereadAIConfig  (object)           │               │
│  │  - wereadData      (object)           │               │
│  │  - lastFetch        (number)          │               │
│  └──────────────────────────────────────┘               │
│         ▲                                               │
│         │ chrome.storage.local.get('wereadData')         │
│         │ chrome.storage.local.get('wereadAIConfig')     │
│         │                                               │
│  ┌──────┴──────────────────────────────────────────┐    │
│  │  background.js (Service Worker)                  │    │
│  │                                                  │    │
│  │  handleFetchWereadData(apiKey)                  │    │
│  │    ├── apiCall('/shelf/sync')        ──┐        │    │
│  │    ├── fetchAllNotebooks()   (分页)    ──┤ POST   │    │
│  │    └── apiCall('/readdata/detail')    ──┘        │    │
│  │           ↓                                      │    │
│  │    transformToDashboardSchema()                  │    │
│  │           ↓                                      │    │
│  │    chrome.storage.local.set('wereadData', ...)   │    │
│  │           ↓                                      │    │
│  │    chrome.tabs.create('reading-visualization')   │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  reading-visualization.html (Dashboard Page)      │    │
│  │  dashboard.js                                    │    │
│  │                                                  │    │
│  │  loadWereadData()                                │    │
│  │    ├── chrome.storage.local.get('wereadData')    │    │
│  │    ├── buildMergedData() → applyMergedData()     │    │
│  │    └── [AI Section] → startAIAnalysis()          │    │
│  │           └── streamAIResponse() → OpenAI API    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### 2.2 消息通信协议

所有跨组件通信均通过 `chrome.runtime.sendMessage`：

```
┌──────────┬──────────────────────┬───────────────────────┐
│ 发送方    │ 消息 type             │ 接收方                │
├──────────┼──────────────────────┼───────────────────────┤
│ popup.js │ FETCH_WEREAD_DATA    │ background.js         │
│          │ payload: { apiKey }  │                       │
│          │                      │                       │
│ popup.js │ (无 — 单向存储)       │ chrome.storage.local   │
│          │ 保存 wereadApiKey     │                       │
│          │ 保存 wereadAIConfig   │                       │
└──────────┴──────────────────────┴───────────────────────┘
```

### 2.3 Service Worker 生命周期

> [!CAUTION] **MV3 关键陷阱**
> `background.js` 是一个 Service Worker，**不是**持久运行的守护进程。Chrome 会在空闲约 30 秒后自动休眠它，下次收到消息时重新唤醒。

**影响**：
- 不能使用全局变量保存状态——必须用 `chrome.storage`
- 异步操作必须在 `sendResponse` 前完成，且 `onMessage` listener 必须 `return true` 保持消息通道开启（见 `background.js:20`）
- Service Worker 休眠不会中断正在进行的 `fetch`（Promise 会继续执行）

---

## 3. 核心业务逻辑与数据流

### 3.1 BYOK 数据获取（background.js）

**触发链路**：Popup 点击"获取我的阅读数据" → `chrome.runtime.sendMessage({type:'FETCH_WEREAD_DATA', apiKey})` → `background.js:15`

**三个并发请求**（`background.js:35-39`）：

```js
const [shelfData, notebookData, statsData] = await Promise.all([
  apiCall(apiKey, '/shelf/sync', {}),           // 书架全量
  fetchAllNotebooks(apiKey),                     // 笔记分页
  apiCall(apiKey, '/readdata/detail', { mode: 'overall' })  // 阅读统计
]);
```

**网关协议**（`apiCall` 函数，`background.js:72-105`）：

```
POST https://i.weread.qq.com/api/agent/gateway
Authorization: Bearer wrk-...
Content-Type: application/json

{
  "api_name": "/shelf/sync",
  "skill_version": "1.0"
}
```

> [!NOTE] **为什么是 `i.weread.qq.com/api/agent/gateway`？**
> 经历了多轮试错——`weread.qq.com/web/skills`（404 HTML）、`agent.weread.qq.com`（DNS 不存在）——最终从官方 SDK 源码定位到真实网关地址。所有请求统一 POST 到此网关，由 `api_name` 字段内部路由。

**笔记分页**（`fetchAllNotebooks`，`background.js:110-134`）：

使用基于 `sort` 值的游标分页（非 offset/limit 模式）：
```js
while (hasMore) {
  const params = { count: 50 };
  if (lastSort !== null) params.lastSort = lastSort;
  const data = await apiCall(apiKey, '/user/notebooks', params);
  lastSort = data.books[data.books.length - 1].sort;
  hasMore = data.hasMore === 1;
}
```

### 3.2 数据转换（transformToDashboardSchema）

位于 `background.js:140-261`。三源（Shelf + Notebooks + Stats）合并为统一 Schema：

| 来源 | 字段 | 转换逻辑 |
|------|------|---------|
| `/shelf/sync` | `books[]`, `albums[]`, `mp`, `archive[]` | `totalShelf = books.length + albums.length + (mp?1:0)` |
| `/user/notebooks` | `totalNoteCount`, `books[]` | `perBookNotes = reviewCount + noteCount + bookmarkCount` |
| `/readdata/detail` | `totalReadTime`, `readDays`, `preferAuthor[]`, `preferCategory[]`, `readLongest[]`, `medals[]` | **所有时间字段单位均为秒**，需除以 3600 转为小时 |

### 3.3 Dashboard 数据融合（dashboard.js）

**加载优先级**（`loadWereadData`，`dashboard.js:10-69`）：

```
1. 检测 chrome.storage 是否存在 → 判断是否在扩展环境中
2. 是 → 从 chrome.storage.local 读取 wereadData
3. 否 → 保持 HTML 静态内容（Local Fallback 模式）
```

**DOM 覆盖策略**（`applyMergedData`，`dashboard.js:92-100`）：

```
updateStatCard('书架条目', ...)     // 通过 label 文本定位 DOM
upsertStatCard('读完', ...)         // 不存在则动态创建
updateStatCard('总笔记数', ...)
updateStatCard('阅读小时数', ...)
updateStatCard('阅读天数', ...)
updateStatCard('自建书单', ...)
updateBookRanking(topBooks)         // 替换 .book-list 全部内容
```

### 3.4 AI 流式渲染（dashboard.js PART 1.5）

**触发**：用户点击 Dashboard 上的「开始 AI 深度分析」按钮（`#ai-start-btn`）。

**流程**（`startAIAnalysis`，`dashboard.js:201-265`）：

1. 从 `chrome.storage.local` 读取 `wereadAIConfig` 和 `wereadData`
2. `buildAIPrompt(data)` — 构建 System Prompt（阅读心理学分析师角色）+ User Message（含数据摘要 JSON、Top 20 书籍列表、Top 10 作者、Top 8 分类）
3. `streamAIResponse(baseUrl, apiKey, model, messages, onChunk)` — 发起 `POST /chat/completions`（`stream: true`）
4. 逐 chunk 解析 SSE（Server-Sent Events）格式：
   ```
   data: {"choices":[{"delta":{"content":"文本片段"}}]}
   ```
5. 每个 chunk 通过 `renderMarkdown()` 实时转为 HTML，覆盖 `#ai-content` 的 `innerHTML`

**SSE 解析核心**（`streamAIResponse`，`dashboard.js:357-407`）：

```js
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 保留不完整的行
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const json = JSON.parse(line.slice(6));
      const content = json.choices?.[0]?.delta?.content;
      if (content) onChunk(content);
    }
  }
}
```

> [!NOTE] **为什么在 Dashboard 前端直接调用 AI API，而不是通过 Background？**
> Streaming 通过 Service Worker 转发需要额外的消息通道（每个 chunk 一条消息），复杂度高且性能差。由于 AI API 域名已在 `host_permissions` 中声明，Dashboard 扩展页面可直接发起跨域请求并消费 ReadableStream。

---

## 4. 状态管理与本地持久化

### 4.1 chrome.storage.local 数据字典

| Key | 类型 | 写入方 | 读取方 | 内容 |
|-----|------|--------|--------|------|
| `wereadApiKey` | `string` | popup.js:68 | popup.js:24, background.js:16 | 微信读书 API Key (`wrk-...`) |
| `wereadAIConfig` | `object` | popup.js:234 | dashboard.js:205 | `{provider, apiKey, baseUrl, model}` |
| `wereadData` | `object` | background.js:53 | dashboard.js:32 | 完整的 Dashboard Schema（见 §4.2） |
| `lastFetch` | `number` | background.js:54 | dashboard.js:49 | `Date.now()` 时间戳 |

### 4.2 wereadData Schema

<details>
<summary>点击展开完整 Schema（与 reading-data.json 对齐）</summary>

```json
{
  "summary": {
    "totalShelf": 3800,       // 书架总数（书籍+有声书+文章收藏）
    "books": 3800,             // 同上（向后兼容）
    "albums": 0,               // 有声书数量
    "articleCollections": 1,   // 文章收藏夹（mp 字段存在则=1）
    "booksWithNotes": 306,     // 有笔记/划线的书
    "totalNotes": 54978,       // 总笔记数
    "totalReadingHours": 1012.4, // 阅读小时数
    "readingDays": 883,        // 阅读天数（>=1分钟算一天）
    "registDate": "2022-02-18", // 注册日期
    "finishedBooks": 90,       // 读完的书
    "publicBooks": 1265,       // 公开书架
    "privateBooks": 2535,      // 私密书架
    "booklists": 138           // 自建书单数
  },
  "yearlyReading": [
    { "year": 2022, "hours": 127.6 },
    { "year": 2023, "hours": 249.4 }
    // ...每年一条
  ],
  "topAuthors": [
    { "name": "陀思妥耶夫斯基", "readTime": "30小时33分钟", "count": 3 }
  ],
  "topCategories": [
    { "title": "文学", "parent": "文学", "readingCount": 50, "readingTime": 412160 }
    // readingTime 单位：秒
  ],
  "topNoteBooks": [
    { "title": "卡拉马佐夫兄弟", "author": "陀思妥耶夫斯基", "noteCount": 2252, "bookId": "CB_..." }
    // noteCount = reviewCount + noteCount + bookmarkCount
  ],
  "booklists": [
    { "name": "女权主义/性别研究", "bookCount": 104 }
  ],
  "readLongest": [
    { "title": "红书", "author": "卡尔·荣格", "readTimeHours": 21.9 }
  ],
  "medals": [
    { "name": "阅读时长", "hint": "阅读 500 小时", "displayText": "阅读 500 小时" }
  ]
}
```

</details>

### 4.3 安全策略

- **API Key 掩码显示**：`popup.js:46-49` 的 `maskKey()` 函数——仅显示 `wrk-••••••••JwAA`（首 4 位 + 尾 4 位）
- **编辑检测**：`popup.js:84-88`——点击已掩码的输入框时自动清空，防止误编辑
- **隐私声明**：popup.html 和 AI 配置区域均有明确提示——密钥仅保存在本地

---

## 5. 踩坑记录与核心技术决策

### 5.1 为什么坚持零框架（纯 HTML/CSS/JS）？

**背景**：在项目初期，我们考虑过引入 React 或 Vue 来组织日益复杂的 Dashboard UI。

**决策**：**坚持零框架**，原因有四：

1. **Manifest V3 CSP 限制**：扩展页面的 CSP 默认 `script-src 'self'`，禁止 `unsafe-eval`。React 的 JSX 编译产物通常依赖 `eval` 或 `new Function()`，会触发 CSP 违规
2. **扩展页面的独特加载模式**：`chrome-extension://` 协议下的页面不需要路由、不需要 Virtual DOM diff——内容在加载时已确定。框架的初始化开销（~50KB gzipped）得不偿失
3. **Bento Box 布局天然适合 Vanilla JS**：我们的布局依赖 CSS Grid 的 `grid-template-columns: repeat(12, 1fr)`，与 JS 框架无关
4. **代码可维护性**：全部业务逻辑约 490 行 JS (`dashboard.js`)，按 Part 1 / Part 1.5 / Part 2 清晰分段——没有框架反而更容易定位

> 最终我们用 CSS Grid + CSS Custom Properties + Intersection Observer 实现了全部 UI 效果，没有一行代码依赖 npm 包。

### 5.2 Manifest V3 内联脚本拦截（最棘手的 Bug）

**症状**：页面黑屏，Console 报错：
```
Executing inline script violates the following Content Security Policy directive: "script-src 'self'"
```

**根因**：MV3 扩展页面**绝对禁止** `<script>...</script>` 内联 JS——只能通过 `<script src="...">` 外部引用。

**修复**：将所有内联 JS（数据加载 + 平滑滚动 + Intersection Observer + 鼠标光晕）迁移至 `dashboard.js`，HTML 仅保留一行 `<script src="dashboard.js"></script>`。文件见 `reading-visualization.html:541`。

### 5.3 API 网关地址——四轮试错

| 轮次 | 地址 | 结果 |
|------|------|------|
| 1 | `https://weread.qq.com/web/skills` | HTTP 404，返回 HTML 网页 |
| 2 | `https://agent.weread.qq.com` | DNS 解析失败（域名不存在） |
| 3 | `https://agent.weread.qq.com/shelf/sync`（直接路径） | 同上 |
| 4 | `https://i.weread.qq.com/api/agent/gateway` | ✅ 成功 |

**教训**：官方文档中的 `api_name` JSON 字段暗示了网关模式——所有请求统一 POST 到单一 URL，由 `api_name` 字段内部路由。最终地址需查阅 SDK 源码而非文档。

### 5.4 `stored` 变量作用域问题

**症状**：`ReferenceError: stored is not defined at loadWereadData (dashboard.js:48)`

**根因**：`const stored = await chrome.storage.local.get(...)` 在 `try` 块内声明，但 `stored.lastFetch` 在 `try` 块外（第 48 行）引用。

**修复**：将声明提升为 `let stored = {};` 在 `try` 前，`try` 内仅赋值 `stored = await ...`。见 `dashboard.js:30-32`。

### 5.5 流式 AI 的 CORS 策略

**问题**：从 `chrome-extension://` 页面对 `api.deepseek.com` 发起 fetch 需要 CORS 支持。

**解决**：
1. 在 `manifest.json` 的 `host_permissions` 中预声明 `*://api.deepseek.com/*` 等 7 个主流 AI API 域名
2. DeepSeek/OpenAI 等 API 返回 `Access-Control-Allow-Origin: *`
3. Chrome 扩展配合 `host_permissions` 允许从扩展页面向这些域名发起跨域请求

> [!CAUTION] **注意**
> 如果用户使用自定义 Base URL（如自建代理），需在 `manifest.json` 中手动添加对应域名，否则会触发 CORS 错误。这是 BYOK 架构的一个固有限制。

### 5.6 DOM 抓取方案的废弃

项目早期（v0.x）曾使用 `document.querySelectorAll('.shelf_list .shelfBook')` 的 DOM 抓取方案：

- **优势**：不需要 API Key，利用浏览器 Cookie 即可
- **致命缺陷**：
  - 书架页使用懒加载（需要自动滚动触发，`MAX_SCROLLS=60`）
  - DOM 中没有作者、笔记数、阅读时长——数据残缺率 > 60%
  - 书名可能有缺失、作者多为 `null`
- **结论**：发现 `wrk-` API Key 机制后立即废弃 DOM 方案，全面转向 API

`background.js` 中最初有完整的 `scrapeShelfDOM()` 函数（含自动滚动 `window.scrollTo` + `querySelectorAll`）。当前版本已完全移除。

---

## 6. 文件职责速查表

| 文件 | 类型 | 核心职责 | 关键函数/变量 |
|------|------|---------|-------------|
| `manifest.json` | 配置 | MV3 权限、host_permissions、入口声明 | `host_permissions: ["*://*.weread.qq.com/*", ...]` |
| `popup.html` | UI | 弹出配置面板（360px 宽暗黑主题） | WEREAD_API_KEY 输入、AI 配置折叠面板 |
| `popup.js` | 逻辑 | Key 保存/加载/掩码、发送消息触发数据拉取 | `init()`, `initAIConfig()`, `maskKey()` |
| `background.js` | Service Worker | API 网关通信、数据转换、存储 | `apiCall()`, `fetchAllNotebooks()`, `transformToDashboardSchema()` |
| `reading-visualization.html` | UI | Dashboard 页面（12 列 Bento Box、毛玻璃卡片） | 纯 HTML + CSS，零内联 JS |
| `dashboard.js` | 逻辑 | 数据融合渲染、AI 流式分析、UI 动效 | `loadWereadData()`, `startAIAnalysis()`, `streamAIResponse()`, `renderMarkdown()` |
| `reading-data.json` | 数据 | Fallback 静态数据（直接双击 HTML 时使用） | 完整的 wereadData Schema |
| `reading-analysis.md` | 文档 | 原始 14 章深度分析报告 | — |
| `reading_analysis_data.json` | 数据 | 原始 API 导出数据 | — |

---

> **写给未来的自己**：如果要将这个项目进阶到 Chrome Web Store 发布，需要额外处理：① 图标资源（16/48/128 px PNG）；② 隐私政策页面 URL；③ `host_permissions` 的申明理由（Chrome 审核要求解释为什么需要跨域权限）。
