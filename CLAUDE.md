# 微信读书数据可视化项目 (wereadDashboard)

这个项目由 Scarlet 与 AI (Claude Code) 共同开发，用于分析和展示微信读书的阅读历史数据。

## 📍 项目基础信息

- **本地根目录**: `D:\Projects\ReadingDashboard`
- **GitHub 仓库**: `https://github.com/sctlilith-ops/wereadDashboard.git`
- **主分支名称**: `main`

## 📁 文件结构说明

- `reading-visualization.html` : 核心文件。纯静态的前端可视化仪表盘（包含图表、动效，不依赖任何后端或CDN）。
- `reading-analysis.md` : 微信读书数据的完整文本分析报告（包含 14 个章节）。
- `reading-data.json` : 结构化的阅读核心数据备份。
- `reading_analysis_data.json` : 原始或辅助分析数据集。

## 🛠️ 环境与网络配置

- **Git 状态**: 本地已初始化，且已成功关联并推送到 GitHub 远程仓库。
- **终端代理 (Mihomo Party)**: 如果遇到 GitHub 连接失败，需在终端运行以下命令：

  ```powershell
  git config --global http.proxy http://127.0.0.1:7890
  git config --global https.proxy http://127.0.0.1:7890
  ```

**⚠️ Claude Code 开发守则（AI 必读）**

1. **禁止重新初始化**: 本地已经是完整的 Git 仓库，**绝对不要**再次运行 `git init`。
2. **静态限制**: 修改或新增页面功能时，必须保持纯静态 HTML/CSS/JS 架构，禁止引入需要服务器运行的后端代码。
3. **协同提交**: 每次帮你完成重要功能修改或样式优化后，请**主动提醒** Scarlet 运行 `git add .` 和 `git commit -m "描述"` 来保存进度。
4. **代码风格**: 保持页面高级感、现代感（参考 Vercel/Apple 风格），广泛使用毛玻璃效果和丝滑的微动效。
