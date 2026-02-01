const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Session token 使用情况缓存
const sessionTokenUsage = new Map();

// 计算总 token 数
function calculateTotalTokens(tokens) {
    if (!tokens) return 0;
    return (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0) + (tokens.cacheRead || 0);
}

// 检查是否需要压缩（上下文使用超过 50%）
function shouldCompress(sessionID) {
    const usage = sessionTokenUsage.get(sessionID);
    if (!usage || usage.total === 0) {
        return false;
    }

    // 自动压缩阈值：如果超过 100000 tokens 就自动压缩
    return usage.total > 100000;
}

// 更新 session token 使用
function updateSessionTokens(sessionID, tokens) {
    const current = sessionTokenUsage.get(sessionID) || {
        input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0
    };

    if (tokens) {
        current.input = tokens.input || current.input;
        current.output = tokens.output || current.output;
        current.reasoning = tokens.reasoning || current.reasoning;
        current.cacheRead = tokens.cacheRead || current.cacheRead;
        current.cacheWrite = tokens.cacheWrite || current.cacheWrite;
        current.total = calculateTotalTokens(tokens);
    }

    sessionTokenUsage.set(sessionID, current);
    console.log(`[Token] Session ${sessionID.substring(0, 12)}... Tokens: Input=${current.input}, Output=${current.output}, Reasoning=${current.reasoning}, Total=${current.total}`);
}

// 从消息中计算 token 使用情况
function calculateTokenUsageFromMessages(messages) {
    let totalInput = 0;
    let totalOutput = 0;
    let totalReasoning = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    if (!Array.isArray(messages)) {
        return { total: 0, input: 0, output: 0, reasoning: 0 };
    }

    for (const message of messages) {
        let tokens = null;

        // 优先从 SSE 事件结构中提取：message.info.tokens
        if (message.info && message.info.tokens) {
            tokens = message.info.tokens;
        }
        // 备用：从 model 字段提取
        else if (message.model && message.model.tokens) {
            tokens = message.model.tokens;
        }

        if (!tokens) continue;

        if (typeof tokens === 'number') {
            // 单个数字，默认为输出 token
            totalOutput += tokens;
        } else if (typeof tokens === 'object' && tokens !== null) {
            // 对象形式，包含详细分类
            if (tokens.input) totalInput += tokens.input;
            if (tokens.output) totalOutput += tokens.output;
            if (tokens.reasoning) totalReasoning += tokens.reasoning;
            if (tokens.cache?.read) totalCacheRead += tokens.cache.read;
            if (tokens.cache?.write) totalCacheWrite += tokens.cache.write;
        }
    }

    // Token 总量 = 输入 + 输出 + 思考
    // 注意：cache.read 和 cache.write 是缓存统计，不应该计入总消耗
    const total = totalInput + totalOutput + totalReasoning;

    console.log(`[Token计算详情] 输入=${totalInput}, 输出=${totalOutput}, 思考=${totalReasoning}, 缓存读=${totalCacheRead}, 缓存写=${totalCacheWrite}, 总计=${total}`);

    return {
        total,
        input: totalInput,
        output: totalOutput,
        reasoning: totalReasoning,
        cacheRead: totalCacheRead,
        cacheWrite: totalCacheWrite
    };
}

const app = express();
const WEB_SERVER_PORT = 3000;
const DEFAULT_OPENCODE_SERVE_PORT = 4096;
const OPENCODE_BASE_URL = `http://localhost`;

const OPENCODE_STORAGE_DIR = path.join(process.env.USERPROFILE, '.local', 'share', 'opencode', 'storage', 'session');

const DIRECTORY_TO_PORT = new Map();

function buildDirectoryToPortMapping() {
    const storageDir = OPENCODE_STORAGE_DIR;

    if (!fs.existsSync(storageDir)) {
        console.log('[映射] session 目录不存在');
        return;
    }

    const projectDirs = fs.readdirSync(storageDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`[映射] 找到 ${projectDirs.length} 个 projectID`);

    for (const projectId of projectDirs) {
        const projectDir = path.join(storageDir, projectId);
        const sessionFiles = fs.readdirSync(projectDir, { withFileTypes: true })
            .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
            .map(dirent => dirent.name);

        if (sessionFiles.length === 0) continue;

        // 遍历所有会话文件，确保每个目录都被映射
        for (const sessionFile of sessionFiles) {
            const sessionFilePath = path.join(projectDir, sessionFile);
            try {
                const sessionContent = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
                const directory = sessionContent.directory;

                if (directory && !DIRECTORY_TO_PORT.has(directory)) {
                    const port = 4096 + DIRECTORY_TO_PORT.size;
                    DIRECTORY_TO_PORT.set(directory, port);
                    console.log(`[映射] "${directory}" -> 端口 ${port} (projectID: ${projectId.substring(0, 8)}...)`);
                }
            } catch (error) {
                console.error(`[映射] 读取会话文件失败: ${sessionFile}`, error.message);
            }
        }
    }

    console.log(`[映射] 总共映射 ${DIRECTORY_TO_PORT.size} 个目录到端口`);
}

buildDirectoryToPortMapping();

// ==================== Serve Manager ====================

const MAX_CONCURRENT_SERVES = 3;

/**
 * ServeManager - 自动管理 opencode serve 实例
 * 最多同时运行 3 个 serve，使用 LRU 策略淘汰
 */
class ServeManager {
    constructor() {
        // Map<directory, { process: ChildProcess, port: number, lastUsed: number }>
        this.activeServes = new Map();
    }

    /**
     * 确保指定目录的 serve 已启动
     * @param {string} directory - 项目目录
     * @returns {Promise<number>} 端口号
     */
    async ensureServe(directory) {
        console.log(`[ServeManager] ensureServe 被调用，目录: "${directory}"`);

        let port = DIRECTORY_TO_PORT.get(directory);
        if (!port) {
            console.warn(`[ServeManager] 目录 "${directory}" 没有端口映射`);
            // 动态分配一个新端口
            port = 4096 + DIRECTORY_TO_PORT.size;
            DIRECTORY_TO_PORT.set(directory, port);
            console.log(`[ServeManager] 为目录 "${directory}" 动态分配端口: ${port}`);
        }
        console.log(`[ServeManager] 目录 "${directory}" 对应端口: ${port}`);

        // 更新最后使用时间
        const existing = this.activeServes.get(directory);
        if (existing) {
            existing.lastUsed = Date.now();
            console.log(`[ServeManager] 更新使用时间: ${directory} -> 端口 ${port}`);
            return port;
        }

        // 如果已达到最大数量，停止最久未使用的 serve
        if (this.activeServes.size >= MAX_CONCURRENT_SERVES) {
            this.stopLRUServe();
        }

        // 启动新 serve
        await this.startServe(directory, port);
        return port;
    }

    /**
     * 启动指定目录的 opencode serve
     * @param {string} directory - 项目目录
     * @param {number} port - 端口号
     */
    startServe(directory, port) {
        return new Promise((resolve, reject) => {
            console.log(`[ServeManager] 启动 serve: ${directory} -> 端口 ${port}`);
            console.log(`[ServeManager] 工作目录: ${directory}`);

            // Windows 下使用 npm opencode 路径
            const opencodePath = path.join(process.env.APPDATA, 'npm', 'opencode.cmd');

            const serveProcess = spawn(opencodePath, ['serve', '--port', String(port)], {
                cwd: directory,
                shell: true,
                stdio: 'pipe',
                env: { ...process.env }
            });

            // 捕获输出用于调试
            serveProcess.stdout.on('data', (data) => {
                console.log(`[serve:${port}] ${data.toString().trim()}`);
            });

            serveProcess.stderr.on('data', (data) => {
                console.error(`[serve:${port}] ${data.toString().trim()}`);
            });

            serveProcess.on('error', (error) => {
                console.error(`[ServeManager] 启动失败: ${directory} -> ${error.message}`);
                this.activeServes.delete(directory);
                reject(error);
            });

            serveProcess.on('exit', (code, signal) => {
                console.log(`[ServeManager] serve 已退出: ${directory} -> 端口 ${port}, 代码: ${code}, 信号: ${signal}`);
                this.activeServes.delete(directory);
            });

            // 等待 5 秒，假设 serve 已经启动
            setTimeout(() => {
                if (serveProcess.killed) {
                    console.error(`[ServeManager] serve 进程已被终止: ${directory}`);
                    reject(new Error('serve 进程启动失败'));
                    return;
                }

                this.activeServes.set(directory, {
                    process: serveProcess,
                    port: port,
                    lastUsed: Date.now()
                });

                console.log(`[ServeManager] ✓ serve 已启动: ${directory} -> 端口 ${port}`);
                console.log(`[ServeManager] 当前活跃 serve 数: ${this.activeServes.size}/${MAX_CONCURRENT_SERVES}`);

                resolve();
            }, 5000);
        });
    }

    /**
     * 停止最久未使用的 serve
     */
    stopLRUServe() {
        let lruDirectory = null;
        let lruTime = Infinity;

        // 找到最久未使用的 serve
        for (const [directory, info] of this.activeServes) {
            if (info.lastUsed < lruTime) {
                lruTime = info.lastUsed;
                lruDirectory = directory;
            }
        }

        if (lruDirectory) {
            this.stopServe(lruDirectory, 'LRU 淘汰');
        }
    }

    /**
     * 停止指定目录的 serve
     * @param {string} directory - 项目目录
     * @param {string} reason - 停止原因
     */
    stopServe(directory, reason = '手动停止') {
        const info = this.activeServes.get(directory);
        if (!info) {
            console.warn(`[ServeManager] serve 未运行: ${directory}`);
            return;
        }

        console.log(`[ServeManager] 停止 serve: ${directory} -> 端口 ${info.port}, 原因: ${reason}`);

        try {
            // 优雅关闭
            info.process.kill('SIGTERM');

            // 如果 5 秒后还没退出，强制关闭
            setTimeout(() => {
                if (!info.process.killed) {
                    console.log(`[ServeManager] 强制关闭: ${directory}`);
                    info.process.kill('SIGKILL');
                }
            }, 5000);

            this.activeServes.delete(directory);
        } catch (error) {
            console.error(`[ServeManager] 停止 serve 失败: ${directory} -> ${error.message}`);
            this.activeServes.delete(directory);
        }
    }

    /**
     * 停止所有 serve
     */
    stopAllServes() {
        console.log(`[ServeManager] 停止所有 serve...`);
        for (const directory of this.activeServes.keys()) {
            this.stopServe(directory, '服务器关闭');
        }
    }

    /**
     * 获取当前活跃的 serve 列表
     */
    getStatus() {
        const list = [];
        for (const [directory, info] of this.activeServes) {
            const lastUsed = new Date(info.lastUsed).toLocaleString('zh-CN');
            list.push({
                directory,
                port: info.port,
                lastUsed
            });
        }
        return list;
    }
}

// 创建 serve 管理器实例
const serveManager = new ServeManager();

app.use(express.json());

// 添加请求日志中间件
app.use((req, res, next) => {
  if (req.path.startsWith('/api/sessions/')) {
    console.log(`[请求日志] ${req.method} ${req.path}`);
    console.log(`[请求日志] query:`, req.query);
  }
  next();
});

/**
 * 向 opencode serve 发送 HTTP 请求
 * @param {string} path - API 路径（不包含查询参数）
 * @param {string} method - HTTP 方法
 * @param {Object} data - 请求 body 数据
 * @param {Object} queryParams - 查询参数对象
 */
function openCodeRequest(path, method = 'GET', data = null, queryParams = null, port = DEFAULT_OPENCODE_SERVE_PORT) {
  return new Promise((resolve, reject) => {
    let url = `${OPENCODE_BASE_URL}:${port}${path}`;

    if (queryParams) {
      const queryString = Object.keys(queryParams)
        .filter(key => queryParams[key] !== undefined && queryParams[key] !== null)
        .map(key => {
          const value = queryParams[key];
          return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .join('&');

      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * 从存储目录读取所有 projectID 的 sessions
 */
function getAllSessionsFromStorage() {
  const allSessions = [];

  try {
    if (!fs.existsSync(OPENCODE_STORAGE_DIR)) {
      console.log('[存储] session 目录不存在:', OPENCODE_STORAGE_DIR);
      return allSessions;
    }

    const projectDirs = fs.readdirSync(OPENCODE_STORAGE_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`[存储] 找到 ${projectDirs.length} 个 projectID:`, projectDirs);

    for (const projectId of projectDirs) {
      const projectDir = path.join(OPENCODE_STORAGE_DIR, projectId);

      const sessionFiles = fs.readdirSync(projectDir, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
        .map(dirent => dirent.name);

      console.log(`[存储] projectID="${projectId}": ${sessionFiles.length} 个 session 文件`);

      for (const sessionFile of sessionFiles) {
        try {
          const sessionPath = path.join(projectDir, sessionFile);
          const sessionContent = fs.readFileSync(sessionPath, 'utf8');
          const sessionData = JSON.parse(sessionContent);

          allSessions.push(sessionData);
        } catch (error) {
          console.error(`[存储] 读取 session 文件失败: ${sessionFile}`, error.message);
        }
      }
    }

    console.log(`[存储] 总共读取 ${allSessions.length} 个 sessions`);
  } catch (error) {
    console.error('[存储] 读取 sessions 失败:', error.message);
  }

  return allSessions;
}

/**
 * 创建会话
 */
app.post('/api/sessions', async (req, res) => {
  try {
    const { title, directory } = req.body;

    console.log(`[创建会话] 标题: ${title || '新会话'}, 目录: ${directory || process.cwd()}`);

    const targetDirectory = directory || process.cwd();

    await serveManager.ensureServe(targetDirectory);
    const port = DIRECTORY_TO_PORT.get(targetDirectory) || DEFAULT_OPENCODE_SERVE_PORT;

    const createData = {
      projectID: 'global',
      directory: targetDirectory
    };

    if (title) {
      createData.title = title;
    }

    const result = await openCodeRequest('/session', 'POST', createData, null, port);

    if (result.status !== 200) {
      throw new Error(`创建 OpenCode 会话失败: ${result.status}`);
    }

    const opencodeSession = result.data;

    const webSession = {
      sessionId: opencodeSession.id,
      opencodeSessionId: opencodeSession.id,
      title: opencodeSession.title || title,
      directory: opencodeSession.directory,
      port: port,
      createdAt: new Date(opencodeSession.time.created).toISOString(),
      updatedAt: new Date(opencodeSession.time.updated).toISOString()
    };

    console.log(`[创建会话] ✓ 成功，ID: ${webSession.opencodeSessionId}, 端口: ${port}`);

    res.json(webSession);
  } catch (error) {
    console.error('[创建会话] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

app.get('/api/drives', async (req, res) => {
  try {
    const { exec } = require('child_process');

    exec('wmic logicaldisk get name', (error, stdout, stderr) => {
      if (error) {
        console.error('[获取磁盘列表] 失败:', error.message);
        return res.status(500).json({
          error: {
            type: 'SERVER_ERROR',
            message: error.message
          }
        });
      }

      const lines = stdout.split('\n')
        .map(line => line.trim())
        .filter(line => line && line !== 'Name' && /^[A-Z]:$/.test(line));

      res.json({ drives: lines });
    });
  } catch (error) {
    console.error('[获取磁盘列表] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

app.get('/api/directories', async (req, res) => {
  try {
    const { path: dirPath = process.env.USERPROFILE } = req.query;

    let absolutePath;
    if (/^[A-Z]:$/.test(dirPath)) {
      absolutePath = dirPath + '\\';
    } else {
      absolutePath = path.resolve(dirPath);
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        error: {
          type: 'NOT_FOUND',
          message: '目录不存在'
        }
      });
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      return res.status(400).json({
        error: {
          type: 'NOT_DIRECTORY',
          message: '不是目录'
        }
      });
    }

    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
    const directories = [];
    const files = [];

    entries.forEach(entry => {
      if (entry.isDirectory()) {
        directories.push({
          name: entry.name,
          type: 'directory',
          path: path.join(absolutePath, entry.name)
        });
      } else if (entry.isFile()) {
        try {
          const filePath = path.join(absolutePath, entry.name);
          const fileStats = fs.statSync(filePath);
          files.push({
            name: entry.name,
            type: 'file',
            path: path.join(absolutePath, entry.name),
            size: fileStats.size,
            modified: fileStats.mtime
          });
        } catch (error) {
        }
      }
    });

    directories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    res.json({
      path: absolutePath,
      parent: path.dirname(absolutePath),
      directories: directories,
      files: files
    });
  } catch (error) {
    console.error('[读取目录列表] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 获取所有会话
 */
app.get('/api/sessions', async (req, res) => {
  try {
    const opencodeSessions = getAllSessionsFromStorage();

    const pureSessions = opencodeSessions.filter(session => !session.parentID);
    const childSessions = opencodeSessions.filter(session => session.parentID);

    const parentToChildren = new Map();
    childSessions.forEach(child => {
      const parentId = child.parentID;
      if (parentToChildren.has(parentId)) {
        parentToChildren.get(parentId).push(child);
      } else {
        parentToChildren.set(parentId, [child]);
      }
    });

    const webSessions = pureSessions.map(parentSession => {
        const children = parentToChildren.get(parentSession.id) || [];

        const port = DIRECTORY_TO_PORT.get(parentSession.directory) || DEFAULT_OPENCODE_SERVE_PORT;

        // 获取 token 使用情况
        const parentTokenUsage = sessionTokenUsage.get(parentSession.id) || { total: 0, input: 0, output: 0, reasoning: 0 };

        return {
            sessionId: parentSession.id,
            opencodeSessionId: parentSession.id,
            title: parentSession.title,
            directory: parentSession.directory,
            port: port,
            createdAt: new Date(parentSession.time.created).toISOString(),
            updatedAt: new Date(parentSession.time.updated).toISOString(),
            active: true,
            tokenUsage: parentTokenUsage,
            children: children.map(child => {
                const childTokenUsage = sessionTokenUsage.get(child.id) || { total: 0, input: 0, output: 0, reasoning: 0 };
                return {
                    sessionId: child.id,
                    opencodeSessionId: child.id,
                    title: child.title,
                    directory: child.directory,
                    port: port,
                    createdAt: new Date(child.time.created).toISOString(),
                    updatedAt: new Date(child.time.updated).toISOString(),
                    tokenUsage: childTokenUsage
                };
            })
        };
    });

    console.log(`[获取会话] 纯净sessions: ${pureSessions.length}, 子sessions: ${childSessions.length}`);

    res.json(webSessions);
  } catch (error) {
    console.error('[获取会话列表] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 获取会话详情
 */
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const directory = req.query.directory;
    if (!directory) {
      return res.status(400).json({
        error: {
          type: 'INVALID_REQUEST',
          message: '缺少必要参数: directory'
        }
      });
    }

    const port = await serveManager.ensureServe(directory);
    const result = await openCodeRequest(`/session/${req.params.id}`, 'GET', null, null, port);

    if (result.status !== 200) {
      throw new Error(`获取会话详情失败: ${result.status}`);
    }

    const session = result.data;
    const webSession = {
      sessionId: session.id,
      opencodeSessionId: session.id,
      title: session.title,
      directory: session.directory,
      port: port,
      createdAt: new Date(session.time.created).toISOString(),
      updatedAt: new Date(session.time.updated).toISOString(),
      active: true
    };

    res.json(webSession);
  } catch (error) {
    console.error('[获取会话详情] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 删除会话
 */
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const directory = req.query.directory;
    if (!directory) {
      return res.status(400).json({
        error: {
          type: 'INVALID_REQUEST',
          message: '缺少必要参数: directory'
        }
      });
    }

    const port = await serveManager.ensureServe(directory);
    const result = await openCodeRequest(`/session/${req.params.id}`, 'DELETE', null, null, port);

    if (result.status !== 200 && result.status !== 204) {
      throw new Error(`删除会话失败: ${result.status}`);
    }

    console.log(`[删除会话] ✓ 成功，ID: ${req.params.id}`);

    res.json({
      success: true,
      message: '会话已删除'
    });
  } catch (error) {
    console.error('[删除会话] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'SERVER_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 发送消息
 */
app.post('/api/sessions/:id/message', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        error: {
          type: 'INVALID_REQUEST',
          message: '缺少必要参数: content'
        }
      });
    }

    const directory = req.query.directory;
    if (!directory) {
      return res.status(400).json({
        error: {
          type: 'INVALID_REQUEST',
          message: '缺少必要参数: directory'
        }
      });
    }

    const port = await serveManager.ensureServe(directory);

    console.log(`[发送消息] 会话: ${req.params.id}, 端口: ${port}, 内容: ${content.substring(0, 50)}...`);

    const messageData = {
      parts: [
        {
          type: 'text',
          text: content
        }
      ]
    };

    const result = await openCodeRequest(
      `/session/${req.params.id}/message`,
      'POST',
      messageData,
      null,
      port
    );

    if (result.status !== 200) {
      throw new Error(`opencode serve 返回错误: ${result.status}`);
    }

    console.log('[发送消息] ✓ 成功');

    res.json(result.data);
  } catch (error) {
    console.error('[发送消息] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'OPENCODE_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 压缩会话
 */
app.post('/api/sessions/:id/compress', async (req, res) => {
  console.log(`[API] /api/sessions/:id/compress 被调用`);
  console.log(`[API] req.query.directory:`, req.query.directory);

  try {
    const directory = req.query.directory;
    if (!directory) {
      console.log('[API] directory 参数缺失');
      return res.status(400).json({
        error: {
          type: 'INVALID_REQUEST',
          message: '缺少必要参数: directory'
        }
      });
    }

    const port = await serveManager.ensureServe(directory);

    // 直接调用 opencode serve 的 compress API
    console.log(`[API] 正在压缩会话 ${req.params.id}...`);
    const result = await openCodeRequest(`/session/${req.params.id}/summarize`, 'POST', {
      providerID: 'zhipuai-coding-plan',
      modelID: 'glm-4.7'
    }, null, port);

    if (result.status !== 200) {
      throw new Error(`压缩会话失败: ${result.status}`);
    }

    console.log(`[API] ✓ 会话 ${req.params.id} 压缩成功`);

    res.json({
      success: true,
      message: '会话已压缩'
    });
  } catch (error) {
    console.error('[压缩会话] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'OPENCODE_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * 获取消息历史（仅返回最近 20 条）
 */
app.get('/api/sessions/:id/messages', async (req, res) => {
  console.log(`[API] /api/sessions/:id/messages 被调用`);
  console.log(`[API] req.query.directory:`, req.query.directory);

  try {
    const directory = req.query.directory;
    if (!directory) {
      console.log('[API] directory 参数缺失');
      return res.status(400).json({
        error: {
          type: 'INVALID_REQUEST',
          message: '缺少必要参数: directory'
        }
      });
    }

    const port = await serveManager.ensureServe(directory);
    const result = await openCodeRequest(`/session/${req.params.id}/message`, 'GET', null, null, port);

    if (result.status !== 200) {
      throw new Error(`opencode serve 返回错误: ${result.status}`);
    }

    const allMessages = Array.isArray(result.data) ? result.data : [];
    const recentMessages = allMessages.slice(-20);

    console.log(`[API] 返回消息数量: ${recentMessages.length}/${allMessages.length}`);

    // 优化：只从最近 100 条消息中查找 token（避免遍历所有 2550 条）
    const last100Messages = allMessages.slice(-100);
    const messagesWithTokens = last100Messages.filter(m => m.info?.tokens || m.model?.tokens);
    console.log(`[Debug] 消息总数: ${allMessages.length}, 检查最近${last100Messages.length}条, 有 token 的消息数: ${messagesWithTokens.length}`);

    let sessionTokenUsage = { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0 };

    if (messagesWithTokens.length > 0) {
        const lastMessageWithTokens = messagesWithTokens[messagesWithTokens.length - 1];
        const lastTokens = lastMessageWithTokens.info?.tokens || lastMessageWithTokens.model?.tokens;
        const totalWithCache = (lastTokens.input || 0) + (lastTokens.output || 0) + (lastTokens.reasoning || 0) + (lastTokens.cache?.read || 0);
        console.log(`[Debug] 最后一条有 token 的消息 (role=${lastMessageWithTokens.info?.role}):`, {
            input: lastTokens.input,
            output: lastTokens.output,
            reasoning: lastTokens.reasoning,
            cacheRead: lastTokens.cache?.read,
            cacheWrite: lastTokens.cache?.write,
            totalWithCache
        });

        // TUI 显示：input + output + reasoning + cacheRead
        sessionTokenUsage = {
            total: totalWithCache,
            input: lastTokens.input || 0,
            output: lastTokens.output || 0,
            reasoning: lastTokens.reasoning || 0,
            cacheRead: lastTokens.cache?.read || 0
        };

        updateSessionTokens(req.params.id, sessionTokenUsage);

        // 打印当前会话的标题和token使用情况，方便核对
        const sessionTitle = recentMessages.find(m => m.role === 'user')?.summary?.title || '未知';
        console.log(`[Token统计] 会话: ${sessionTitle}`);
        console.log(`[Token统计] ID: ${req.params.id}`);
        console.log(`[Token统计] Token使用: 输入=${sessionTokenUsage.input}, 输出=${sessionTokenUsage.output}, 思考=${sessionTokenUsage.reasoning}, 缓存读=${sessionTokenUsage.cacheRead}, 总计=${sessionTokenUsage.total}`);

        // 自动压缩：如果 token 总数超过 100000，自动调用压缩
        if (sessionTokenUsage.total > 100000) {
            console.log(`[自动压缩] 会话 ${req.params.id} token 数量 ${sessionTokenUsage.total} 超过阈值，开始压缩...`);
            try {
                const compressResult = await openCodeRequest(`/session/${req.params.id}/summarize`, 'POST', {
                    providerID: 'zhipuai-coding-plan',
                    modelID: 'glm-4.7'
                }, null, port);
                if (compressResult.status === 200) {
                    console.log(`[自动压缩] ✓ 会话 ${req.params.id} 压缩成功`);
                } else {
                    console.log(`[自动压缩] ✗ 会话 ${req.params.id} 压缩失败: ${compressResult.status}`);
                }
            } catch (compressError) {
                console.error(`[自动压缩] ✗ 会话 ${req.params.id} 压缩异常:`, compressError.message);
            }
        }
    }

    // 在响应中也返回 token 使用情况，方便前端显示
    res.json({
        messages: recentMessages,
        tokenUsage: sessionTokenUsage
    });
  } catch (error) {
    console.error('[获取消息历史] 失败:', error.message);
    res.status(500).json({
      error: {
        type: 'OPENCODE_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * SSE 实时事件流
 * 注意：opencode serve 使用全局 /event 端点，通过 sessionID 属性过滤
 */
app.get('/api/sessions/:id/events', async (req, res) => {
  const directory = req.query.directory;
  if (!directory) {
    res.status(400).json({
      error: {
        type: 'INVALID_REQUEST',
        message: '缺少必要参数: directory'
      }
    });
    return;
  }

  const port = await serveManager.ensureServe(directory);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const eventUrl = `${OPENCODE_BASE_URL}:${port}/event`;

  console.log(`[SSE] 建立连接，会话: ${req.params.id}, 端口: ${port}`);

  const eventReq = http.get(eventUrl, (eventRes) => {
    eventRes.on('data', (chunk) => {
      // 转发所有事件到客户端，由客户端按 sessionID 过滤
      res.write(chunk);
    });

    eventRes.on('end', () => {
      console.log(`[SSE] 连接已关闭，会话: ${req.params.id}`);
      res.end();
    });

    eventRes.on('error', (error) => {
      console.error('[SSE] 事件流错误:', error.message);
      res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      res.end();
    });
  });

  eventReq.on('error', (error) => {
    console.error('[SSE] 连接错误:', error.message);
    res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
    res.end();
  });

  req.on('close', () => {
    console.log(`[SSE] 客户端连接已关闭，会话: ${req.params.id}`);
    eventReq.destroy();
  });
});

/**
 * 获取 serve 状态
 */
app.get('/api/serves/status', (req, res) => {
  const status = serveManager.getStatus();
  res.json({
    total: status.length,
    max: MAX_CONCURRENT_SERVES,
    serves: status
  });
});

app.use(express.static('public', {
  setHeaders: (res, path) => {
    res.set('Cache-Control', 'no-store');
  }
}));

// ==================== 服务器启动 ====================

app.listen(WEB_SERVER_PORT, () => {
  console.log('='.repeat(50));
  console.log('OpenCode Web 服务器已启动（自动管理 serve 架构）');
  console.log('='.repeat(50));
  console.log(`Web 服务器: http://localhost:${WEB_SERVER_PORT}`);
  console.log(`Serve 管理器: 最多 ${MAX_CONCURRENT_SERVES} 个并发 serve，使用 LRU 策略`);
  console.log(`已映射 ${DIRECTORY_TO_PORT.size} 个项目目录到端口 ${DEFAULT_OPENCODE_SERVE_PORT}-${DEFAULT_OPENCODE_SERVE_PORT + DIRECTORY_TO_PORT.size - 1}`);
  console.log('='.repeat(50));
  console.log('');
  console.log('💡 serve 管理器会在访问 session 时自动启动对应的 opencode serve');
  console.log(`💡 超过 ${MAX_CONCURRENT_SERVES} 个时，会自动关闭最久未使用的 serve`);
  console.log('');
  console.log('📊 可用项目目录:');
  DIRECTORY_TO_PORT.forEach((port, directory) => {
    console.log(`   端口 ${port}: ${directory}`);
  });
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n正在关闭 Web 服务器...');
  serveManager.stopAllServes();
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('\n收到 SIGTERM 信号，正在关闭 Web 服务器...');
  serveManager.stopAllServes();
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});
