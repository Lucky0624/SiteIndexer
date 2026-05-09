# SmartIndexer - 构建说明

## 环境要求

- **Node.js** 14+
- **Python** 3.8+ (用于 Rust 工具链)
- **Rust** (通过 `rustup` 安装)
- **Visual Studio Build Tools** (Windows)

## 快速开始

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
npm install

# 安装 Rust (如果没有)
# 访问 https://rustup.rs
```

### 2. 开发模式

```bash
# 启动开发服务器
npm run tauri dev
```

### 3. 构建发布版本

```bash
# 构建 Windows exe
npm run tauri build
```

## 项目结构

```
smart-indexer/
├── src/                    # React 前端
│   ├── components/          # UI 组件 (已汉化)
│   ├── lib/                # API 调用
│   ├── types/              # TypeScript 类型
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # 入口
│   │   ├── lib.rs          # 主库
│   │   ├── commands.rs     # Tauri 命令
│   │   ├── config.rs       # 配置管理
│   │   ├── sitemap.rs      # Sitemap 解析
│   │   ├── google_api.rs    # Google API 调用
│   │   ├── quota.rs        # 配额管理
│   │   ├── types.rs        # 类型定义
│   │   └── error.rs        # 错误处理
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── SPEC.md                 # 设计规格文档
```

## 技术亮点

相比原项目 (SmartInstantIndex) 的改进：

1. **使用现代技术栈**: Tauri + React + TypeScript + Rust
2. **更小的体积**: 最终 exe 约 10-15MB
3. **性能更好**: Rust 后端，原生性能
4. **修复已知问题**:
   - 移除了已弃用的 `oauth2client` 库
   - 改进了 sitemap 解析
   - 更好的错误处理
5. **完整的 UI 汉化**: 所有界面文本都是中文

## 常见问题

### Rust 编译错误

```bash
# 确保安装了正确的工具链
rustup default stable
rustup update
```

### Windows 构建错误

确保安装了 Visual Studio Build Tools 和 Windows SDK。

### 依赖安装失败

```bash
# 清理缓存后重试
npm cache clean --force
rm -rf node_modules
npm install
```
