# OpenCode Web

OpenCode 会话管理的 Web 界面，采用单实例多会话架构。

## 项目介绍

OpenCode Web 是一个现代化的 Web 界面，用于管理和交互 OpenCode AI 会话。它采用**单实例多会话架构**，可以在一个浏览器界面中同时管理多个独立的 AI 对话会话，所有会话共享同一个 opencode serve 实例，节省系统资源。

### 主要特性

- **多会话管理** - 在一个界面中同时管理多个独立的 AI 对话会话
- **实时消息推送** - 基于 SSE (Server-Sent Events) 的实时通信
- **会话持久化** - 重启后自动恢复所有会话和消息历史
- **自动命名** - 自动根据会话内容生成有意义的会话标题
- **现代化 UI** - 简洁直观的用户界面设计
- **跨平台支持** - 支持 Windows、Linux、macOS
- **配置灵活** - 支持环境变量和配置文件自定义

### 技术栈

- **后端**: Node.js + Express.js
- **前端**: Vanilla JavaScript + HTML5
- **实时通信**: SSE (Server-Sent Events)
- **OpenCode 集成**: HTTP API

## 架构说明

本项目采用**单实例多会话架构**：

```
┌─────────────────────┐
│  opencode serve  │  ← 启动一次
│   (1个实例)     │     opencode serve
│  端口: 4096   │     --port 4096
└────────┬───────────┘
         │
     ┌────┴────────┬────────────────┐
     ↓             ↓                ↓
Web 会话 1    Web 会话 2      Web 会话 N
(通过 sessionId)  (通过 sessionId)  (通过 sessionId)
```

- **Web 服务器**: http://localhost:3000
- **OpenCode serve**: http://localhost:4096
- 所有会话共享同一个 opencode serve 实例

## 功能特性

- ✅ 多会话管理（一个实例支持多个独立会话）
- ✅ 实时消息推送（SSE）
- ✅ 会话持久化（重启后自动恢复）
- ✅ 自动生成会话名称
- ✅ 简洁现代的 UI 设计
- ✅ 多实例并行管理（LRU 策略）
- ✅ 会话压缩功能
- ✅ 消息流式输出
- ✅ 后台任务完成通知

## 快速开始

### 前置条件

1. 安装 Node.js（建议 16.x 或更高版本）
2. 安装 opencode CLI 工具
3. 克隆本项目仓库

### 安装步骤

1. 安装项目依赖
   ```bash
   npm install
   ```

2. 启动 opencode serve（重要！必须先启动）
   ```bash
   # 在另一个终端窗口中运行
   opencode serve --port 4096 --hostname localhost
   ```

3. 启动 Web 服务器
   ```bash
   node server.js
   ```

### 访问应用

在浏览器中打开：
```
http://localhost:3000
```

## 使用指南

### 创建会话

1. 点击右上角的"+ 新建会话"按钮
2. 在目录浏览器中选择工作目录，或手动输入路径
3. 点击"创建"按钮

### 使用会话

1. 从左侧会话列表中选择一个会话
2. 输入消息并按 Enter 发送
3. 实时接收 AI 的回复

### 删除会话

1. 选中要删除的会话
2. 点击"删除会话"按钮
3. 确认删除操作

## API 文档

### 创建会话
```http
POST /api/sessions
Content-Type: application/json

{
  "title": "会话标题（可选）",
  "directory": "工作目录（可选）"
}

响应：
{
  "sessionId": "web-xxx",
  "opencodeSessionId": "ses_xxx",
  "title": "会话标题",
  "directory": "工作目录",
  "createdAt": "2026-01-31T...",
  "updatedAt": "2026-01-31T..."
}
```

### 获取所有会话
```http
GET /api/sessions

响应：
[
  {
    "sessionId": "web-xxx",
    "opencodeSessionId": "ses_xxx",
    "title": "会话标题",
    "directory": "工作目录",
    "createdAt": "2026-01-31T...",
    "updatedAt": "2026-01-31T...",
    "active": true
  }
]
```

### 发送消息
```http
POST /api/sessions/:id/message
Content-Type: application/json

{
  "content": "用户消息内容"
}

响应：OpenCode AI 的完整回复
```

### 获取消息历史
```http
GET /api/sessions/:id/messages

响应：消息历史数组
```

### 删除会话
```http
DELETE /api/sessions/:id

响应：
{
  "success": true,
  "message": "会话已删除"
}
```

### SSE 实时事件流
```http
GET /api/sessions/:id/events

响应：Server-Sent Events 实时推送
```

## 项目结构

```
opencode-web/
├── server.js                 # Express 服务器
├── ARCHITECTURE.md           # 架构设计文档
├── DEPLOYMENT.md             # 部署文档
├── DEVELOPMENT.md            # 开发文档
├── OPENCODE_SSE_EVENTS.md    # SSE 事件数据结构参考
├── public/                 # 前端文件
│   ├── index.html        # 主页面
│   ├── app.js           # 前端逻辑
│   └── style.css         # 样式文件
├── package.json              # 项目依赖
└── README.md               # 本文件
```

## 配置

### 环境变量配置

本项目支持通过环境变量自定义配置。可以在项目根目录创建 `.env` 文件（或在命令行中设置）来覆盖默认配置。

| 环境变量 | 默认值 | 说明 |
|-----------|---------|------|
| `WEB_SERVER_PORT` | `3000` | Web 服务器端口 |
| `OPENCODE_HOST` | `localhost` | OpenCode serve 主机地址 |
| `DEFAULT_OPENCODE_SERVE_PORT` | `4096` | OpenCode serve 默认端口 |
| `OPENCODE_STORAGE_DIR` | `%USERPROFILE%\.local\share\opencode\storage\session` | OpenCode session 存储目录 |
| `MAX_CONCURRENT_SERVES` | `3` | 最大并发 serve 实例数 |
| `PORT_CHECK_TIMEOUT` | `3000` | 端口检查超时（毫秒） |
| `WAIT_FOR_PORT_TIMEOUT` | `30000` | 等待端口就绪超时（毫秒） |
| `OPENCODE_REQUEST_TIMEOUT` | `30000` | OpenCode 请求默认超时（毫秒） |
| `SEND_MESSAGE_TIMEOUT` | `60000` | 发送消息超时（毫秒） |
| `HEALTH_CHECK_INTERVAL` | `60000` | 健康检查间隔（毫秒） |
| `API_BASE` | `/api/sessions` | 前端 API 基础路径 |
| `SSE_RECONNECT_DELAY` | `3000` | SSE 重连延迟（毫秒） |
| `DEFAULT_DIRECTORY` | `%USERPROFILE%` | 默认工作目录 |

### 配置示例

创建 `.env` 文件（可选）：

```bash
# 服务器配置
WEB_SERVER_PORT=3000
OPENCODE_HOST=localhost

# OpenCode 配置
DEFAULT_OPENCODE_SERVE_PORT=4096
MAX_CONCURRENT_SERVES=3

# 超时配置（毫秒）
PORT_CHECK_TIMEOUT=3000
WAIT_FOR_PORT_TIMEOUT=30000
SEND_MESSAGE_TIMEOUT=60000

# 前端配置
SSE_RECONNECT_DELAY=3000
DEFAULT_DIRECTORY=/home/user
```

### 配置文件结构

项目使用 `config.js` 模块进行配置管理，提供默认值和环境变量支持。所有配置都可通过环境变量覆盖，无需修改源代码。

## 故障排除

### 问题：无法创建会话
- **原因**: opencode serve 未启动
- **解决**: 在另一个终端运行 `opencode serve --port 4096 --hostname localhost`
- **验证**: 访问 `http://localhost:4096` 确认 serve 正常运行

### 问题：消息发送失败
- **原因**: opencode serve 进程崩溃或无响应
- **解决**: 重启 opencode serve，检查进程日志
- **提示**: 查看浏览器控制台和服务器终端的错误信息

### 问题：无法访问 Web 界面
- **原因**: 端口被占用或服务器未启动
- **解决**:
  - 检查 3000 端口占用情况
  - 确认已运行 `node server.js`
  - 尝试使用其他端口：`WEB_SERVER_PORT=3001 node server.js`

### 问题：会话列表为空
- **原因**: OpenCode session 目录不存在或路径错误
- **解决**:
  - 检查 `OPENCODE_STORAGE_DIR` 环境变量配置
  - 确保 opencode serve 已正常运行并创建过会话

### 问题：SSE 连接频繁断开
- **原因**: 网络不稳定或服务器超时
- **解决**:
  - 增加 `SSE_RECONNECT_DELAY` 环境变量值
  - 检查网络连接稳定性
  - 查看 OpenCode serve 日志

### 问题：跨平台路径问题
- **原因**: Windows/Linux/macOS 路径格式不同
- **解决**: 使用环境变量 `DEFAULT_DIRECTORY` 配置平台特定的默认路径
  - Windows: `C:\Users\YourName`
  - Linux/macOS: `/home/yourname`

## 技术栈

- **后端**: Node.js + Express.js
- **前端**: Vanilla JavaScript + HTML5
- **实时通信**: SSE (Server-Sent Events)
- **OpenCode 集成**: HTTP API

## 版本

- **当前版本**: 2.1（配置文件支持 + 增强的文档）
- **更新日期**: 2026-02-02

## License

MIT

---

## 快速参考

### 启动顺序（重要！）

**必须按以下顺序启动服务：**

1. **第一个终端** - 启动 opencode serve
   ```bash
   opencode serve --port 4096 --hostname localhost
   ```

2. **第二个终端** - 启动 Web 服务器
   ```bash
   node server.js
   ```

3. **浏览器** - 访问应用
   ```
   http://localhost:3000
   ```

### 常用命令

```bash
# 安装依赖
npm install

# 启动服务（需要在两个终端分别运行）
opencode serve --port 4096 --hostname localhost  # 终端 1
node server.js                                      # 终端 2

# 自定义端口启动
WEB_SERVER_PORT=3001 node server.js

# 查看日志
# opencode serve 和 Web 服务器的日志会输出到各自终端
```

### 目录结构

```
opencode-web/
├── config.js                 # 配置文件（支持环境变量）
├── server.js                 # Express 服务器
├── .env                      # 环境变量配置（可选，需手动创建）
├── ARCHITECTURE.md           # 架构设计文档
├── DEPLOYMENT.md             # 部署文档
├── DEVELOPMENT.md            # 开发文档
├── OPENCODE_SSE_EVENTS.md    # SSE 事件数据结构参考
├── public/                  # 前端文件
│   ├── index.html           # 主页面
│   ├── app.js              # 前端逻辑
│   └── style.css           # 样式文件
├── package.json              # 项目依赖
└── README.md               # 本文件
```

### 进一步了解

- 查看 `ARCHITECTURE.md` 了解详细的架构设计
- 查看 `DEVELOPMENT.md` 了解开发指南
- 查看 `DEPLOYMENT.md` 了解部署选项
