# SiteIndexer

> 🚀 一键将你的网站页面批量提交给 Google Indexing API，加速搜索引擎收录。

SiteIndexer 是一款开源的本地桌面工具，帮助网站运营者通过 Google Indexing API 快速提交 URL，解决新页面迟迟不被 Google 收录的问题。支持多站点管理、多凭据自动轮换、代理隔离和实时可视化进度追踪。

---

## ✨ 核心功能

### 📡 智能批量索引
- 自动解析 Sitemap（支持嵌套 sitemap），一键获取全站 URL
- 实时 SSE 流式推送索引进度，带可视化进度条
- 支持 `lastmod` 变更自动检测 —— 内容更新后自动重新提交

### 🔑 多凭据自动轮换
- 支持添加来自多个 GCP 项目的服务账户凭据
- 当一个凭据达到每日 200 URL 配额上限时，**自动切换**到下一个
- 示例：3 个 GCP 项目 = 每天 600 URL 额度

### 🛡️ 代理隔离 (Proxy Isolation)
- 为每个凭据配置**独立代理**（HTTP / SOCKS5）
- 防止多凭据共用同一 IP 触发 Google 风控
- 支持全局代理 + 凭据级代理优先级覆盖

### 📊 数据可视化
- 圆环图直观展示已提交 / 待处理比例
- 每日配额进度条，一目了然
- GSC 收录状态同步与对比

### 🌐 Google Search Console 集成
- 支持查询 GSC 中已确认收录的页面
- 自动标记已收录 URL，避免重复提交
- 支持域名属性 (`sc-domain:`) 和 URL 前缀属性

### 💡 智能错误处理
- SSL 连接中断 → `网络连接意外中断 (SSL EOF) - 请检查代理节点是否稳定`
- 服务器不可达 → `无法连接到 Google 服务器 - 请检查网络或代理设置`
- 权限被拒绝 (403) → 自动跳过该凭据，尝试下一个
- 配额耗尽 (429) → 自动切换凭据继续提交

### 🎨 现代化 UI
- 深色毛玻璃 (Glassmorphism) 设计，视觉高级感
- 页面切换不中断索引进度（CSS display 隐藏而非组件卸载）
- 全中文界面，开箱即用

---

## 📸 界面预览

| 站点列表 | 站点详情 & 图表 | 设置页面 |
|:---:|:---:|:---:|
| 毛玻璃卡片 + 进度条 | 收录饼图 + 配额条 | 拖拽上传凭据 |

---

## 🏁 快速开始

### 方式一：直接使用 EXE（推荐）

1. 前往 [Releases](../../releases) 下载最新的 `SiteIndexer.exe`
2. 双击运行，浏览器自动打开 `http://localhost:7842`
3. 上传 Google 服务账户 JSON → 新建站点 → 运行索引

### 方式二：从源码运行

```bash
# 1. 克隆仓库
git clone https://github.com/Lucky0624/SiteIndexer.git
cd SiteIndexer

# 2. 安装 Python 依赖
pip install -r requirements.txt

# 3. 构建前端（需要 Node.js）
cd web_local/frontend
npm install
npm run build
cd ../..

# 4. 启动应用
python app_web.py
```

### 构建 EXE

```bash
python build.py
# 输出: dist/SiteIndexer.exe
```

---

## 🔧 Google 凭据配置指南

<details>
<summary><strong>点击展开完整步骤</strong></summary>

### Step 1 — 创建 GCP 项目
访问 [Google Cloud Console](https://console.cloud.google.com) → 新建项目

### Step 2 — 启用 API
搜索 **Web Search Indexing API** → 点击 **ENABLE**

### Step 3 — 创建服务账户
**IAM & Admin** → **Service Accounts** → **+ Create Service Account**  
→ **Keys** 标签 → **Add Key** → **JSON** → 下载 `.json` 文件

### Step 4 — 添加到 Search Console
复制服务账户邮箱 → [Search Console](https://search.google.com/search-console)  
→ 选择站点 → **Settings** → **Users and permissions** → **Add user**  
→ 粘贴邮箱 → 角色设为 **Owner** → 添加

### Step 5 — 上传到 SiteIndexer
打开 **设置** 页面 → 上传 JSON 文件 → 在站点中分配该凭据

</details>

---

## 🏗️ 技术架构

```
SiteIndexer
├── smartinstantindex/      # 核心 Python 库
│   ├── indexing.py          # Google Indexing API 调用（支持代理）
│   ├── sitemaps.py          # Sitemap 递归解析
│   ├── searchconsole.py     # GSC API 集成
│   └── utils.py             # 配额管理、URL 过滤
├── web_local/
│   ├── backend/
│   │   └── routes.py        # FastAPI 后端 + SSE 流
│   └── frontend/            # Astro + React + TailwindCSS
│       └── src/components/  # Glassmorphism UI 组件
├── app_web.py               # 入口：启动服务 + 系统托盘
└── build.py                 # PyInstaller 打包脚本
```

| 层 | 技术栈 |
|---|---|
| **后端** | Python 3.10+, FastAPI, httplib2, oauth2client |
| **前端** | Astro, React, TailwindCSS v4, Recharts |
| **打包** | PyInstaller (单文件 EXE) |
| **代理** | PySocks (HTTP/SOCKS5) |

---

## 📋 配置示例

```json
{
  "sites": [
    {
      "name": "my-blog",
      "sitemap_url": "https://example.com/sitemap.xml",
      "site_url": "sc-domain:example.com",
      "credentials": ["cred-project-a.json", "cred-project-b.json"],
      "credential_proxies": {
        "cred-project-a.json": "socks5://127.0.0.1:1080",
        "cred-project-b.json": "http://127.0.0.1:7890"
      },
      "track_lastmod": true,
      "skip_extensions": [".pdf", ".jpg", ".png"],
      "exclude_patterns": ["/tag/", "/admin/"],
      "include_patterns": []
    }
  ]
}
```

---

## 📄 License

[MIT](LICENSE) — 自由使用、修改和分享。

---

<p align="center">
  Made with 💜 for SEO professionals
</p>
