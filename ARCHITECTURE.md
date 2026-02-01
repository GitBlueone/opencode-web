# OpenCode Web 架构设计文档

## 1. 概述

### 1.1 架构目标

OpenCode Web 是一个基于 HTTP 的 OpenCode 会话管理服务，为 Web 客户端提供 OpenCode 功能的统一访问接口。

**核心设计原则**：
- 单实例多会话架构：一个 opencode serve 实例管理所有会话
- 简洁的 API 设计
- SSE 实时事件推送
- 无状态 RESTful API

### 1.2 技术栈

| 组件 | 技术 |
|--------|------|
| Web 服务器 | Express.js (Node.js) |
| OpenCode 集成 | opencode serve HTTP API |
| 实时通信 | SSE (Server-Sent Events) |
| 前端 | Vanilla JavaScript + HTML5 |

---

## 2. 架构设计

### 2.1 系统架构图

```
┌─────────────────────┐
│  opencode serve  │  ← 启动一次
│   (端口: 4096)  │     管理所有会话
└────────┬───────────┘
         │
    ┌────┴────────┬───────────┬─────────┐
    ↓            ↓         ↓         ↓
Web 会话 1  Web 会话 2      Web 会话 N
(通过 sessionId)  (通过 sessionId) (通过 sessionId)
```

### 2.2 核心流程

#### 2.2.1 创建会话

```
1. 用户点击"新建会话"
   ↓
2. 前端 POST /api/sessions {title, directory}
   ↓
3. Web 服务器转发到 opencode serve
   POST http://localhost:4096/session
   ↓
4. opencode serve 创建新会话并返回会话 ID
   ↓
5. 前端接收响应并更新会话列表
   ↓
6. 连接 SSE 事件流
```

#### 2.2.2 发送消息

```
1. 用户输入消息并按 Enter
   ↓
2. 前端 POST /api/sessions/:id/message {content}
   ↓
3. Web 服务器转发到 opencode serve
   POST http://localhost:4096/session/:id/message
   ↓
4. opencode serve 处理消息并通过 SSE 推送响应
   ↓
5. 前端通过 SSE 实时显示 AI 回复
```

#### 2.2.3 删除会话

```
1. 用户点击"删除会话"
   ↓
2. 前端 DELETE /api/sessions/:id
   ↓
3. Web 服务器转发到 opencode serve
   DELETE http://localhost:4096/session/:id
   ↓
4. opencode serve 删除会话
   ↓
5. 前端更新会话列表
```

---

## 3. opencode serve API

### 3.1 会话管理

| 功能 | HTTP 方法 | 端点 | 请求体 | 响应 |
|------|----------|--------|--------|------|
| 创建会话 | POST | `/session` | `{"projectID":"global","directory":"/path"}` | `{id, slug, ...}` |
| 获取所有会话 | GET | `/session` | - | `[{id, ...}, ...]` |
| 获取会话详情 | GET | `/session/:id` | - | 会话信息 |
| 删除会话 | DELETE | `/session/:id` | - | - |

### 3.2 消息管理

| 功能 | HTTP 方法 | 端点 | 请求体 | 响应 |
|------|----------|--------|--------|------|
| 发送消息 | POST | `/session/:id/message` | `{"parts":[{"type":"text","text":"content"}]}` | 完整消息对象 |
| 获取消息历史 | GET | `/session/:id/message` | - | 消息数组 |

### 3.3 SSE 事件流

| 功能 | HTTP 方法 | 端点 | 描述 |
|------|----------|--------|------|
| SSE 事件流 | GET | `/session/:id/events` | 实时推送消息更新 |

### 3.4 消息格式

```javascript
// 发送消息的请求体
{
  "parts": [
    {
      "type": "text",
      "text": "消息内容"
    }
  ]
}

// 消息响应格式
{
  "info": {
    "id": "msg_xxx",
    "sessionID": "ses_xxx",
    "role": "assistant",
    "time": {
      "created": 1234567890,
      "completed": 1234567900
    },
    "modelID": "glm-4.7",
    "providerID": "zhipuai-coding-plan",
    "mode": "sisyphus",
    "agent": "sisyphus"
  },
  "parts": [
    {
      "id": "prt_xxx",
      "sessionID": "ses_xxx",
      "messageID": "msg_xxx",
      "type": "text",
      "text": "AI 回复内容"
    }
  ]
}
```

---

## 4. 服务器 API 设计

### 4.1 会话管理

#### 创建会话
```
POST /api/sessions
Content-Type: application/json

{
  "title": "会话标题（可选）",
  "directory": "工作目录（可选）"
}

响应 (200):
{
  "sessionId": "web-timestamp-random",
  "opencodeSessionId": "ses_xxx",
  "title": "会话标题",
  "directory": "工作目录",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}

响应 (500):
{
  "error": {
    "type": "SERVER_ERROR",
    "message": "详细错误信息"
  }
}
```

#### 获取所有会话
```
GET /api/sessions

响应 (200):
[
  {
    "sessionId": "web-timestamp-random",
    "opencodeSessionId": "ses_xxx",
    "title": "会话标题",
    "directory": "工作目录",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601",
    "active": true
  }
]

响应 (500):
{
  "error": {
    "type": "SERVER_ERROR",
    "message": "详细错误信息"
  }
}
```

#### 获取会话详情
```
GET /api/sessions/:id

响应 (200):
{
  "sessionId": "web-timestamp-random",
  "opencodeSessionId": "ses_xxx",
  "title": "会话标题",
  "directory": "工作目录",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "active": true
}

响应 (404):
{
  "error": {
    "type": "SESSION_NOT_FOUND",
    "message": "会话不存在"
  }
}
```

#### 删除会话
```
DELETE /api/sessions/:id

响应 (200):
{
  "success": true,
  "message": "会话已删除"
}

响应 (404):
{
  "error": {
    "type": "SESSION_NOT_FOUND",
    "message": "会话不存在"
  }
}
```

### 4.2 消息管理

#### 发送消息
```
POST /api/sessions/:id/message
Content-Type: application/json

{
  "content": "用户消息内容"
}

响应 (200):
{
  "info": {...},
  "parts": [...]
}

响应 (400):
{
  "error": {
    "type": "INVALID_REQUEST",
    "message": "缺少必要参数: content"
  }
}

响应 (404):
{
  "error": {
    "type": "SESSION_NOT_FOUND",
    "message": "会话不存在"
  }
}

响应 (500):
{
  "error": {
    "type": "OPENCODE_ERROR",
    "message": "详细错误信息"
  }
}
```

#### 获取消息历史
```
GET /api/sessions/:id/messages

响应 (200):
[
  {
    "info": {...},
    "parts": [...]
  }
]

响应 (404):
{
  "error": {
    "type": "SESSION_NOT_FOUND",
    "message": "会话不存在"
  }
}
```

### 4.3 SSE 事件流

```
GET /api/sessions/:id/events

响应格式: text/event-stream
事件类型:
  - message: 新消息更新
  - error: 错误信息

注意: SSE 连接由 opencode serve 维护，Web 服务器只做转发
```

---

## 5. 数据存储

### 5.1 会话数据结构

```javascript
{
  sessionId: String,          // Web 会话 ID（UUID）
  opencodeSessionId: String, // OpenCode 会话 ID（映射）
  title: String,             // 会话标题
  directory: String,          // 工作目录
  createdAt: String,          // 创建时间（ISO 8601）
  updatedAt: String,          // 更新时间（ISO 8601）
  active: Boolean             // 是否活跃（始终为 true）
}
```

### 5.2 存储策略

**当前实现**：内存存储（Map）

**特点**：
- 简单快速
- 自动清理（进程退出时）
- 重启后数据丢失

**未来扩展**：
- 持久化到文件系统（sessions.json）
- 数据库集成（PostgreSQL、MongoDB）
- Redis 缓存

---

## 6. 端口配置

### 6.1 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Web 服务器 | 3000 | Express 默认端口 |
| opencode serve | 4096 | 固定端口 |

### 6.2 环口占用检测

```javascript
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}
```

---

## 7. 错误处理

### 7.1 错误类型

| 错误类型 | HTTP 状态码 | 说明 |
|---------|-------------|------|
| SESSION_NOT_FOUND | 404 | 会话不存在 |
| INVALID_REQUEST | 400 | 请求参数无效 |
| SERVER_ERROR | 500 | 服务器内部错误 |
| OPENCODE_ERROR | 500 | opencode serve 错误 |

### 7.2 错误响应格式

```javascript
{
  "error": {
    "type": "ERROR_TYPE",
    "message": "详细错误信息"
  }
}
```

---

## 8. 安全考虑

### 8.1 输入验证

- 验证所有用户输入
- 限制消息长度（防止 XSS）
- 转义 HTML 特殊字符

### 8.2 访问控制

**当前版本**: 无认证（开发环境）

**生产环境建议**：
- 使用 HTTP Basic Auth
- 添加 JWT Token 认证
- 配置 CORS 策略

### 8.3 数据保护

- 不存储敏感信息在代码中
- 使用环境变量存储密钥
- 定期更新依赖

---

## 9. 性能优化

### 9.1 连接管理

- HTTP 连接复用（keep-alive）
- SSE 连接限制（单用户最大 5 个并发）
- 超时设置（30 秒）

### 9.2 缓存策略

- 内存缓存（Map）
- 静态文件缓存（express.static）
- HTTP 头缓存控制

### 9.3 优化建议

- 使用 gzip 压缩
- 减少 SSE 推送频率
- 懒加载消息历史

---

## 10. 部署指南

### 10.1 环境变量

```bash
# .env 文件
WEB_SERVER_PORT=3000
OPENCODE_SERVE_PORT=4096
```

### 10.2 启动流程

```bash
# 1. 启动 opencode serve
opencode serve --port 4096 --hostname localhost

# 2. 启动 Web 服务器
npm start

# 或使用 PM2
pm2 start ecosystem.config.js
```

### 10.3 健康检查

```
GET /health

响应：
{
  "status": "ok",
  "timestamp": "2026-02-01T00:00:00.000Z",
  "uptime": 123.45,
  "sessions": 5
}
```

---

## 11. 测试策略

### 11.1 单元测试

- API 端点测试
- 错误处理测试
- SSE 连接测试

### 11.2 集成测试

- opencode serve 连接测试
- 完整消息流测试
- 会话生命周期测试

### 11.3 负载测试

- 并发会话数：50+
- 消息速率：10 msg/s
- 长时间运行测试

---

## 12. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v2.0 | 2026-02-01 | 单实例多会话架构 |
| v1.0 | 2026-01-31 | 多实例单会话架构（已弃用） |

---

## 附录

### A. opencode serve 命令参考

```bash
# 启动服务器
opencode serve --port 4096 --hostname localhost

# 查看帮助
opencode serve --help

# 指定工作目录
opencode serve --port 4096 --directory /path/to/project
```

### B. 相关文档

- [部署指南](DEPLOYMENT.md)
- [开发文档](DEVELOPMENT.md)
- [OpenCode 官方文档](https://opencode.ai/docs)

### C. 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|----------|
| 无法创建会话 | opencode serve 未启动 | 检查端口 4096 是否在运行 |
| SSE 连接断开 | 网络问题或超时 | 检查网络连接和配置 |
| 消息未发送 | 权限问题或 API 错误 | 检查日志和错误响应 |
| 会话丢失 | 服务器重启 | 考虑持久化存储
