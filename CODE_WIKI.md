# SiteIndexer - Code Wiki

> 📚 项目完整技术文档

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [主要模块职责](#3-主要模块职责)
4. [关键类与函数说明](#4-关键类与函数说明)
5. [依赖关系](#5-依赖关系)
6. [项目运行方式](#6-项目运行方式)
7. [数据模型](#7-数据模型)
8. [API规格](#8-api规格)
9. [配置说明](#9-配置说明)

---

## 1. 项目概述

### 1.1 项目简介

**SiteIndexer** 是一款开源的本地桌面工具，帮助网站运营者通过 Google Indexing API 快速提交 URL，解决新页面迟迟不被 Google 收录的问题。

**核心价值**：
- 🚀 一键批量提交网站 URL 到 Google Indexing API
- 🔄 支持多凭据自动轮换，突破每日 200 URL 限制
- 🛡️ 代理隔离支持，防止多凭据共用 IP 触发风控
- 📊 实时可视化进度追踪
- 🌐 Google Search Console 集成

### 1.2 技术栈总览

| 层次 | 技术栈 | 说明 |
|------|--------|------|
| **桌面应用 (Tauri)** | React 18 + TypeScript + Rust | 现代化桌面应用框架 |
| **Web应用 (Python)** | FastAPI + Astro + React | 本地Web服务 + 现代前端 |
| **核心库** | Python 3.10+ | Google API 调用与数据处理 |
| **存储** | JSON 文件 | 配置和状态持久化 |
| **API集成** | Google Indexing API, GSC API | URL索引提交与状态查询 |

### 1.3 项目结构

```
SiteIndexer/
├── smartinstantindex/          # 核心 Python 库
│   ├── indexing.py             # Google Indexing API 调用
│   ├── sitemaps.py             # Sitemap 递归解析
│   ├── searchconsole.py        # GSC API 集成
│   └── utils.py                # 工具函数与配额管理
├── smart-indexer/              # Tauri 桌面应用
│   ├── src/                    # React 前端
│   └── src-tauri/              # Rust 后端
├── web_local/                  # Python Web 应用
│   ├── backend/
│   │   └── routes.py           # FastAPI 后端
│   └── frontend/               # Astro + React 前端
├── app.py                      # 桌面应用入口 (CustomTkinter)
├── app_web.py                  # Web 应用入口 (FastAPI)
└── build.py                    # PyInstaller 打包脚本
```

---

## 2. 整体架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层                                │
├─────────────────────┬─────────────────────┬─────────────────────┤
│   Tauri Desktop     │   Python Desktop    │    Web Browser      │
│   (React + Rust)    │  (CustomTkinter)    │   (Astro + React)   │
└──────────┬──────────┴──────────┬──────────┴──────────┬──────────┘
           │                     │                     │
           ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                        应用层 (API)                              │
├─────────────────────┬───────────────────────────────────────────┤
│   Tauri Commands    │         FastAPI Routes                    │
│   (Rust)            │         (Python)                          │
└──────────┬──────────┴──────────────┬────────────────────────────┘
           │                         │
           ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     核心业务层                                   │
├─────────────────────────────────────────────────────────────────┤
│                  smartinstantindex (Python)                     │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │  indexing.py │  sitemaps.py │searchconsole │   utils.py   │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     外部服务层                                   │
├──────────────────────┬──────────────────────────────────────────┤
│  Google Indexing API │      Google Search Console API           │
│  (URL 提交)          │      (索引状态查询)                       │
└──────────────────────┴──────────────────────────────────────────┘
```

### 2.2 数据流向

```
用户操作 → 界面层 → API层 → 核心业务层 → Google API
    ↓                              ↓
  配置文件 ← ← ← ← ← ← ← ← ← ← ←  数据持久化
```

---

## 3. 主要模块职责

### 3.1 核心库模块 (`smartinstantindex/`)

#### 3.1.1 `indexing.py` - Google Indexing API 调用

**职责**：处理与 Google Indexing API 的所有交互

**核心功能**：
- URL 索引提交（单次和批量）
- OAuth 2.0 服务账户认证
- 代理支持（HTTP/SOCKS5）
- 错误处理与重试机制

**关键函数**：
- `index_url(url, credentials_json, index, proxy)` - 提交单个 URL
- `index_url_from_dict(url, credentials_dict, index, proxy)` - 从字典加载凭据提交
- `index_urls_concurrent(urls, credentials_json, proxy, max_workers)` - 并发提交多个 URL

#### 3.1.2 `sitemaps.py` - Sitemap 解析

**职责**：解析网站的 sitemap.xml 文件

**核心功能**：
- 标准 XML sitemap 解析
- Sitemap index（嵌套 sitemap）递归解析
- URL 和 lastmod 时间戳提取
- 代理支持

**关键函数**：
- `fetch_urls_from_sitemap(sitemap_url, proxy)` - 获取单个 sitemap 的 URL
- `fetch_urls_from_sitemap_recursive(sitemap_url, visited_sitemaps, proxy)` - 递归获取所有 URL

#### 3.1.3 `searchconsole.py` - Google Search Console API 集成

**职责**：与 Google Search Console API 交互，查询已索引页面

**核心功能**：
- 查询 GSC 中已确认收录的页面
- 支持域名属性和 URL 前缀属性
- 分页查询大量数据
- 代理支持

**关键函数**：
- `fetch_indexed_pages(site_url, credentials_json, months_back, proxy)` - 获取已索引页面
- `fetch_indexed_pages_from_dict(site_url, credentials_dict, months_back, proxy)` - 从字典加载凭据查询
- `list_gsc_properties(credentials_json, proxy)` - 列出可访问的 GSC 属性

#### 3.1.4 `utils.py` - 工具函数与配额管理

**职责**：提供通用工具函数和配额管理功能

**核心功能**：
- 配置文件加载与保存
- URL 过滤（扩展名、正则模式）
- 配额跟踪与管理
- 数据迁移（旧格式兼容）

**关键函数**：
- `load_json(file_path)` / `save_urls_to_file(urls, file_path)` - JSON 文件操作
- `normalize_config(config)` - 配置标准化
- `filter_urls(urls, site_config)` - URL 过滤
- `update_quota_batch(credentials_file, count)` - 批量更新配额
- `build_indexing_plan(credentials_list)` - 构建索引计划

### 3.2 Tauri 桌面应用模块 (`smart-indexer/src-tauri/`)

#### 3.2.1 `lib.rs` - 应用入口

**职责**：初始化 Tauri 应用并注册命令

**核心功能**：
- 应用初始化
- 日志配置
- 命令注册
- 数据目录创建

#### 3.2.2 `commands.rs` - Tauri 命令

**职责**：定义前端可调用的所有后端命令

**核心命令**：
- `get_sites()` - 获取所有站点
- `get_site(name)` - 获取单个站点详情
- `create_site(site)` - 创建站点
- `update_site(name, site)` - 更新站点
- `delete_site(name)` - 删除站点
- `get_urls(site, filter, page, page_size, search)` - 获取 URL 列表
- `fetch_urls(site)` - 从 sitemap 获取 URL
- `reset_urls(site, urls)` - 重置 URL 状态
- `mark_indexed(site, urls)` - 标记为已索引
- `get_credentials()` - 获取凭据列表
- `delete_credential(filename)` - 删除凭据

#### 3.2.3 `config.rs` - 配置管理

**职责**：管理应用配置和数据存储

**核心功能**：
- 配置文件读写
- URL 数据存储
- 凭据管理
- 配额数据存储

#### 3.2.4 `google_api.rs` - Google API 调用

**职责**：Rust 实现的 Google API 调用

**核心功能**：
- OAuth 2.0 JWT 生成
- Access Token 获取
- URL 提交到 Indexing API
- 重试机制

#### 3.2.5 `sitemap.rs` - Sitemap 解析

**职责**：Rust 实现的 sitemap 解析

**核心功能**：
- XML 解析
- URL 提取
- 过滤与合并

#### 3.2.6 `quota.rs` - 配额管理

**职责**：跟踪每日 API 配额使用

**核心功能**：
- 配额读取与更新
- 日期重置检测

### 3.3 Web 应用模块 (`web_local/`)

#### 3.3.1 `backend/routes.py` - FastAPI 后端

**职责**：提供 RESTful API 和 SSE 流式推送

**核心端点**：

**站点管理**：
- `GET /api/sites` - 列出所有站点
- `GET /api/sites/{name}/stats` - 获取站点统计
- `POST /api/sites` - 创建站点
- `PUT /api/sites/{name}` - 更新站点
- `DELETE /api/sites/{name}` - 删除站点

**URL 管理**：
- `GET /api/sites/{name}/urls` - 获取 URL 列表（支持分页、过滤、搜索）
- `POST /api/sites/{name}/fetch-urls` - 从 sitemap 获取 URL
- `POST /api/sites/{name}/mark-indexed` - 标记为已索引
- `POST /api/sites/{name}/reset` - 重置 URL 状态

**索引操作（SSE 流）**：
- `GET /api/sites/{name}/run/stream` - 运行索引（实时进度）
- `POST /api/sites/{name}/run/selected/stream` - 运行选中 URL
- `GET /api/sites/{name}/sync-gsc/stream` - 同步 GSC 状态

**凭据管理**：
- `GET /api/credentials` - 列出凭据
- `POST /api/credentials/upload` - 上传凭据
- `DELETE /api/credentials/{filename}` - 删除凭据

**其他功能**：
- `GET /api/history` - 获取历史记录
- `POST /api/sites/{name}/set-priority` - 设置 URL 优先级
- `GET /api/sites/{name}/submit-bing/stream` - 提交到 Bing IndexNow

#### 3.3.2 `frontend/` - Astro + React 前端

**职责**：提供现代化的 Web 用户界面

**技术栈**：
- Astro 6.x - 静态站点生成
- React 19 - UI 组件
- TailwindCSS 4 - 样式
- Recharts - 图表可视化

**主要组件**：
- `App.tsx` - 应用主组件
- `Dashboard.tsx` - 仪表盘
- `SiteDetail.tsx` - 站点详情
- `SiteForm.tsx` - 站点表单
- `Settings.tsx` - 设置页面
- `Help.tsx` - 帮助页面
- `AnalyticsCharts.tsx` - 分析图表
- `UrlsTable.tsx` - URL 表格

---

## 4. 关键类与函数说明

### 4.1 Python 核心类与函数

#### 4.1.1 `indexing.py`

```python
def index_url(url: str, credentials_json: str, index: int, proxy: str = None) -> bool:
    """
    提交单个 URL 到 Google Indexing API
    
    参数:
        url: 要提交的 URL
        credentials_json: 服务账户 JSON 文件路径
        index: 索引编号（用于日志）
        proxy: 代理地址 (http:// 或 socks5://)
    
    返回:
        bool: 是否成功
    
    异常:
        Exception: API 调用失败或配额耗尽
    """
```

```python
def _get_http(proxy: str = None) -> httplib2.Http:
    """
    创建支持代理的 HTTP 客户端
    
    支持 HTTP 和 SOCKS5 代理，支持认证
    """
```

#### 4.1.2 `sitemaps.py`

```python
def fetch_urls_from_sitemap_recursive(
    sitemap_url: str, 
    visited_sitemaps: set = None, 
    proxy: str = None
) -> dict[str, str]:
    """
    递归获取 sitemap 中的所有 URL
    
    参数:
        sitemap_url: sitemap URL
        visited_sitemaps: 已访问的 sitemap 集合（防止循环）
        proxy: 代理地址
    
    返回:
        dict[url, lastmod]: URL 到最后修改时间的映射
    """
```

#### 4.1.3 `searchconsole.py`

```python
def fetch_indexed_pages(
    site_url: str, 
    credentials_json: str, 
    months_back: int = 16, 
    proxy: str = None
) -> set[str]:
    """
    从 Google Search Console 获取已索引页面
    
    参数:
        site_url: GSC 属性 URL (sc-domain:example.com 或 https://example.com/)
        credentials_json: 服务账户 JSON 文件路径
        months_back: 查询最近 N 个月的数据
        proxy: 代理地址
    
    返回:
        set[str]: 已索引页面的 URL 集合
    
    注意:
        需要在 GCP 项目中启用 "Google Search Console API"
    """
```

#### 4.1.4 `utils.py`

```python
def filter_urls(urls: dict, site_config: dict) -> dict:
    """
    根据 site 配置过滤 URL
    
    过滤规则:
        1. 跳过指定扩展名的文件
        2. 排除匹配排除模式的 URL
        3. 仅保留匹配包含模式的 URL（如果配置了）
    
    参数:
        urls: {url: lastmod} 字典
        site_config: 站点配置
    
    返回:
        dict: 过滤后的 URL 字典
    """
```

```python
def build_indexing_plan(credentials_list: list[str]) -> list[tuple[str, int]]:
    """
    构建索引计划，返回有剩余配额的凭据列表
    
    返回:
        [(credentials_file, remaining_quota), ...]
    """
```

### 4.2 Rust 核心类与函数

#### 4.2.1 `commands.rs`

```rust
#[tauri::command]
pub fn get_sites() -> Result<Vec<SiteWithStats>, AppError>

#[tauri::command]
pub fn create_site(site: SiteCreate) -> Result<SiteWithStats, AppError>

#[tauri::command]
pub fn fetch_urls(site: String) -> Result<FetchResult, AppError>
```

#### 4.2.2 `google_api.rs`

```rust
pub fn get_access_token(
    credential_path: &std::path::Path
) -> Result<(String, i64), AppError>

pub fn submit_url(url: &str, access_token: &str) -> Result<(), AppError>
```

### 4.3 FastAPI 路由函数

#### 4.3.1 SSE 流式推送

```python
@app.get("/api/sites/{name}/run/stream")
def run_stream(name: str):
    """
    运行索引任务，通过 SSE 实时推送进度
    
    事件类型:
        - connected: 连接建立
        - status: 状态更新
        - urls_found: 发现的 URL 数量
        - plan: 索引计划
        - indexed: 单个 URL 索引成功
        - quota_exhausted: 配额耗尽
        - error: 错误
        - done: 完成
    """
```

---

## 5. 依赖关系

### 5.1 Python 依赖

#### 核心依赖 (`requirements.txt`)

```
beautifulsoup4==4.12.3    # HTML/XML 解析
httplib2==0.22.0          # HTTP 客户端
oauth2client==4.1.3       # OAuth 2.0 认证
curl_cffi==0.7.4          # HTTP 客户端（支持浏览器指纹）
lxml                      # XML 解析
fastapi                   # Web 框架
uvicorn[standard]         # ASGI 服务器
python-multipart          # 文件上传支持
pyinstaller               # 打包工具
pystray                   # 系统托盘
pillow                    # 图像处理
PySocks                   # SOCKS 代理支持
```

#### 项目配置 (`pyproject.toml`)

```toml
[project]
name = "smartinstantindex"
version = "1.0.0"
requires-python = ">=3.10"
```

### 5.2 Node.js 依赖

#### Tauri 应用 (`smart-indexer/package.json`)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tauri-apps/api": "^1.5.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^1.5.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

#### Web 前端 (`web_local/frontend/package.json`)

```json
{
  "dependencies": {
    "astro": "^6.1.5",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "recharts": "^3.8.1",
    "tailwindcss": "^4.2.2"
  }
}
```

### 5.3 Rust 依赖 (`smart-indexer/src-tauri/Cargo.toml`)

```toml
[dependencies]
tauri = { version = "1.6", features = ["shell-open", "dialog-open", "fs-all", "window-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.11", features = ["json", "blocking"] }
scraper = "0.17"
quick-xml = "0.31"
chrono = { version = "0.4", features = ["serde"] }
dirs = "5.0"
thiserror = "1.0"
regex = "1.10"
url = { version = "2.5", features = ["serde"] }
openssl = "0.10"
```

### 5.4 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                     应用层依赖                               │
├─────────────────────────────────────────────────────────────┤
│  Tauri App        │  Python Desktop  │  Web App            │
│  - React          │  - CustomTkinter │  - Astro            │
│  - TypeScript     │  - tkinter       │  - React            │
│  - TailwindCSS    │                  │  - TailwindCSS      │
└────────┬──────────┴────────┬─────────┴────────┬────────────┘
         │                   │                  │
         ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     框架层依赖                               │
├─────────────────────────────────────────────────────────────┤
│  Tauri Runtime    │  Python Runtime   │  FastAPI           │
│  - Rust           │  - Python 3.10+   │  - Uvicorn         │
│  - WebView        │                   │  - Starlette       │
└────────┬──────────┴────────┬─────────┴────────┬────────────┘
         │                   │                  │
         ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     核心库依赖                               │
├─────────────────────────────────────────────────────────────┤
│  smartinstantindex (Python)                                 │
│  - httplib2 (HTTP 客户端)                                   │
│  - oauth2client (OAuth 认证)                                │
│  - beautifulsoup4 + lxml (XML 解析)                         │
│  - curl_cffi (HTTP 请求)                                    │
│  - PySocks (代理支持)                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 项目运行方式

### 6.1 环境要求

**Python 环境**：
- Python 3.10 或更高版本
- pip 包管理器

**Node.js 环境**（用于 Web 前端）：
- Node.js 22.12.0 或更高版本
- npm 包管理器

**Rust 环境**（用于 Tauri 应用）：
- Rust 1.70 或更高版本
- Cargo 包管理器

### 6.2 方式一：直接使用 EXE（推荐）

1. 从 [Releases](../../releases) 下载最新的 `SiteIndexer.exe`
2. 双击运行
3. 浏览器自动打开 `http://localhost:7842`
4. 上传 Google 服务账户 JSON → 新建站点 → 运行索引

### 6.3 方式二：从源码运行 Web 应用

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

### 6.4 方式三：从源码运行 Tauri 应用

```bash
# 1. 进入 Tauri 项目目录
cd smart-indexer

# 2. 安装前端依赖
npm install

# 3. 开发模式运行
npm run tauri dev

# 4. 构建生产版本
npm run tauri build
```

### 6.5 方式四：从源码运行 Python 桌面应用

```bash
# 1. 安装依赖
pip install -r requirements.txt
pip install customtkinter

# 2. 运行应用
python app.py
```

### 6.6 构建 EXE

```bash
python build.py
# 输出: dist/SiteIndexer.exe
```

### 6.7 运行流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     启动流程                                 │
├─────────────────────────────────────────────────────────────┤
│  1. 加载配置文件 (config.json)                              │
│  2. 初始化数据目录                                          │
│  3. 启动 Web 服务器 (localhost:7842)                        │
│  4. 打开浏览器 / 显示桌面窗口                               │
│  5. 创建系统托盘图标                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 数据模型

### 7.1 配置结构 (`config.json`)

```json
{
  "proxy": "http://127.0.0.1:7890",
  "sites": [
    {
      "name": "example-site",
      "sitemap_url": "https://example.com/sitemap.xml",
      "site_url": "sc-domain:example.com",
      "credentials": ["credentials-1.json", "credentials-2.json"],
      "credential_proxies": {
        "credentials-1.json": "socks5://127.0.0.1:1080",
        "credentials-2.json": "http://127.0.0.1:7890"
      },
      "urls_file": "urls_example-site.json",
      "track_lastmod": false,
      "skip_extensions": [".jpg", ".png", ".pdf"],
      "exclude_patterns": ["/tag/", "/author/"],
      "include_patterns": []
    }
  ],
  "indexnow_key": "your-indexnow-api-key"
}
```

### 7.2 URL 状态结构 (`urls_*.json`)

```json
{
  "https://example.com/page1": {
    "indexed": true,
    "indexed_at": "2024-01-15",
    "lastmod": "2024-01-14",
    "sc_synced_at": "2024-01-16",
    "priority": "high",
    "bing_submitted": "2024-01-15"
  },
  "https://example.com/page2": {
    "indexed": false,
    "lastmod": "2024-01-10"
  }
}
```

### 7.3 配额结构 (`quota.json`)

```json
{
  "credentials-1.json": {
    "date": "2024-01-15",
    "used": 45
  },
  "credentials-2.json": {
    "date": "2024-01-15",
    "used": 120
  }
}
```

### 7.4 历史记录结构 (`history.json`)

```json
[
  {
    "site": "example-site",
    "date": "2024-01-15",
    "time": "14:30:25",
    "indexed": 150,
    "errors": 2,
    "duration_s": 45.3
  }
]
```

### 7.5 TypeScript 类型定义

```typescript
interface Site {
  name: string;
  sitemap_url: string;
  site_url: string;
  track_lastmod: boolean;
  credentials: string[];
  skip_extensions: string[];
  exclude_patterns: string[];
  include_patterns: string[];
}

interface SiteWithStats extends Site {
  urls_total: number;
  urls_indexed: number;
  urls_pending: number;
  urls_gsc_indexed: number;
  quota: QuotaEntry[];
}

interface QuotaEntry {
  credentials_file: string;
  credentials_name: string;
  used: number;
  limit: number;
  remaining: number;
}

interface UrlEntry {
  url: string;
  indexed: boolean;
  indexed_at: string | null;
  lastmod: string | null;
  sc_synced_at: string | null;
  priority: "high" | "normal" | "low";
  category: string;
}
```

### 7.6 Rust 类型定义

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteConfig {
    pub name: String,
    pub sitemap_url: String,
    pub site_url: Option<String>,
    pub track_lastmod: bool,
    pub credentials: Vec<String>,
    pub skip_extensions: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub include_patterns: Vec<String>,
    pub urls_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlEntry {
    pub url: String,
    pub indexed: bool,
    pub indexed_at: Option<String>,
    pub lastmod: Option<String>,
    pub sc_synced_at: Option<String>,
}
```

---

## 8. API规格

### 8.1 Tauri 命令 API

#### 站点管理

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_sites` | - | `SiteWithStats[]` | 获取所有站点 |
| `get_site` | `name: String` | `SiteWithStats` | 获取站点详情 |
| `create_site` | `site: SiteCreate` | `SiteWithStats` | 创建站点 |
| `update_site` | `name: String, site: SiteUpdate` | `SiteWithStats` | 更新站点 |
| `delete_site` | `name: String` | `bool` | 删除站点 |

#### URL 管理

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_urls` | `site, filter, page, page_size, search` | `UrlPage` | 获取 URL 列表 |
| `fetch_urls` | `site: String` | `FetchResult` | 抓取 sitemap |
| `reset_urls` | `site: String, urls: Vec<String>` | `bool` | 重置 URL 状态 |
| `mark_indexed` | `site: String, urls: Vec<String>` | `bool` | 标记为已索引 |

#### 凭据管理

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_credentials` | - | `Credential[]` | 获取凭据列表 |
| `delete_credential` | `filename: String` | `bool` | 删除凭据 |

### 8.2 FastAPI REST API

#### 站点管理

```http
GET /api/sites
响应: [{name, sitemap_url, site_url, urls_total, urls_indexed, ...}]

GET /api/sites/{name}/stats
响应: {name, sitemap_url, site_url, urls_total, urls_indexed, ...}

POST /api/sites
请求体: {name, sitemap_url, site_url, credentials, ...}
响应: {name, sitemap_url, ...}

PUT /api/sites/{name}
请求体: {sitemap_url, site_url, credentials, ...}
响应: {name, sitemap_url, ...}

DELETE /api/sites/{name}
响应: {ok: true}
```

#### URL 管理

```http
GET /api/sites/{name}/urls?filter=all&page=1&page_size=100&search=&category=all
响应: {data: [...], total: 1000, page: 1, page_size: 100}

POST /api/sites/{name}/fetch-urls
响应: {found: 500, added: 50, removed: 5, reset: 10}

POST /api/sites/{name}/mark-indexed
请求体: {urls: ["https://..."]}
响应: {ok: true}

POST /api/sites/{name}/reset
请求体: {urls: ["https://..."]}  // 空 = 重置全部
响应: {ok: true}
```

#### 索引操作（SSE 流）

```http
GET /api/sites/{name}/run/stream
响应: text/event-stream
事件类型:
  - {type: "connected"}
  - {type: "status", message: "..."}
  - {type: "urls_found", count: 500}
  - {type: "plan", pending: 300, capacity: 600}
  - {type: "indexed", url: "...", done: 10, total: 300}
  - {type: "quota_exhausted", message: "..."}
  - {type: "error", message: "..."}
  - {type: "done", indexed: 300, pending: 0}

POST /api/sites/{name}/run/selected/stream
请求体: {urls: ["https://..."]}
响应: text/event-stream

GET /api/sites/{name}/sync-gsc/stream
响应: text/event-stream
```

#### 凭据管理

```http
GET /api/credentials
响应: [{filename, client_email, project_id}]

POST /api/credentials/upload
请求: multipart/form-data (file)
响应: {filename, client_email, project_id}

DELETE /api/credentials/{filename}
响应: {ok: true}
```

#### 其他功能

```http
GET /api/history?site=&limit=50
响应: [{site, date, time, indexed, errors, duration_s}]

DELETE /api/history
响应: {ok: true}

POST /api/sites/{name}/set-priority
请求体: {urls: [...], priority: "high"}
响应: {updated: 10}

GET /api/sites/{name}/submit-bing/stream
响应: text/event-stream
```

### 8.3 Google API 调用

#### Indexing API

- **端点**: `https://indexing.googleapis.com/v3/urlNotifications:publish`
- **方法**: POST
- **认证**: OAuth 2.0 Service Account
- **配额**: 200 URL/天/项目
- **请求体**:
  ```json
  {
    "url": "https://example.com/page",
    "type": "URL_UPDATED"
  }
  ```

#### Search Console API

- **端点**: `https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`
- **方法**: POST
- **认证**: OAuth 2.0 Service Account
- **请求体**:
  ```json
  {
    "startDate": "2023-01-01",
    "endDate": "2024-01-01",
    "dimensions": ["page"],
    "rowLimit": 25000,
    "startRow": 0
  }
  ```

---

## 9. 配置说明

### 9.1 站点配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 站点名称（唯一标识） |
| `sitemap_url` | string | ✅ | Sitemap XML 地址 |
| `site_url` | string | ❌ | GSC 属性 URL（用于同步已索引状态） |
| `credentials` | string[] | ✅ | 服务账户 JSON 文件列表 |
| `credential_proxies` | object | ❌ | 凭据级别的代理配置 |
| `urls_file` | string | ❌ | URL 数据存储文件（自动生成） |
| `track_lastmod` | boolean | ❌ | 是否跟踪 lastmod 变更 |
| `skip_extensions` | string[] | ❌ | 跳过的文件扩展名 |
| `exclude_patterns` | string[] | ❌ | 排除模式（正则或子串） |
| `include_patterns` | string[] | ❌ | 包含模式（白名单） |

### 9.2 GSC 属性 URL 格式

**域名属性**（推荐）：
```
sc-domain:example.com
```

**URL 前缀属性**：
```
https://example.com/
```

### 9.3 代理配置

**全局代理**：
```json
{
  "proxy": "http://127.0.0.1:7890"
}
```

**凭据级别代理**（优先级更高）：
```json
{
  "credential_proxies": {
    "credentials-1.json": "socks5://user:pass@127.0.0.1:1080",
    "credentials-2.json": "http://127.0.0.1:7890"
  }
}
```

**支持的代理类型**：
- HTTP: `http://host:port` 或 `http://user:pass@host:port`
- SOCKS5: `socks5://host:port` 或 `socks5://user:pass@host:port`

### 9.4 URL 过滤规则

**扩展名过滤**：
```json
{
  "skip_extensions": [".jpg", ".jpeg", ".png", ".gif", ".pdf", ".mp4", ".zip"]
}
```

**排除模式**（支持正则和子串）：
```json
{
  "exclude_patterns": ["/tag/", "/author/", "/page/\\d+"]
}
```

**包含模式**（白名单）：
```json
{
  "include_patterns": ["/blog/", "/products/"]
}
```

**优先级**：排除模式 > 包含模式

### 9.5 Google 凭据配置

#### 创建服务账户步骤

1. **创建 GCP 项目**
   - 访问 [Google Cloud Console](https://console.cloud.google.com)
   - 新建项目

2. **启用 API**
   - 搜索 "Web Search Indexing API"
   - 点击 "ENABLE"
   - （可选）启用 "Google Search Console API"

3. **创建服务账户**
   - IAM & Admin → Service Accounts → Create Service Account
   - Keys 标签 → Add Key → JSON
   - 下载 `.json` 文件

4. **添加到 Search Console**
   - 复制服务账户邮箱
   - Search Console → 选择站点 → Settings → Users and permissions
   - Add user → 粘贴邮箱 → 角色设为 Owner

### 9.6 配额管理

**每日配额限制**：
- 每个 GCP 项目：200 URL/天
- 多凭据轮换：N 个项目 = N × 200 URL/天

**配额重置**：
- 每日 UTC 00:00 重置
- 自动跟踪使用量

**查看配额**：
- Dashboard 显示每个凭据的使用进度条
- API: `GET /api/sites/{name}/stats`

---

## 附录

### A. 错误代码

| 错误码 | 说明 | 用户提示 |
|--------|------|----------|
| E001 | 无效的 sitemap URL | 请检查 sitemap 地址是否正确 |
| E002 | 无法连接 Google API | 请检查网络连接 |
| E003 | 凭据无效 | 请上传有效的服务账户 JSON |
| E004 | 配额已用尽 | 今日配额已用完，明天再试 |
| E005 | URL 格式错误 | 请检查 URL 格式 |
| 403 | 权限被拒绝 | 凭据未添加为 Search Console 的 Owner |
| 429 | 配额耗尽 | 自动切换到下一个凭据 |

### B. 重试机制

- **网络错误**：自动重试 3 次，间隔 1s, 2s, 4s
- **429 错误**：自动切换凭据
- **403 错误**：跳过该凭据，尝试下一个

### C. 安全考虑

- 服务账户 JSON 文件存储在本地，不上传任何服务器
- 凭据文件名使用哈希存储，不暴露敏感信息
- 支持代理设置（HTTPS/SOCKS5）
- 所有 API 调用使用 HTTPS 加密

### D. 性能优化

- **批量保存**：每 10 个 URL 保存一次，减少磁盘 I/O
- **并发提交**：支持多线程并发提交 URL
- **SSE 流式推送**：实时进度反馈，无需轮询
- **分页查询**：URL 列表支持分页，避免加载大量数据

### E. 日志配置

创建 `logging.conf` 文件自定义日志级别：

```ini
[loggers]
keys=root,smartinstantindex

[handlers]
keys=consoleHandler

[formatters]
keys=simpleFormatter

[logger_root]
level=INFO
handlers=consoleHandler

[logger_smartinstantindex]
level=DEBUG
handlers=consoleHandler
qualname=smartinstantindex
propagate=0

[handler_consoleHandler]
class=StreamHandler
level=DEBUG
formatter=simpleFormatter
args=(sys.stdout,)

[formatter_simpleFormatter]
format=%(asctime)s - %(name)s - %(levelname)s - %(message)s
```

---

## 版本历史

### v1.0.0 (当前)
- 完整的站点管理和 URL 索引功能
- 多凭据自动轮换
- 代理隔离支持
- GSC 同步功能
- Bing IndexNow 支持
- 现代化 UI（Web + Desktop）

### 未来版本
- v1.1: 定时任务功能
- v1.2: 邮件通知
- v1.3: 数据统计和报告

---

**文档维护者**: SiteIndexer Team  
**最后更新**: 2024-01-15  
**文档版本**: 1.0.0
