# 📚 微信读书 · 数据看板

> **BYOK 纯本地** · 一键生成你的微信读书阅读数据可视化看板 + AI 深度阅读画像分析

[![Manifest V3](https://img.shields.io/badge/Chrome-MV3-blue?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-1.1.0-green)](manifest.json)

---

## ✨ 这是什么？

一个 **Chrome 浏览器扩展**，让你在 30 秒内将自己的微信读书数据（书架、笔记、阅读时长）变成一份精美的高级数据看板——像 New York Times Books 的杂志排版一样优雅。

**不需要输入密码。不需要登录。数据不会离开你的电脑。**

你只需要两把密钥——一把来自微信读书（`wrk-...`），一把来自 DeepSeek 或 OpenAI（`sk-...`）——剩下的全部在本地浏览器中完成。

---

## 🎯 核心亮点

<table>
<tr>
<td width="50%">

### 🖼️ 杂志式 Bento Box 排版
- 12 列 CSS Grid 错落有致
- 毛玻璃（backdrop-filter）卡片
- 「深夜书房」暗黑主题 + 麦芽金高亮

</td>
<td width="50%">

### ✨ 极致微动效
- Intersection Observer 滚动渐显
- 卡片悬停光晕（鼠标跟随）
- 丝滑的 `cubic-bezier(0.16, 1, 0.3, 1)` 过渡

</td>
</tr>
<tr>
<td width="50%">

### 🧠 AI 深度画像分析
- 流式打字机渲染（SSE Streaming）
- 支持 DeepSeek / OpenAI / Anthropic 等
- 6 维度深度阅读人格报告

</td>
<td width="50%">

### 🔒 绝对隐私安全
- 零后端 · 零服务器 · 零数据库
- API Key 仅保存在本地 `chrome.storage.local`
- 不上传、不收集任何用户数据

</td>
</tr>
</table>

---

## 🏗️ 架构总览

```
┌──────────────────────────────────────────────┐
│              Chrome Extension                 │
│                                              │
│  popup ──────► background.js ──────► storage │
│  (配置面板)     (Service Worker)    (local)  │
│                   │                          │
│                   │ POST                     │
│                   ▼                          │
│     i.weread.qq.com/api/agent/gateway        │
│     (微信读书官方 API Gateway)               │
│                                              │
│  Dashboard ◄──── chrome.storage.local        │
│  (数据可视化)                                │
│     │                                        │
│     │ POST (SSE Streaming)                   │
│     ▼                                        │
│  api.deepseek.com / api.openai.com           │
│  (AI 大模型深度分析)                          │
└──────────────────────────────────────────────┘
```

| 层级 | 技术 |
|------|------|
| 扩展框架 | Chrome Extension Manifest V3 |
| 前端 UI | 纯 HTML/CSS/JS（零框架），CSS Grid 12 列 Bento Box |
| 数据获取 | `fetch` API → 微信读书官方 Agent Gateway |
| 数据存储 | `chrome.storage.local`（键值对） |
| 通信 | `chrome.runtime.sendMessage`（Popup ↔ Background） |
| AI 集成 | OpenAI-compatible API + SSE Streaming |
| 动效 | Intersection Observer + CSS Transitions + 鼠标跟随径向渐变 |

---

## 🚀 快速开始

### 1. 获取 API Key

| 密钥 | 获取地址 | 格式 |
|------|---------|------|
| 微信读书 | [weread.qq.com/r/weread-skills](https://weread.qq.com/r/weread-skills) | `wrk-...` |
| AI 模型 | [platform.deepseek.com](https://platform.deepseek.com/) 或 [platform.openai.com](https://platform.openai.com/) | `sk-...` |

### 2. 安装插件

```
1. 克隆仓库
   git clone https://github.com/sctlilith-ops/wereadDashboard.git

2. 打开 Chrome → chrome://extensions/

3. 开启右上角「开发者模式」

4. 点击「加载已解压的扩展程序」→ 选择项目文件夹

5. 插件出现在工具栏 → 点击 → 输入 API Key → 保存 → 获取数据
```

### 3. 获取数据 + AI 分析

```
1. 点击插件图标 → 粘贴微信读书 API Key → 保存
2. 展开「AI 深度分析配置」→ 选择 DeepSeek → 粘贴 AI Key → 保存
3. 点击「获取我的阅读数据」→ Dashboard 自动打开
4. 点击「开始 AI 深度分析」→ 流式生成专属阅读画像
```

---

## 📸 功能预览

> *（截图占位 —— 请在此插入 Dashboard 页面截图）*

<!-- ![Dashboard Screenshot](screenshots/dashboard.png) -->

### Dashboard 包含 10+ 个分析模块：

- **Hero 画像** — 阅读总量画像 + 一句话定性
- **阅读时间线** — 年度阅读量变化趋势
- **主题地图** — 6 大核心阅读主题聚类
- **书籍影响力排行** — 笔记密度 × 阅读时长综合排名
- **关键词云** — 5 维度语义图谱
- **长期问题追踪** — 从阅读中识别的 6 个核心问题
- **困惑与解决路径** — 问题→阅读→认知工具关系链
- **思维方式画像** — 系统性/跨学科/批判性等 8 维度
- **价值观画像** — 从阅读中推断的核心信念
- **未来阅读建议** — 知识地图待探索区域

---

## 📁 项目结构

```
wereadDashboard/
├── manifest.json                 # Chrome Extension Manifest V3
├── popup.html                    # 弹出配置面板（暗黑主题）
├── popup.js                      # 弹出面板逻辑（Key 管理 + AI 配置）
├── background.js                 # Service Worker（API 网关 + 数据转换）
├── dashboard.js                  # Dashboard 前端逻辑（数据融合 + AI 流式）
├── reading-visualization.html    # Dashboard 可视化页面（Bento Box 布局）
├── reading-data.json             # Fallback 静态数据（演示模式）
├── reading-analysis.md           # 原始深度分析报告
├── reading_analysis_data.json    # 原始导出数据
├── DEVELOPER_HANDOVER.md         # 技术交接文档
├── DEVELOPMENT_GUIDE.md          # 本地开发调试指南
└── README.md                     # 本文件
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交你的修改：`git commit -m 'Add amazing feature'`
4. 推送到远端：`git push origin feature/amazing-feature`
5. 提交 Pull Request

> [!NOTE]
> 本项目坚持 **零框架依赖**。请不要引入 React、Vue 等需要编译步骤的前端框架。

---

## 📜 开源协议

MIT License — 详见 [LICENSE](LICENSE) 文件。

---

<p align="center">
  <i>由 Scarlet 与 AI (Claude Code) 共同构建</i>
</p>
