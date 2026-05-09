# SmartIndexer - 设计规格文档

## 1. 项目概述

**项目名称**: SmartIndexer
**项目类型**: Windows 桌面应用（基于 Tauri）
**核心功能**: 读取网站 sitemap 并批量提交 URL 到 Google Indexing API
**目标用户**: 网站管理员、SEO 工作者、内容发布者

### 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript | 用户界面 |
| 后端 | Tauri (Rust) | 桌面应用框架 |
| 存储 | JSON 文件 | 配置和状态持久化 |
| API | Google Indexing API | URL 索引提交 |

---

## 2. 功能规格

### 2.1 核心功能

#### 2.1.1 站点管理
- 添加新站点（名称、sitemap URL）
- 编辑站点配置
- 删除站点
- 查看站点列表及统计信息

#### 2.1.2 Sitemap 解析
- 支持标准 XML sitemap
- 支持 sitemap index（多 sitemap 聚合）
- 递归解析子 sitemap
- 提取 URL 和 lastmod 时间戳

#### 2.1.3 URL 索引
- 批量提交 URL 到 Google Indexing API
- 支持多凭据轮换（突破 200/天限制）
- 实时进度显示
- 详细的索引日志

#### 2.1.4 配额管理
- 按凭据跟踪每日配额
- 自动轮换到下一个有配额的凭据
- 配额用尽警告

#### 2.1.5 URL 过滤
- 按文件扩展名过滤（如 .jpg, .pdf）
- 正则表达式排除模式
- 正则表达式包含模式
- lastmod 变更自动重置

#### 2.1.6 GSC 同步
- 从 Google Search Console 获取已索引状态
- 自动标记已索引的 URL

#### 2.1.7 凭据管理
- 上传 Google 服务账户 JSON
- 验证凭据有效性
- 删除凭据

### 2.2 用户界面

#### 2.2.1 布局结构
```
┌──────────────────────────────────────────────────────┐
│  SmartIndexer                              [最小化][关闭] │
├──────────┬─────────────────────────────────────────┤
│          │                                         │
│  站点    │         主内容区域                        │
│  设置    │                                         │
│  帮助    │                                         │
│          │                                         │
├──────────┴─────────────────────────────────────────┤
│  状态栏: 配额信息 | 连接状态                         │
└──────────────────────────────────────────────────────┘
```

#### 2.2.2 站点列表页
- 站点卡片展示
- 统计信息：总 URL、已索引、待处理、剩余配额
- 操作按钮：查看 URL、编辑、删除、运行索引

#### 2.2.3 站点详情页
- 统计卡片
- 配额进度条
- 操作按钮：获取网址、从 GSC 同步、重置全部
- URL 表格（分页、搜索、筛选）
- 批量操作

#### 2.2.4 设置页
- 凭据上传区
- 已存储凭据列表
- 配额说明

#### 2.2.5 帮助页
- 快速开始指南
- Google 凭据创建步骤
- 功能说明

### 2.3 数据模型

#### 2.3.1 配置结构 (config.json)
```json
{
  "sites": [
    {
      "name": "example-site",
      "sitemap_url": "https://example.com/sitemap.xml",
      "site_url": "sc-domain:example.com",
      "credentials": ["credentials-1.json"],
      "urls_file": "urls_example-site.json",
      "track_lastmod": false,
      "skip_extensions": [".jpg", ".png", ".pdf"],
      "exclude_patterns": ["/tag/", "/author/"],
      "include_patterns": []
    }
  ]
}
```

#### 2.3.2 URL 状态结构 (urls_*.json)
```json
{
  "https://example.com/page1": {
    "indexed": true,
    "indexed_at": "2024-01-15",
    "lastmod": "2024-01-14"
  }
}
```

#### 2.3.3 配额结构 (quota.json)
```json
{
  "credentials-1.json": {
    "date": "2024-01-15",
    "used": 45
  }
}
```

---

## 3. API 规格

### 3.1 Tauri 命令

#### 站点管理
| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_sites` | - | `Site[]` | 获取所有站点 |
| `create_site` | `SiteCreate` | `Site` | 创建站点 |
| `update_site` | `name, SiteUpdate` | `Site` | 更新站点 |
| `delete_site` | `name` | `bool` | 删除站点 |

#### URL 管理
| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_urls` | `site, filter, page` | `UrlPage` | 获取 URL 列表 |
| `fetch_urls` | `site` | `FetchResult` | 抓取 sitemap |
| `run_indexing` | `site` | `EventStream` | 运行索引（SSE） |
| `reset_urls` | `site, urls[]` | `bool` | 重置 URL 状态 |

#### 凭据管理
| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_credentials` | - | `Credential[]` | 获取凭据列表 |
| `upload_credential` | `file` | `Credential` | 上传凭据 |
| `delete_credential` | `filename` | `bool` | 删除凭据 |

### 3.2 Google API 调用

#### Indexing API
- 端点: `https://indexing.googleapis.com/v3/urlNotifications:publish`
- 认证: OAuth 2.0 Service Account
- 配额: 200 URL/天/项目

---

## 4. 错误处理

### 4.1 错误类型
| 错误码 | 说明 | 用户提示 |
|--------|------|----------|
| E001 | 无效的 sitemap URL | 请检查 sitemap 地址是否正确 |
| E002 | 无法连接 Google API | 请检查网络连接 |
| E003 | 凭据无效 | 请上传有效的服务账户 JSON |
| E004 | 配额已用尽 | 今日配额已用完，明天再试 |
| E005 | URL 格式错误 | 请检查 URL 格式 |

### 4.2 重试机制
- 网络错误：自动重试 3 次，间隔 1s, 2s, 4s
- 429 错误：等待直到配额重置

---

## 5. 安全考虑

- 服务账户 JSON 文件存储在本地，不上传任何服务器
- 凭据文件名使用哈希存储，不暴露敏感信息
- 支持代理设置（HTTPS/SOCKS5）

---

## 6. 验收标准

### 6.1 功能验收
- [ ] 可以添加、编辑、删除站点
- [ ] 可以成功解析 sitemap 并提取 URL
- [ ] 可以将 URL 提交到 Google Indexing API
- [ ] 配额统计和轮换正常工作
- [ ] URL 过滤功能正常
- [ ] GSC 同步功能正常
- [ ] 凭据上传和验证正常

### 6.2 UI 验收
- [ ] 界面完整中文化
- [ ] 所有按钮有正确的状态反馈
- [ ] 错误信息清晰易懂
- [ ] 响应式布局，窗口可调整大小

### 6.3 构建验收
- [ ] 成功构建 Windows exe 文件
- [ ] exe 文件可独立运行
- [ ] 无需安装额外运行时

---

## 7. 版本规划

### v1.0.0 (当前目标)
- 完整的站点管理和 URL 索引功能
- 基本的 UI 界面
- Windows exe 打包

### 未来版本
- v1.1: 定时任务功能
- v1.2: 邮件通知
- v1.3: 数据统计和报告
