# OpenCode Web - 前端知识库

**生成时间**: 2026-02-01
**域**: 前端（Vanilla JavaScript）

## 概览

OpenCode Web 前端 - 会话管理界面，纯 JavaScript 实现，SSE 实时通信。

## 文件结构

```
public/
├── index.html      # 主页面 HTML 结构
├── app.js          # 前端逻辑（979 行）
├── style.css       # 样式文件
├── test.html       # 测试页面
└── test-sse.html   # SSE 测试页面
```

## 代码地图

| Symbol | 类型 | 位置 | 角色 |
|--------|------|------|------|
| `currentOpenCodePort` | Variable | app.js | 当前 OpenCode 端口 |
| `selectedSessionId` | Variable | app.js | 当前选中的会话 ID |
| `sessions` | Array | app.js | 会话列表缓存 |
| `messages` | Array | app.js | 消息列表缓存 |
| `eventSource` | EventSource | app.js | SSE 连接实例 |
| `loadSessions()` | Function | app.js | 加载会话列表 |
| `loadMessages()` | Function | app.js | 加载消息历史 |
| `connectSSE()` | Function | app.js | 连接 SSE 实时流 |
| `renderSessionsList()` | Function | app.js | 渲染会话列表 |
| `renderMessages()` | Function | app.js | 渲染消息内容 |
| `sendMessage()` | Function | app.js | 发送用户消息 |
| `createSession()` | Function | app.js | 创建新会话 |
| `deleteCurrentSession()` | Function | app.js | 删除当前会话 |
| `changeOpenCodePort()` | Function | app.js | 切换 OpenCode 端口 |

## 约定

### 全局状态
- `currentOpenCodePort`: 默认 4096，通过 `window.changeOpenCodePort()` 切换
- `selectedSessionId`: 当前选中的会话，为 null 表示未选中
- `sessions`: 会话列表数组，包含 tokenUsage 信息
- `messages`: 当前会话的消息数组

### SSE 事件处理
- `message.part.updated`: 更新消息片段内容
- `message.updated`: 更新消息元数据（role, time）
- `session.idle`: 会话空闲状态
- `session.error`: 会话错误状态
- SSE 断线后自动重连（3秒延迟）

### 消息类型渲染
- `text`: 普通文本
- `reasoning`: 思考过程（可折叠）
- `tool`: 工具调用（带状态和输出）
- `file`: 文件附件
- `step-start`/`step-finish`: 过滤不显示

### 目录管理
- 默认根目录: `C:\Users\13927`
- 目录展开状态: `expandedDirectories` Set
- 文件大小格式化: B/KB/MB/GB

### Token 显示
- >100K: 红色警告
- >50K: 橙色
- >20K: 黄色
- ≤20K: 绿色
- 格式: `总计: X (输入: X, 输出: X, 思考: X)`

## 反模式

### 禁止操作
- 直接修改 `currentOpenCodePort` 全局变量（通过 `window.changeOpenCodePort()` 修改）
- SSE 连接未关闭前创建新连接（先 `eventSource.close()`）
- 在 SSE 事件处理中阻塞主线程

### 注意事项
- 页面隐藏时自动关闭 SSE 连接，显示时重新连接
- 所有 API 调用需附加 `directory` 参数
- 消息内容必须 `escapeHtml()` 防止 XSS
- 输入框高度自适应（最大 150px）

## API 调用约定

所有 fetch 请求需附加 `directory` 参数：
```javascript
// 获取消息
GET /api/sessions/:id/messages?directory=encodeURIComponent(session.directory)

// 发送消息
POST /api/sessions/:id/message?directory=encodeURIComponent(session.directory)

// 删除会话
DELETE /api/sessions/:id?directory=encodeURIComponent(session.directory)

// 压缩会话
POST /api/sessions/:id/compress?directory=encodeURIComponent(session.directory)
```

## 元素 ID 映射

| 元素 | ID | 用途 |
|------|-----|------|
| 侧边栏 | `sidebar` | 会话列表容器 |
| 会话列表 | `sessions-list` | 会话列表内容 |
| 消息容器 | `messages-content` | 消息显示区域 |
| 消息输入 | `message-input` | 用户输入框 |
| 发送按钮 | `send-message-btn` | 发送消息 |
| 欢迎状态 | `welcome-state` | 无选中会话时显示 |
| 会话详情 | `session-detail` | 选中会话后显示 |
| 创建模态框 | `create-modal` | 创建会话弹窗 |
| Toast 容器 | `toast-container` | 消息提示 |

## 相关文档

- 根目录 `AGENTS.md` - 后端 API 和架构
- `OPENCODE_SSE_EVENTS.md` - SSE 事件数据结构参考
