# OpenCode Web

OpenCode 会话管理的 Web 界面，采用单实例多会话架构。

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

## 快速开始

### 前置条件

1. 安装依赖
   ```bash
   npm install
   ```

2. 启动 opencode serve（重要！）
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

修改 `server.js` 中的端口配置：

```javascript
const WEB_SERVER_PORT = 3000;
const OPENCODE_SERVE_PORT = 4096;
```

## 故障排除

### 问题：无法创建会话
- **原因**: opencode serve 未启动
- **解决**: 在另一个终端运行 `opencode serve --port 4096`

### 问题：消息发送失败
- **原因**: opencode serve 进程崩溃
- **解决**: 重启 opencode serve

### 问题：无法访问
- **原因**: 端口被占用
- **解决**: 检查 3000 和 4096 端口占用情况

## 技术栈

- **后端**: Node.js + Express.js
- **前端**: Vanilla JavaScript + HTML5
- **实时通信**: SSE (Server-Sent Events)
- **OpenCode 集成**: HTTP API

## 版本

- **当前版本**: 2.0（单实例多会话架构）
- **更新日期**: 2026-02-01

## License

MIT
