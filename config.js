/**
 * OpenCode Web 配置文件
 * 可以通过环境变量覆盖这些配置
 */

const path = require('path');

module.exports = {
    // 服务器配置
    server: {
        // Web 服务器端口
        port: parseInt(process.env.WEB_SERVER_PORT) || 3000,
        // OpenCode serve 主机地址
        host: process.env.OPENCODE_HOST || 'localhost'
    },

    // OpenCode 配置
    opencode: {
        // 默认 OpenCode serve 端口
        defaultPort: parseInt(process.env.DEFAULT_OPENCODE_SERVE_PORT) || 4096,
        // OpenCode 存储目录（session 文件位置）
        storageDir: process.env.OPENCODE_STORAGE_DIR || path.join(process.env.USERPROFILE, '.local', 'share', 'opencode', 'storage', 'session'),
        // 最大并发 serve 实例数
        maxConcurrentServes: parseInt(process.env.MAX_CONCURRENT_SERVES) || 3
    },

    // 超时配置（毫秒）
    timeout: {
        // 端口检查超时
        portCheck: parseInt(process.env.PORT_CHECK_TIMEOUT) || 3000,
        // 等待端口就绪超时
        waitForPort: parseInt(process.env.WAIT_FOR_PORT_TIMEOUT) || 30000,
        // OpenCode 请求默认超时
        openCodeRequest: parseInt(process.env.OPENCODE_REQUEST_TIMEOUT) || 30000,
        // 发送消息超时（复杂任务可能需要长时间处理）
        sendMessage: parseInt(process.env.SEND_MESSAGE_TIMEOUT) || 20 * 60 * 1000,  // 默认 20 分钟
        // 压缩会话超时（OpenCode summarize API 会等待完成才返回）
        compressRequest: parseInt(process.env.COMPRESS_REQUEST_TIMEOUT) || 10 * 60 * 1000,  // 默认 10 分钟
        // 健康检查间隔
        healthCheck: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000
    },

    // 前端配置
    frontend: {
        // API 基础路径
        apiBase: process.env.API_BASE || '/api/sessions',
        // SSE 重连延迟（毫秒）
        sseReconnectDelay: parseInt(process.env.SSE_RECONNECT_DELAY) || 3000,
        // 默认工作目录
        defaultDirectory: process.env.DEFAULT_DIRECTORY || path.join(process.env.USERPROFILE)
    }
};
