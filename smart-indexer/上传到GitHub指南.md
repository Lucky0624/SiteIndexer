# 上传到 GitHub 指南

## 方法一：使用 GitHub 网页（推荐新手）

### 1. 在 GitHub 上创建仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角 **+** → **New repository**
3. 填写信息：
   - **Repository name**: `smart-indexer`
   - **Description**: `Google Indexing API 桌面客户端 - 快速将网站 URL 提交到 Google 索引`
   - **选择 Public**（公开）或 Private（私有）
   - **不要**勾选 "Add a README file"
   - **不要**勾选 "Add .gitignore"（我们已经有了）
4. 点击 **Create repository**

### 2. 初始化本地仓库并推送

在项目目录中打开终端（PowerShell 或 CMD），运行：

```powershell
cd D:\smartinstantindex-3.1.1\smart-indexer

# 初始化 git
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: SmartIndexer v1.0.0

- 使用 Tauri + React + Rust 构建
- 完整的 Google Indexing API 客户端
- 中文界面
- 支持多凭据配额管理
- 支持 sitemap 解析和 URL 过滤
"

# 添加远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/smart-indexer.git

# 推送
git branch -M main
git push -u origin main
```

---

## 方法二：使用 GitHub CLI（需要先安装）

### 1. 安装 GitHub CLI

```powershell
# 使用 winget (Windows)
winget install GitHub.cli

# 或者从 https://cli.github.com 下载安装包
```

### 2. 认证

```powershell
gh auth login
```

### 3. 创建仓库并推送

```powershell
cd D:\smartinstantindex-3.1.1\smart-indexer

# 初始化
git init
git add .
git commit -m "Initial commit"

# 创建 GitHub 仓库并推送
gh repo create smart-indexer --public --source=. --push
```

---

## 方法三：使用 VS Code（如果你有 VS Code）

1. 在 VS Code 中打开 `D:\smartinstantindex-3.1.1\smart-indexer` 文件夹
2. 安装 "GitHub Pull Requests and Issues" 扩展
3. 点击左侧 **源代码管理** 图标
4. 点击 **发布到 GitHub**
5. 按照提示操作

---

## 推送后的下一步

1. 创建第一个 Release（可选）：
   ```powershell
   gh release create v1.0.0 --title "SmartIndexer v1.0.0" --notes "第一个版本发布"
   ```

2. 添加 topics（在 GitHub 仓库页面右侧）：
   - `tauri`
   - `react`
   - `rust`
   - `google-indexing-api`
   - `seo-tools`

3. 编写详细的 README（可选增强）：
   - 添加徽章（badges）
   - 添加截图
   - 添加贡献指南

---

## 常见问题

### Q: 推送时被拒绝？
```
! [rejected] main -> main (fetch first)
```
解决：
```powershell
git pull origin main --rebase
git push origin main
```

### Q: 如何更新代码？
```powershell
git add .
git commit -m "你的更新说明"
git push
```

### Q: 如何查看远程仓库地址？
```powershell
git remote -v
```
