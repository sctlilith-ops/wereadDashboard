# 微信读书数据看板 — 本地运行与开发指南

> **定位**：保姆级教程——如何在本地加载、调试和修改这个 Chrome 扩展。  
> **适用人群**：开发者、测试者、想自定义 UI 的贡献者。

---

## 目录

1. [环境要求](#1-环境要求)
2. [安装与启动](#2-安装与启动)
3. [调试指南](#3-调试指南)
4. [数据格式与 API 契约](#4-数据格式与-api-契约)
5. [常见问题排查](#5-常见问题排查)

---

## 1. 环境要求

| 依赖 | 版本/说明 |
|------|----------|
| **Chrome 浏览器** | ≥ 88（支持 Manifest V3） |
| **微信读书 API Key** | 从 [weread.qq.com/r/weread-skills](https://weread.qq.com/r/weread-skills) 获取，格式 `wrk-...` |
| **AI API Key**（可选） | DeepSeek / OpenAI / 其他 OpenAI-compatible 端点 |
| **Node.js / npm** | **不需要**——本项目零构建依赖 |

---

## 2. 安装与启动

### 2.1 克隆项目

```bash
git clone https://github.com/sctlilith-ops/wereadDashboard.git
cd wereadDashboard
```

### 2.2 在 Chrome 中加载扩展

```
第 1 步：打开 Chrome，地址栏输入 chrome://extensions/
第 2 步：打开右上角的「开发者模式」开关
第 3 步：点击左上角「加载已解压的扩展程序」
第 4 步：在弹出的文件夹选择器中，选择本项目根目录
         （即包含 manifest.json 的文件夹）
第 5 步：确认插件卡片出现「微信读书 · 数据看板」
```

> [!NOTE]
> 加载后，插件图标会出现在 Chrome 工具栏右侧。如果没看到，点击拼图图标 🧩 → 找到「微信读书 · 数据看板」→ 点击图钉 📌 钉选到工具栏。

### 2.3 修改代码后如何刷新

| 修改的文件类型 | 刷新方式 |
|-------------|---------|
| `manifest.json` | 必须在 `chrome://extensions/` 点击插件的 **刷新按钮** 🔄 |
| `popup.html` / `popup.js` | 关闭并重新打开 Popup 即可 |
| `background.js` | 在 `chrome://extensions/` 点击 Service Worker 链接 → 在打开的 DevTools 中按 `Ctrl+R`；或在插件卡片上点击刷新按钮 |
| `reading-visualization.html` / `dashboard.js` | 刷新 Dashboard 标签页（`F5` 或 `Ctrl+R`） |
| `reading-data.json` | 刷新 Dashboard 标签页 |

> [!TIP] **提速技巧**
> 在 `chrome://extensions/` 页面直接点击插件的刷新按钮 🔄 会同时重载 manifest、Service Worker 和所有扩展页面。如果你改了好几个文件，一键刷新最快。

### 2.4 演示模式（不需要 API Key）

如果你只是想看 Dashboard 长什么样，**不需要安装插件**：

```
直接双击 reading-visualization.html → 在浏览器中打开
→ 看到的是内置的静态演示数据
→ F12 Console 会显示：📄 数据来源：Local Fallback（静态演示数据）
```

---

## 3. 调试指南

### 3.1 每种脚本的 DevTools 入口

这是最容易困惑的地方——不同类型的脚本在不同的上下文中运行，需要**分别打开**各自的 DevTools：

| 脚本 | 运行环境 | 如何打开 DevTools |
|------|---------|-----------------|
| **popup.js** | Popup 弹出窗口 | 右键点击插件图标 →「检查弹出内容」 |
| **background.js** | Service Worker | `chrome://extensions/` → 插件卡片 → 点击「Service Worker」蓝色链接 |
| **dashboard.js** | Dashboard 扩展页面 | 在 Dashboard 标签页直接按 `F12` |
| **reading-visualization.html** | 同上 | 同上 |

> [!CAUTION] **关键提示**
> 这三个 DevTools 是**完全独立的**——在 Popup 的 Console 中看不到 Background 的日志，在 Background 中也看不到 Dashboard 的日志。排查跨组件通信问题时，需要同时打开 Popup 和 Service Worker 两个 DevTools。

### 3.2 调试通信流程

按以下顺序排查跨组件问题：

```
1. 打开 Service Worker DevTools
   → 观察 [weread-api] 开头的日志
   → 确认 fetch 请求是否发出、返回什么

2. 右键插件图标 → 检查弹出内容
   → 观察 [popup] 开头的日志
   → 确认消息是否发送成功

3. 打开 Dashboard 的 F12
   → 观察 [wereadDashboard] 开头的日志
   → 确认数据源是 Plugin Storage 还是 Local Fallback
```

### 3.3 关键日志标识

所有日志均使用 `[weread-xxx]` 前缀，可在 DevTools 筛选框中过滤：

| 前缀 | 来源文件 | 含义 |
|------|---------|------|
| `[weread-api]` | background.js | API 网关请求/响应 |
| `[weread-scraper]` | background.js | DOM 抓取进度（已废弃，当前版本不再出现） |
| `[wereadDashboard]` | dashboard.js | 数据加载、DOM 融合、数据来源 |
| `[weread-ai]` | dashboard.js | AI API 调用、流式接收 |
| `[popup]` | popup.js | 通信异常 |

### 3.4 使用 Chrome 存储查看器

```
1. 打开 Dashboard 页面 → F12 → Application 标签
2. 左侧 Storage → chrome.storage → local
3. 查看当前存储的 Key：
   - wereadApiKey（微信读书 API Key）
   - wereadAIConfig（AI 配置对象）
   - wereadData（完整阅读数据 JSON）
   - lastFetch（最后一次获取时间戳）
4. 可以手动删除某个 Key 来模拟"无缓存"状态
```

---

## 4. 数据格式与 API 契约

### 4.1 reading-data.json Schema

以下是一个完整的数据结构示例，每个字段都有注释：

```json
{
  // ═══ 总览统计 ═══
  "summary": {
    "totalShelf": 3800,           // 书架总数
    "books": 3799,                // 电子书数量
    "albums": 0,                  // 有声书数量
    "articleCollections": 1,      // 文章收藏夹（有=1，无=0）
    "booksWithNotes": 306,        // 有笔记/划线的书
    "totalNotes": 54978,          // 总笔记数（含划线+想法+点评）
    "totalReadingHours": 1012.4,  // 总阅读小时数（从秒转换）
    "readingDays": 883,           // 阅读天数（单日≥1分钟计数）
    "registDate": "2022-02-18",   // 注册日期（ISO 格式）
    "finishedBooks": 90,          // 已读完书数（finishReading=1）
    "publicBooks": 1265,          // 公开书架数量（secret=0）
    "privateBooks": 2535,         // 私密书架数量（secret=1）
    "booklists": 138              // 自建书单数量
  },

  // ═══ 年度阅读时长 ═══
  "yearlyReading": [
    { "year": 2018, "hours": 0 },    // 小时数（浮点数）
    { "year": 2022, "hours": 127.6 },
    { "year": 2023, "hours": 249.4 },
    { "year": 2024, "hours": 100.1 },
    { "year": 2025, "hours": 448.6 },
    { "year": 2026, "hours": 86.7 }
    // 年份范围：2018 ~ 当前年份
  ],

  // ═══ 高频作者 Top 10 ═══
  "topAuthors": [
    {
      "name": "陀思妥耶夫斯基",       // 作者名
      "readTime": "30小时33分钟",      // 格式化后的阅读时长字符串
      "count": 3                      // 阅读该作者的书籍数量
    }
  ],

  // ═══ 阅读分类 Top 10 ═══
  "topCategories": [
    {
      "title": "文学",                // 分类名
      "parent": "文学",               // 父分类名
      "readingCount": 50,             // 该分类下的阅读书籍数
      "readingTime": 412160           // 该分类下的阅读时长（**秒**，非分钟！）
    }
  ],

  // ═══ 笔记最多的书籍 Top 30 ═══
  "topNoteBooks": [
    {
      "title": "卡拉马佐夫兄弟",      // 书名
      "author": "陀思妥耶夫斯基",      // 作者
      "noteCount": 2252,              // 笔记数 = reviewCount + noteCount + bookmarkCount
      "bookId": "CB_4TBGK9GKK6Bx73d71SFYY7WB"  // 微信读书 Book ID
    }
  ],

  // ═══ 自建书单 ═══
  "booklists": [
    {
      "name": "女权主义/性别研究",     // 书单名称
      "bookCount": 104                // 书单中的书籍数
    }
  ],

  // ═══ 阅读时间最长的书 Top 10 ═══
  "readLongest": [
    {
      "title": "红书",                // 书名
      "author": "卡尔·荣格",          // 作者
      "readTimeHours": 21.9           // 阅读时长（小时，浮点数）
    }
  ],

  // ═══ 阅读勋章 ═══
  "medals": [
    {
      "name": "阅读时长",             // 勋章名
      "hint": "阅读 500 小时",         // 获得条件
      "displayText": "阅读 500 小时"   // 展示文本
    }
  ]
}
```

> [!CAUTION] **单位陷阱**
> 微信读书 API 中**所有时间字段的单位都是秒**。`background.js:159` 中的 `transformToDashboardSchema` 会将其除以 3600 转为小时。如果你直接修改转换逻辑，务必注意这个转换。

### 4.2 微信读书 API 网关契约

**请求格式**（所有请求统一 POST 到此网关）：

```
POST https://i.weread.qq.com/api/agent/gateway
Content-Type: application/json
Authorization: Bearer wrk-xxxxxxxxxxxxxxxx

{
  "api_name": "/shelf/sync",        // 必填：接口名
  "skill_version": "1.0",           // 必填：API 版本
  // 以下为接口特定参数
  "bookId": "...",                  // /book/info 时传
  "count": 50,                      // /user/notebooks 时传（分页）
  "mode": "overall"                 // /readdata/detail 时传
}
```

**三个核心接口**：

| api_name | 功能 | 关键返回 |
|----------|------|---------|
| `/shelf/sync` | 书架全量 | `books[]`, `albums[]`, `mp`, `archive[]`, `bookCount` |
| `/user/notebooks` | 笔记概览 | `books[]` (每本含 `reviewCount`, `noteCount`, `bookmarkCount`), `totalBookCount`, `totalNoteCount`, `hasMore`, `sort` (游标) |
| `/readdata/detail` | 阅读统计 | `totalReadTime` (秒), `readDays`, `registTime`, `preferAuthor[]`, `preferCategory[]`, `readLongest[]`, `medals[]`, `yearReport[]` |

**笔记分页**：`/user/notebooks` 使用基于 `sort` 的游标分页——传入 `lastSort` 获取下一页，直到 `hasMore=0`。**不要使用 `offset` 或 `limit`**。

### 4.3 AI API 契约（OpenAI-compatible）

**请求**（发起自 `dashboard.js:361-374`）：

```
POST {baseUrl}/chat/completions
Content-Type: application/json
Authorization: Bearer sk-xxxxxxxx

{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "你是一位资深的阅读心理学分析师..." },
    { "role": "user",   "content": "## 我的微信读书数据\n\n### 基本统计\n..." }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

**SSE 响应格式**（逐 chunk 推送）：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"###"}}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" 一"}}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"、阅读"}}]}

...

data: [DONE]
```

**解析逻辑**见 `dashboard.js:394-404`——每行以 `data: ` 开头，`data: [DONE]` 表示结束。

---

## 5. 常见问题排查

<details>
<summary><strong>Q: 点击"获取数据"按钮后无反应？</strong></summary>

1. 打开 Service Worker DevTools（`chrome://extensions/` → 点击 Service Worker 链接）
2. 查看 Console 是否有 `[weread-api]` 日志
3. 如果显示 `HTTP 401` 或 `HTTP 403` → API Key 无效或过期
4. 如果显示 `Failed to fetch` → DNS/网络问题，检查是否能访问 `i.weread.qq.com`
5. 如果什么日志都没有 → Service Worker 可能未唤醒，点击插件刷新按钮后重试
</details>

<details>
<summary><strong>Q: Dashboard 打开后是黑屏？</strong></summary>

1. 按 F12 打开 Dashboard 的 DevTools
2. 查看 Console 是否有 CSP 错误
3. 如果有 `violates Content Security Policy` → 检查 `reading-visualization.html` 是否还有残留的内联 `<script>` 标签
4. 如果有 `dashboard.js:1 Failed to load` → 检查文件名是否正确（`dashboard.js`），文件是否在根目录
</details>

<details>
<summary><strong>Q: AI 分析报 "AI API 返回 HTTP 401"？</strong></summary>

1. AI Key 可能无效或过期
2. 检查 Popup 中 AI 配置的 Base URL 是否正确——DeepSeek 的 v1 端点：`https://api.deepseek.com/v1`
3. 检查模型名是否与 API 提供商匹配——DeepSeek 应填 `deepseek-chat`
</details>

<details>
<summary><strong>Q: AI 分析报 "Failed to fetch"（网络错误）？</strong></summary>

1. 检查 `manifest.json` 的 `host_permissions` 是否包含你使用的 AI API 域名
2. 如果你使用了自定义 Base URL（如自建代理），必须在 `host_permissions` 中手动添加
3. 修改 manifest.json 后必须点击插件刷新按钮 🔄 使权限生效
</details>

<details>
<summary><strong>Q: 数据看板显示的是别人的数据？</strong></summary>

这是正常行为——直接双击 `reading-visualization.html` 打开时，看到的是内置的静态演示数据（作者的阅读数据）。要通过插件获取自己的数据：

1. 在 Chrome 扩展中加载本项目
2. 在 Popup 中填入你的微信读书 API Key
3. 点击"获取我的阅读数据"
4. Dashboard 会自动替换为你的数据
</details>

---

<p align="center">
  <i>文档最后更新：2026-06-12</i>
</p>
