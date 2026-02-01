# OpenCode SSE 事件完整数据结构

> **来源**: OpenCode SDK 源码 (commit: bc179eb18481a5dc07ca522d9a169d817fc36159)
> **最后更新**: 2026-02-01
> **用途**: 供开发参考，避免反复查找官方文档

---

## 目录

1. [SSE 事件通用结构](#1-sse-事件通用结构)
2. [消息相关事件](#2-消息相关事件)
3. [会话相关事件](#3-会话相关事件)
4. [其他事件类型](#4-其他事件类型)
5. [数据对象详解](#5-数据对象详解)
6. [关键要点](#6-关键要点)
7. [完整数据流示例](#7-完整数据流示例)

---

## 1. SSE 事件通用结构

所有 SSE 事件都遵循以下基本结构：

```typescript
{
  type: string;           // 事件类型标识
  properties: object;     // 事件属性（根据类型不同而变化）
}
```

### 支持的事件类型

| 事件类型 | 说明 |
|---------|------|
| `message.updated` | 消息更新（包含完整的消息元数据） |
| `message.part.updated` | 消息部分更新（流式传输） |
| `message.part.removed` | 消息部分移除 |
| `message.removed` | 消息移除 |
| `session.updated` | 会话更新 |
| `session.deleted` | 会话删除 |
| `session.idle` | 会话空闲 |
| `session.error` | 会话错误 |
| `file.watcher.updated` | 文件监视器更新 |
| `file.edited` | 文件编辑 |
| `storage.write` | 存储写入 |
| `lsp.client.diagnostics` | LSP 诊断信息 |
| `permission.updated` | 权限更新 |
| `ide.installed` | IDE 安装 |

---

## 2. 消息相关事件

### 2.1 message.part.updated

**用途**: 流式传输消息内容更新

**数据结构**:
```typescript
{
  type: 'message.part.updated',
  properties: {
    part: {
      // 通用字段
      id: string;
      messageID: string;        // 所属消息 ID
      sessionID: string;        // 所属会话 ID
      type: PartType;           // Part 类型（见下文）

      // text 类型特有
      text?: string;
      synthetic?: boolean;
      time?: { start: number; end?: number };

      // file 类型特有
      mime?: string;
      url?: string;
      filename?: string;
      source?: FileSource | SymbolSource;

      // tool 类型特有
      callID?: string;
      tool?: string;
      state?: ToolState;
      input?: object;
      output?: string;
      title?: string;
      time?: { start: number; end?: number };

      // snapshot 类型特有
      snapshot?: string;

      // patch 类型特有
      hash?: string;
      files?: string[];
    }
  }
}
```

**关键路径**:
- 获取 sessionID: `properties.part.sessionID`
- 获取 messageID: `properties.part.messageID`
- 获取类型: `properties.part.type`

---

### 2.2 message.updated

**用途**: 完整消息更新（提供元数据）

**数据结构**:
```typescript
{
  type: 'message.updated',
  properties: {
    info: {
      // 通用字段
      id: string;
      role: 'user' | 'assistant';    // 消息角色
      sessionID: string;
      time: {
        created: number;            // 创建时间戳（Unix）
        completed?: number;          // 完成时间戳（仅 assistant）
      };

      // UserMessage 特有
      // 无额外字段

      // AssistantMessage 特有
      cost?: number;
      mode?: string;
      modelID?: string;
      providerID?: string;
      system?: string[];
      path?: {
        cwd: string;      // 当前工作目录
        root: string;     // 项目根目录
      };
      tokens?: {
        input: number;
        output: number;
        reasoning: number;
        cache: {
          read: number;
          write: number;
        };
      };
      error?: ErrorObject;
      summary?: boolean;
    }
  }
}
```

**关键路径**:
- 获取 sessionID: `properties.info.sessionID`
- 获取 role: `properties.info.role` (值: `'user'` 或 `'assistant'`)
- 获取 time: `properties.info.time`
- 获取创建时间: `properties.info.time.created`

---

### 2.3 message.part.removed

**用途**: 消息部分被移除

**数据结构**:
```typescript
{
  type: 'message.part.removed',
  properties: {
    partID: string;
    messageID: string;
    sessionID: string;
  }
}
```

---

### 2.4 message.removed

**用途**: 完整消息被移除

**数据结构**:
```typescript
{
  type: 'message.removed',
  properties: {
    info: {
      id: string;
      sessionID: string;
    }
  }
}
```

---

## 3. 会话相关事件

### 3.1 session.updated

**用途**: 会话信息更新（标题、版本等）

**数据结构**:
```typescript
{
  type: 'session.updated',
  properties: {
    info: {
      id: string;
      title: string;
      version: string;
      time: {
        created: number;     // 创建时间戳（Unix）
        updated: number;     // 更新时间戳（Unix）
      };
      parentID?: string;
      revert?: {
        messageID: string;
        diff?: string;
        partID?: string;
        snapshot?: string;
      };
      share?: {
        url: string;
      };
    }
  }
}
```

---

### 3.2 session.deleted

**用途**: 会话被删除

**数据结构**:
```typescript
{
  type: 'session.deleted',
  properties: {
    info: {
      id: string;
      title: string;
      version: string;
      time: { ... },
      // ... 完整 Session 对象
    }
  }
}
```

---

### 3.3 session.idle

**用途**: 会话进入空闲状态

**数据结构**:
```typescript
{
  type: 'session.idle',
  properties: {
    sessionID: string;
  }
}
```

---

### 3.4 session.error

**用途**: 会话发生错误

**数据结构**:
```typescript
{
  type: 'session.error',
  properties: {
    sessionID?: string;
    error?: {
      name: ErrorName;
      data: unknown;
    }
  }
}
```

**错误类型 (ErrorName)**:
- `ProviderAuthError` - 提供商认证失败
- `UnknownError` - 未知错误
- `MessageOutputLengthError` - 消息输出长度超限
- `MessageAbortedError` - 消息中止

---

## 4. 其他事件类型

### 4.1 file.edited

**用途**: 文件被编辑

**数据结构**:
```typescript
{
  type: 'file.edited',
  properties: {
    fileID: string;
    sessionID: string;
  }
}
```

---

### 4.2 storage.write

**用途**: 存储写入操作

**数据结构**:
```typescript
{
  type: 'storage.write',
  properties: {
    key: string;
    value: string;
  }
}
```

---

### 4.3 permission.updated

**用途**: 权限更新

**数据结构**:
```typescript
{
  type: 'permission.updated',
  properties: {
    sessionID: string;
    permission: object;
  }
}
```

---

### 4.4 lsp.client.diagnostics

**用途**: LSP 诊断信息更新

**数据结构**:
```typescript
{
  type: 'lsp.client.diagnostics',
  properties: {
    diagnostics: LSPDiagnostic[];
  }
}
```

---

### 4.5 file.watcher.updated

**用途**: 文件监视器更新

**数据结构**:
```typescript
{
  type: 'file.watcher.updated',
  properties: {
    fileID: string;
    sessionID: string;
    event: 'created' | 'updated' | 'deleted';
  }
}
```

---

## 5. 数据对象详解

### 5.1 Part 对象类型

**PartType**: `'text' | 'file' | 'tool' | 'step-start' | 'step-finish' | 'snapshot' | 'patch'`

#### 5.1.1 TextPart

**用途**: 文本内容

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'text';
  text: string;
  synthetic?: boolean;        // 是否为合成内容
  time?: {
    start: number;            // 开始时间戳
    end?: number;              // 结束时间戳
  };
}
```

---

#### 5.1.2 FilePart

**用途**: 文件引用

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'file';
  mime: string;                // MIME 类型
  url: string;                 // 文件 URL
  filename?: string;
  source?: FileSource | SymbolSource;
}

// 文件来源
interface FileSource {
  path: string;
  text: {
    end: number;
    start: number;
    value: string;
  };
  type: 'file';
}

// 符号来源
interface SymbolSource {
  kind: number;
  name: string;
  path: string;
  range: {
    end: { character: number; line: number };
    start: { character: number; line: number };
  };
  text: { end: number; start: number; value: string };
  type: 'symbol';
}
```

---

#### 5.1.3 ToolPart

**用途**: 工具调用

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'tool';
  callID: string;
  tool: string;
  state: ToolState;
}

// 工具状态类型
type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

// 等待中
interface ToolStatePending {
  status: 'pending';
}

// 运行中
interface ToolStateRunning {
  status: 'running';
  time: { start: number };
  input?: unknown;
  metadata?: { [key: string]: unknown };
  title?: string;
}

// 已完成
interface ToolStateCompleted {
  status: 'completed';
  time: { start: number; end: number };
  input: { [key: string]: unknown };
  metadata: { [key: string]: unknown };
  output: string;
  title: string;
}

// 错误
interface ToolStateError {
  status: 'error';
  time: { start: number; end: number };
  input: { [key: string]: unknown };
  error: string;
}
```

---

#### 5.1.4 StepStartPart

**用途**: 步骤开始（内部调试标记，应过滤）

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'step-start';
}
```

**注意**: 这是内部调试类型，不应显示在 UI 中。

---

#### 5.1.5 StepFinishPart

**用途**: 步骤完成（内部调试标记，应过滤）

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'step-finish';
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}
```

**注意**: 这是内部调试类型，不应显示在 UI 中。

---

#### 5.1.6 SnapshotPart

**用途**: 代码快照

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'snapshot';
  snapshot: string;           // 快照内容
}
```

---

#### 5.1.7 PatchPart

**用途**: 补丁信息

```typescript
{
  id: string;
  messageID: string;
  sessionID: string;
  type: 'patch';
  hash: string;               // 补丁哈希
  files: Array<string>;       // 受影响的文件列表
}
```

---

### 5.2 Message 对象

**MessageType**: `UserMessage | AssistantMessage`

#### UserMessage

```typescript
{
  id: string;
  role: 'user';
  sessionID: string;
  time: {
    created: number;          // 创建时间戳（Unix）
  };
}
```

---

#### AssistantMessage

```typescript
{
  id: string;
  role: 'assistant';
  sessionID: string;
  time: {
    created: number;          // 创建时间戳（Unix）
    completed?: number;        // 完成时间戳（Unix）
  };
  cost: number;
  mode: string;
  modelID: string;
  providerID: string;
  system: Array<string>;
  path: {
    cwd: string;
    root: string;
  };
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  error?: ErrorObject;
  summary?: boolean;
}
```

---

### 5.3 Session 对象

```typescript
{
  id: string;
  title: string;
  version: string;
  time: {
    created: number;           // 创建时间戳（Unix）
    updated: number;           // 更新时间戳（Unix）
  };
  parentID?: string;
  revert?: {
    messageID: string;
    diff?: string;
    partID?: string;
    snapshot?: string;
  };
  share?: {
    url: string;
  };
}
```

---

### 5.4 共享错误类型

#### ProviderAuthError

```typescript
{
  name: 'ProviderAuthError';
  data: {
    message: string;
    providerID: string;
  };
}
```

---

#### UnknownError

```typescript
{
  name: 'UnknownError';
  data: {
    message: string;
  };
}
```

---

#### MessageAbortedError

```typescript
{
  name: 'MessageAbortedError';
  data: unknown;
}
```

---

#### MessageOutputLengthError

```typescript
{
  name: 'MessageOutputLengthError';
  data: unknown;
}
```

---

## 6. 关键要点

### 6.1 SessionID 获取路径

| 事件类型 | SessionID 路径 |
|---------|---------------|
| `message.part.updated` | `properties.part.sessionID` |
| `message.updated` | `properties.info.sessionID` |
| `message.part.removed` | `properties.sessionID` |
| `message.removed` | `properties.info.sessionID` |
| `session.idle` | `properties.sessionID` |
| `session.error` | `properties.sessionID` (可选) |

---

### 6.2 Role 获取路径

| 事件类型 | Role 路径 | 说明 |
|---------|----------|------|
| `message.updated` | `properties.info.role` | 值: `'user'` 或 `'assistant'` |
| 其他事件 | 无 | 只有 `message.updated` 提供角色 |

---

### 6.3 Time 获取路径

| 事件类型 | Time 路径 |
|---------|----------|
| `message.updated` | `properties.info.time` |
| `session.updated` | `properties.info.time` |
| `message.part.updated` (TextPart) | `properties.part.time` |

---

### 6.4 内部 Part 类型（需要过滤）

以下 Part 类型是内部调试标记，应该在 UI 中过滤掉：

| Part 类型 | 说明 |
|----------|------|
| `step-start` | 步骤开始标记 |
| `step-finish` | 步骤完成标记 |

**过滤示例**:
```javascript
const parts = message.parts.filter(part => {
  return !['step-start', 'step-finish'].includes(part.type);
});
```

---

### 6.5 消息更新流程

当 AI 消息流式传输时，事件顺序如下：

1. **message.part.updated** - 流式更新消息部分
   - 创建或更新 Part 对象
   - 此时不知道 Message 的 role（为 null）

2. **message.updated** - 消息完成
   - 提供完整的 Message 元数据
   - 包含 role、time、cost 等信息
   - 如果之前创建了 role: null 的消息，此时更新 role

---

### 6.6 事件处理最佳实践

```javascript
// 示例：处理 SSE 事件
function handleSSEEvent(event) {
  const { type, properties } = event;

  switch (type) {
    case 'message.part.updated': {
      const { part } = properties;
      const sessionID = part.sessionID;
      const messageID = part.messageID;

      // 过滤内部类型
      if (['step-start', 'step-finish'].includes(part.type)) {
        return;
      }

      // 处理 Part 更新
      updateMessagePart(sessionID, messageID, part);
      break;
    }

    case 'message.updated': {
      const { info } = properties;
      const sessionID = info.sessionID;
      const messageID = info.id;
      const role = info.role;

      // 更新或创建消息
      updateMessage(sessionID, messageID, info);
      break;
    }

    case 'session.idle': {
      const sessionID = properties.sessionID;
      // 处理会话空闲
      break;
    }

    default:
      console.log('未处理的事件类型:', type);
  }
}
```

---

## 7. 完整数据流示例

### 场景：AI 消息流式传输

#### 步骤 1: 用户发送消息

```http
POST /session/ses_xxx/message
Content-Type: application/json

{
  "parts": [{
    "type": "text",
    "text": "你好，请介绍一下自己"
  }]
}
```

---

#### 步骤 2: 用户消息创建 (message.updated)

```json
{
  "type": "message.updated",
  "properties": {
    "info": {
      "id": "msg_user_001",
      "role": "user",
      "sessionID": "ses_xxx",
      "time": {
        "created": 1738383993000
      }
    }
  }
}
```

---

#### 步骤 3: AI 开始响应 - 流式更新 (message.part.updated)

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part_001",
      "messageID": "msg_ai_001",
      "sessionID": "ses_xxx",
      "type": "text",
      "text": "你好！",
      "time": {
        "start": 1738383994000
      }
    }
  }
}
```

---

#### 步骤 4: AI 继续流式输出 (message.part.updated)

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "part_001",
      "messageID": "msg_ai_001",
      "sessionID": "ses_xxx",
      "type": "text",
      "text": "你好！我是 OpenCode AI 助手。",
      "time": {
        "start": 1738383994000,
        "end": 1738383995000
      }
    }
  }
}
```

---

#### 步骤 5: AI 消息完成 (message.updated)

```json
{
  "type": "message.updated",
  "properties": {
    "info": {
      "id": "msg_ai_001",
      "role": "assistant",
      "sessionID": "ses_xxx",
      "time": {
        "created": 1738383994000,
        "completed": 1738383996000
      },
      "cost": 0.001234,
      "modelID": "glm-4.7",
      "providerID": "zhipuai-coding-plan",
      "mode": "sisyphus",
      "tokens": {
        "input": 100,
        "output": 50,
        "reasoning": 0,
        "cache": {
          "read": 10,
          "write": 5
        }
      },
      "system": ["你是一个有用的AI助手。"],
      "path": {
        "cwd": "/path/to/project",
        "root": "/path/to/root"
      }
    }
  }
}
```

---

## 参考资源

- **OpenCode SDK 源码**: https://github.com/anomalyco/opencode-sdk-js
- **事件类型定义**: `src/resources/event.ts`
- **Session API 定义**: `src/resources/session.ts`
- **流式传输处理**: `src/resources/streaming.ts`

---

## 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-02-01 | 1.0 | 初始版本，基于 OpenCode SDK commit bc179eb |

---

**文档维护者**: OpenCode Web 项目组
**最后审核**: 2026-02-01
