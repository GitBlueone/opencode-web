# Debug 开关使用说明

## 版本
- app.js: v22.2
- 添加日期: 2026-02-01

## 功能说明

为了便于调试和问题排查，app.js 添加了 DEBUG 开关，可以控制详细调试日志的输出。

## 使用方法

### 启用调试日志

修改 `public/app.js` 第 1 行：

```javascript
// 修改前
const DEBUG = false;

// 修改后
const DEBUG = true;
```

### 禁用调试日志（默认）

```javascript
const DEBUG = false;
```

## 调试日志内容

启用 DEBUG 后，控制台会输出以下详细信息：

### 1. 加载消息历史
```
=== [loadMessages] 原始数据 ===
数据类型: object
是否为数组: true
数据长度: 5
第一条消息: {id: "msg_xxx", ...}
=== [loadMessages] 第一条消息详情 ===
msg.role: undefined
msg.info?.role: "user" | "assistant"
msg.time: undefined
msg.info?.time: {created: 1234567890}
msg.parts: [...]
完整对象: {...}
```

### 2. 渲染消息列表
```
[renderMessages] msg.info?.role="user", isUser=true
[renderMessages] msg.info?.role="assistant", isUser=false
```

### 3. SSE 事件处理

#### message.updated 事件
```
[SSE] message.updated - msgInfo: {id: "msg_xxx", role: "user", time: {...}}
[SSE] message.updated - existing message: not found
[SSE] 创建新消息: {id: "msg_xxx", info: {...}, parts: []}
```

#### 流式更新
```
[appendOrUpdateMessagePart] part.type="text", msg.id=msg_xxx, msg.info?.role="user"
```

### 4. 消息元素渲染
```
[renderMessageElement] msg.id=msg_xxx, msg.info?.role="user", roleClass="user"
```

### 5. SSE 连接状态
```
[SSE] 已连接到会话 ses_xxx
会话状态变化: session.idle {...}
```

## 版本信息日志（始终显示）

以下日志不受 DEBUG 开关控制，始终显示：

```javascript
console.log('=== APP.JS v22.2 已加载 - 增加debug开关 ===');
// ...
console.log('=== app.js v22.1 验证函数已调用 ===');
console.log('=== app.js 执行完成，调用 testAppJS:', typeof window.testAppJS);
```

## 注意事项

1. **生产环境**：确保 `DEBUG = false`，避免大量日志影响性能
2. **调试问题**：设置 `DEBUG = true`，刷新浏览器后查看控制台输出
3. **浏览器缓存**：修改 DEBUG 后，建议使用 Ctrl+Shift+R 强制刷新
4. **敏感信息**：日志可能包含消息内容，调试完成后及时关闭

## 常见问题排查

### 问题：用户消息和 AI 消息都显示在左侧

**启用 DEBUG 并观察**：
```
[renderMessages] msg.info?.role="undefined", isUser=false
```

**原因**：`msg.info?.role` 为 undefined

**解决方案**：检查 OpenCode API 返回的数据结构

### 问题：新消息没有气泡样式

**启用 DEBUG 并观察**：
```
[renderMessageElement] msg.id=msg_xxx, msg.info?.role="user", roleClass=""
```

**原因**：`roleClass` 为空字符串

**解决方案**：检查 `message.info?.role` 的值

### 问题：流式更新不显示内容

**启用 DEBUG 并观察**：
```
[appendOrUpdateMessagePart] part.type="text", msg.id=msg_xxx, msg.info?.role=null
```

**原因**：`message.info?.role` 为 null

**解决方案**：等待 `message.updated` 事件更新 role

## 相关文件

- `public/app.js` - 主要逻辑文件
- `public/index.html` - 页面结构
- `server.js` - Express 代理服务器
- `OPENCODE_SSE_EVENTS.md` - SSE 事件数据结构文档

## 技术细节

### debugLog 函数实现

```javascript
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}
```

### 使用方式

```javascript
// 原来的代码
console.log('调试信息', data);

// 修改后
debugLog('调试信息', data);
```

### 优势

1. **性能优化**：生产环境零性能开销
2. **易维护**：统一管理所有调试日志
3. **可控制**：通过一个开关控制所有日志
4. **代码清晰**：debugLog 名称明确标识调试用途
