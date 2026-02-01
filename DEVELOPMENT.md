# OpenCode Web 开发文档

## 1. 项目结构

```
opencode-web/
├── server.js              # Express 服务器（主入口）
├── ARCHITECTURE.md        # 架构设计文档
├── DEPLOYMENT.md          # 部署文档
├── DEVELOPMENT.md         # 本文件 - 开发文档
├── package.json           # 项目依赖
├── package-lock.json      # 依赖锁定文件
├── archive/              # 归档的旧版本文件
│   ├── ARCHIVE_MANIFEST.json
│   └── ...
├── node_modules/          # Node.js 依赖（自动生成）
├── public/              # 静态文件目录
│   └── index.html      # 前端入口
├── .env                 # 环境变量（本地开发）
└── .gitignore           # Git 忽略文件
```

---

## 2. 开发环境设置

### 2.1 初始化开发环境

```bash
# 克隆项目
git clone https://github.com/your-repo/opencode-web.git
cd opencode-web

# 安装依赖
npm install

# 创建 .env 文件
cp .env.example .env

# 编辑 .env 文件（根据需要）
```

### 2.2 .env 文件示例

```bash
# Web 服务器配置
WEB_SERVER_PORT=3000
NODE_ENV=development

# OpenCode 端口范围
OPENCODE_START_PORT=4096
OPENCODE_MAX_PORT=4195

# 日志配置
LOG_LEVEL=debug
```

### 2.3 验证环境

```bash
# 检查 Node.js
node --version

# 检查 opencode
opencode --version

# 检查 npm 依赖
npm list --depth=0
```

---

## 3. 快速开始

### 3.1 启动开发服务器

```bash
# 方式 1：直接启动
node server.js

# 方式 2：使用 npm script
npm start

# 方式 3：使用 nodemon（自动重启）
npm install -g nodemon
nodemon server.js
```

### 3.2 访问服务

```bash
# Web 服务器
open http://localhost:3000

# 查看 OpenAPI 规范
open http://localhost:4096/doc
```

---

## 4. API 测试

### 4.1 使用 curl 测试

```bash
# 创建会话
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "测试会话"}'

# 获取所有会话
curl http://localhost:3000/api/sessions

# 发送消息
curl -X POST http://localhost:3000/api/sessions/{sessionId}/message \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Hello"}'

# 获取消息历史
curl http://localhost:3000/api/sessions/{sessionId}/messages
```

### 4.2 使用 Postman 测试

1. 导入 API 端点到 Postman
2. 创建环境变量：
   - `base_url`: `http://localhost:3000`
   - `session_id`: `{会话 ID}`
3. 创建集合并保存请求

### 4.3 使用 API 测试工具

```bash
# 安装 HTTPie
pip install httpie

# 测试 API
http POST localhost:3000/api/sessions title="测试会话"

http GET localhost:3000/api/sessions
```

---

## 5. 代码规范

### 5.1 JavaScript 风格

```javascript
// 使用 const 和 let（不要使用 var）
const PORT = 3000;
let nextPort = 4096;

// 使用箭头函数
app.get('/api/sessions', (req, res) => {
  res.json(sessions);
});

// 使用 async/await（不要使用回调地狱）
async function createSession() {
  const session = await openCodeRequest(...);
  return session;
}

// 错误处理
try {
  await doSomething();
} catch (error) {
  console.error('错误:', error.message);
  throw error;
}
```

### 5.2 命名约定

```javascript
// 变量：camelCase
const sessionId = 'web-123';
const openCodeSessionId = 'ses-456';

// 函数：camelCase
function allocatePort() {}
function startOpenCodeServe(port) {}

// 常量：UPPER_SNAKE_CASE
const WEB_SERVER_PORT = 3000;
const START_PORT = 4096;

// 类：PascalCase
class SessionManager {}
```

### 5.3 注释规范

```javascript
/**
 * 启动 opencode serve 实例
 * @param {number} port - 端口号
 * @returns {Promise<ChildProcess>} 进程对象
 */
function startOpenCodeServe(port) {
  // 单行注释
  return new Promise((resolve, reject) => {
    // 多行注释
    // 第二行
  });
}
```

---

## 6. 开发工作流

### 6.1 功能开发流程

```bash
# 1. 创建新分支
git checkout -b feature/new-feature

# 2. 修改代码
vim server.js

# 3. 测试代码
npm test

# 4. 提交代码
git add server.js
git commit -m "feat: 添加新功能"

# 5. 推送到远程
git push origin feature/new-feature

# 6. 创建 Pull Request
```

### 6.2 调试技巧

#### 使用 console.log

```javascript
console.log('创建会话:', sessionId);
console.error('发送消息失败:', error.message);
```

#### 使用 Node.js 调试器

```bash
# 启动调试模式
node inspect server.js

# 使用 Chrome DevTools 调试
# 访问 chrome://inspect
```

#### 使用 VS Code 调试

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "启动服务器",
      "program": "${workspaceFolder}/server.js"
    }
  ]
}
```

---

## 7. 测试

### 7.1 单元测试（TODO）

```bash
# 安装测试框架
npm install --save-dev jest

# 创建测试文件
touch __tests__/server.test.js

# 运行测试
npm test
```

### 7.2 集成测试（TODO）

```bash
# 安装 Supertest
npm install --save-dev supertest

# 创建集成测试
touch __tests__/integration.test.js

# 运行测试
npm run test:integration
```

### 7.3 API 测试脚本

创建 `test-api.js`：

```javascript
const http = require('http');

async function testAPI() {
  const testData = {
    title: '测试会话'
  };

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/sessions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('响应:', body);
    });
  });

  req.write(JSON.stringify(testData));
  req.end();
}

testAPI();
```

运行测试：

```bash
node test-api.js
```

---

## 8. 性能分析

### 8.1 使用 Node.js 性能分析

```bash
# 生成性能分析文件
node --prof server.js

# 停止服务器后，处理分析
node --prof-process isolate-*.log > profile.txt
```

### 8.2 使用 Chrome DevTools

1. 访问 `chrome://inspect`
2. 点击 "Profiling"
3. 启动 CPU Profile
4. 执行一些操作
5. 停止 Profile 并分析

---

## 9. 日志和监控

### 9.1 日志级别

```javascript
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

function log(level, message) {
  if (level <= LOG_LEVELS[process.env.LOG_LEVEL || 'INFO']) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}
```

### 9.2 监控指标

添加监控端点：

```javascript
app.get('/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    sessions: sessions.size,
    cpu: process.cpuUsage()
  });
});
```

---

## 10. 常见开发任务

### 10.1 添加新的 API 端点

```javascript
// 1. 定义路由
app.post('/api/custom-endpoint', (req, res) => {
  try {
    const { param } = req.body;

    // 处理逻辑
    const result = processParam(param);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});
```

### 10.2 添加中间件

```javascript
// 添加日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// 添加错误处理中间件
app.use((error, req, res, next) => {
  console.error('错误:', error.message);
  res.status(500).json({
    error: {
      type: 'INTERNAL_ERROR',
      message: error.message
    }
  });
});
```

### 10.3 修改 OpenCode API 调用

```javascript
// 1. 修改 openCodeRequest 函数
async function openCodeRequest(port, path, method = 'GET', data = null) {
  // 添加自定义逻辑
  const url = `http://localhost:${port}${path}`;

  // 修改请求选项
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // 添加认证
    },
    timeout: 30000 // 添加超时
  };

  // 发送请求
  // ...
}
```

---

## 11. 部署到不同环境

### 11.1 开发环境

```bash
# 设置开发变量
export NODE_ENV=development
export LOG_LEVEL=debug

# 启动服务器
node server.js
```

### 11.2 测试环境

```bash
# 使用 PM2
NODE_ENV=test pm2 start server.js --name opencode-web-test

# 或使用 Docker
docker-compose up -d
```

### 11.3 生产环境

```bash
# 使用 PM2
NODE_ENV=production pm2 start ecosystem.config.js

# 或使用 Systemd
sudo systemctl start opencode-web
```

---

## 12. 代码审查清单

在提交代码之前，检查：

- [ ] 代码遵循项目风格指南
- [ ] 添加了必要的注释
- [ ] 处理了所有错误情况
- [ ] 测试了新功能
- [ ] 更新了文档（如果需要）
- [ ] 运行了 `npm test`
- [ ] 没有引入安全漏洞
- [ ] 日志输出适当

---

## 13. 故障排查

### 13.1 常见错误

| 错误 | 原因 | 解决方案 |
|------|--------|----------|
| `EADDRINUSE` | 端口被占用 | 杀死占用端口的进程 |
| `ENOENT` | 文件不存在 | 检查文件路径 |
| `ECONNREFUSED` | 连接被拒绝 | 检查 opencode serve 是否在运行 |
| `ETIMEDOUT` | 请求超时 | 增加超时时间 |

### 13.2 调试技巧

```bash
# 查看端口占用
netstat -ano | findstr :3000

# 查看进程信息
tasklist | findstr node

# 查看服务器日志
tail -f server.log

# 查看 PM2 日志
pm2 logs opencode-web
```

---

## 14. 扩展项目

### 14.1 添加持久化存储

```javascript
// 使用 Redis
const Redis = require('ioredis');
const redis = new Redis();

// 保存会话
await redis.hset('sessions', sessionId, JSON.stringify(session));

// 获取会话
const session = await redis.hget('sessions', sessionId);
```

### 14.2 添加数据库支持

```javascript
// 使用 MongoDB
const mongoose = require('mongoose');
const Session = mongoose.model('Session', {
  sessionId: String,
  opencodeSessionId: String,
  port: Number,
  title: String
});

// 保存会话
await new Session(sessionData).save();

// 获取会话
const sessions = await Session.find();
```

### 14.3 添加认证

```javascript
// 使用 JWT
const jwt = require('jsonwebtoken');

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

---

## 15. 参考资源

- [Express.js 文档](https://expressjs.com)
- [Node.js 文档](https://nodejs.org)
- [OpenCode 文档](https://opencode.ai/docs)
- [MDN Web API](https://developer.mozilla.org)
- [npm 包仓库](https://www.npmjs.com)
