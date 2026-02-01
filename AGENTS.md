# OpenCode Web - 项目知识库

**生成时间**: 2026-02-01
**版本**: 1.0
**架构**: 单实例多会话 Web 界面

## 概览

OpenCode Web - OpenCode 会话管理的 Web 界面，采用单实例多会话架构。Node.js + Express 后端，Vanilla JavaScript 前端，SSE 实时通信。

## 目录结构

```
./
├── server.js              # Express 服务器入口
├── public/               # 前端资源
├── archive/             # 历史备份文件
├── package.json         # 项目依赖
└── *.md                 # 文档 (README, ARCHITECTURE 等)
```

## 代码地图

| Symbol | 类型 | 位置 | 角色 |
|--------|------|------|------|
| `ServeManager` | Class | server.js | 管理 opencode serve 实例 (LRU 策略) |
| `ensureServe()` | Method | server.js | 确保目录的 serve 已启动 |
| `calculateTokenUsageFromMessages()` | Function | server.js | 从消息计算 token 使用情况 |
| `buildDirectoryToPortMapping()` | Function | server.js | 构建目录到端口的映射 |

## 约定

### 端口配置
- Web 服务器: `3000` (`WEB_SERVER_PORT`)
- OpenCode serve: `4096` 起始 (`DEFAULT_OPENCODE_SERVE_PORT`)
- 动态映射: `4096 + 映射数量`

### 数据存储
- OpenCode session 存储: `%USERPROFILE%\.local\share\opencode\storage\session`
- 项目目录 → 端口映射: `DIRECTORY_TO_PORT` Map
- Session token 使用缓存: `sessionTokenUsage` Map

### API 端点
- `POST /api/sessions` - 创建会话
- `GET /api/sessions` - 获取所有会话
- `GET /api/sessions/:id/messages` - 获取消息历史
- `POST /api/sessions/:id/message` - 发送消息
- `DELETE /api/sessions/:id` - 删除会话
- `GET /api/sessions/:id/events` - SSE 事件流

## 反模式

### 禁止操作
- 修改 `OPENCODE_STORAGE_DIR` 路径（硬编码的用户路径）
- 直接删除 `node_modules` 或依赖文件
- 同时运行超过 3 个 opencode serve 实例 (`MAX_CONCURRENT_SERVES`)

### 注意事项
- 修改端口配置需同步更新前端 `app.js` 中的 `currentOpenCodePort`
- archive 目录仅用于备份，不应引用其中的代码

## 命令

```bash
# 安装依赖
npm install

# 启动 opencode serve（必须先运行）
opencode serve --port 4096 --hostname localhost

# 启动 Web 服务器
node server.js

# 访问应用
http://localhost:3000
```

## 注意事项

- **启动顺序**: 必须先启动 `opencode serve`，再启动 `node server.js`
- **Token 压缩**: 会话 token 超过 100,000 时自动触发压缩逻辑
- **Serve 管理**: 最多同时运行 3 个 serve 实例，LRU 策略淘汰
- **端口映射**: 目录首次使用时动态分配端口，从 4096 开始

## 相关文档

- `README.md` - 快速开始和使用指南
- `ARCHITECTURE.md` - 架构设计详解
- `DEVELOPMENT.md` - 开发指南
- `DEPLOYMENT.md` - 部署文档
- `OPENCODE_SSE_EVENTS.md` - SSE 事件数据结构参考
