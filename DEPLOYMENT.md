# OpenCode Web 部署文档

## 1. 环境要求

### 1.1 基础环境

- **操作系统**: Windows, macOS, 或 Linux
- **Node.js**: 18.x 或更高版本
- **npm**: 9.x 或更高版本

### 1.2 依赖项

- **opencode CLI**: 必须已安装并可用
  ```bash
  npm install -g opencode-ai/cli
  ```

### 1.3 端口要求

- **Web 服务器端口**: 3000（默认）
- **OpenCode 端口范围**: 4096-4195（最多 100 个并发会话）

---

## 2. 安装步骤

### 2.1 克隆或下载项目

```bash
# 克隆仓库（如果有）
git clone https://github.com/your-repo/opencode-web.git
cd opencode-web

# 或下载并解压
```

### 2.2 安装依赖

```bash
npm install
```

### 2.3 验证安装

```bash
# 检查 Node.js 版本
node --version  # 应该 >= 18.x

# 检查 opencode 版本
opencode --version

# 检查 npm 依赖
npm list
```

---

## 3. 配置

### 3.1 环境变量（可选）

创建 `.env` 文件：

```bash
# Web 服务器配置
WEB_SERVER_PORT=3000

# OpenCode 端口范围
OPENCODE_START_PORT=4096
OPENCODE_MAX_PORT=4195

# OpenCode 认证（推荐）
OPENCODE_SERVER_PASSWORD=your-secure-password

# 日志级别
LOG_LEVEL=info
```

### 3.2 修改默认配置

编辑 `server.js`：

```javascript
// 修改 Web 服务器端口
const WEB_SERVER_PORT = 3000;

// 修改 OpenCode 端口范围
const START_PORT = 4096;
```

---

## 4. 启动服务器

### 4.1 开发模式

```bash
# 直接启动
node server.js

# 或使用 npm script
npm start

# 查看实时日志
node server.js 2>&1 | tee server.log
```

### 4.2 生产模式（使用 PM2）

**安装 PM2**：

```bash
npm install -g pm2
```

**启动服务器**：

```bash
# 启动
pm2 start server.js --name opencode-web

# 查看状态
pm2 status

# 查看日志
pm2 logs opencode-web

# 重启
pm2 restart opencode-web

# 停止
pm2 stop opencode-web
```

**配置 PM2 生态文件**（`ecosystem.config.js`）：

```javascript
module.exports = {
  apps: [{
    name: 'opencode-web',
    script: 'server.js',
    cwd: './',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      WEB_SERVER_PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
```

**使用配置文件启动**：

```bash
pm2 start ecosystem.config.js
```

### 4.3 使用 Systemd（Linux）

创建服务文件 `/etc/systemd/system/opencode-web.service`：

```ini
[Unit]
Description=OpenCode Web Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/opencode-web
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start opencode-web

# 启用开机自启
sudo systemctl enable opencode-web

# 查看状态
sudo systemctl status opencode-web

# 查看日志
sudo journalctl -u opencode-web -f
```

---

## 5. 反向代理配置

### 5.1 Nginx

```nginx
upstream opencode-web {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://opencode-web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE 支持
    location /api/sessions/.*/events {
        proxy_pass http://opencode-web;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

### 5.2 Apache

```apache
<VirtualHost *:80>
    ServerName your-domain.com

    ProxyPreserveHost On
    ProxyRequests Off

    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    # SSE 支持
    ProxyPass /api/sessions/ http://localhost:3000/api/sessions/
    ProxyPassReverse /api/sessions/ http://localhost:3000/api/sessions/

    <Proxy /api/sessions/.*/events>
        SetEnv force-proxy-request-1.0 1
        SetEnv proxy-nokeepalive 1
    </Proxy>
</VirtualHost>
```

---

## 6. SSL/HTTPS 配置

### 6.1 使用 Let's Encrypt（Nginx）

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 6.2 使用自签名证书（开发环境）

```bash
# 生成证书
openssl req -x509 -newkey rsa:4096 -nodes -keyout key.pem -out cert.pem -days 365

# 修改 server.js 支持 HTTPS
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(443, () => {
  console.log('HTTPS 服务器已启动，端口: 443');
});
```

---

## 7. 防火墙配置

### 7.1 Linux (UFW)

```bash
# 允许端口 80（HTTP）
sudo ufw allow 80/tcp

# 允许端口 443（HTTPS）
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable
```

### 7.2 Windows Firewall

```powershell
# 允许端口 80
New-NetFirewallRule -DisplayName "OpenCode Web HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow

# 允许端口 443
New-NetFirewallRule -DisplayName "OpenCode Web HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```

---

## 8. 监控和日志

### 8.1 日志文件

- **服务器日志**: `server.log`
- **PM2 日志**: `logs/pm2-out.log`, `logs/pm2-error.log`
- **Systemd 日志**: `journalctl -u opencode-web`

### 8.2 日志轮转

创建 `/etc/logrotate.d/opencode-web`：

```conf
/var/log/opencode-web/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 your-user your-user
    sharedscripts
    postrotate
        pm2 reload opencode-web
    endscript
}
```

### 8.3 健康检查

创建健康检查端点（添加到 `server.js`）：

```javascript
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: sessions.size,
    memory: process.memoryUsage(),
    port: WEB_SERVER_PORT
  };
  res.json(health);
});
```

---

## 9. 备份和恢复

### 9.1 备份

```bash
# 备份代码和配置
tar -czf opencode-web-backup-$(date +%Y%m%d).tar.gz \
  server.js package.json package-lock.json .env

# 备份会话数据（如果有持久化）
tar -czf sessions-backup-$(date +%Y%m%d).tar.gz sessions/
```

### 9.2 恢复

```bash
# 恢复备份
tar -xzf opencode-web-backup-20260101.tar.gz

# 重启服务器
pm2 restart opencode-web
```

---

## 10. 故障排查

### 10.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|--------|----------|
| 服务器无法启动 | 端口被占用 | 检查端口占用：`netstat -ano \| findstr :3000` |
| opencode 启动失败 | opencode 未安装 | 运行：`npm install -g opencode-ai/cli` |
| SSE 连接断开 | 代理配置错误 | 确保代理正确转发 SSE 端点 |
| 内存占用过高 | 会话未清理 | 定期删除非活跃会话 |

### 10.2 调试模式

启用调试日志：

```bash
# 设置日志级别
export LOG_LEVEL=debug

# 启动服务器
node server.js
```

### 10.3 检查端口占用

```bash
# Windows
netstat -ano | findstr :3000

# Linux/macOS
lsof -i :3000
```

---

## 11. 更新和维护

### 11.1 更新依赖

```bash
# 检查过时的依赖
npm outdated

# 更新依赖
npm update

# 清理缓存
npm cache clean --force
```

### 11.2 更新 opencode CLI

```bash
# 更新到最新版本
npm update -g opencode-ai/cli

# 验证版本
opencode --version
```

---

## 12. 性能优化

### 12.1 增加 Node.js 堆内存

```bash
# 启动时增加堆内存限制
node --max-old-space-size=4096 server.js
```

### 12.2 使用 HTTP/2

在 Nginx 中启用 HTTP/2：

```nginx
listen 443 ssl http2;
```

### 12.3 启用 Gzip 压缩

在 `server.js` 中添加压缩中间件：

```javascript
const compression = require('compression');
app.use(compression());
```

---

## 13. 安全建议

1. **使用环境变量**: 不要在代码中硬编码敏感信息
2. **启用 HTTPS**: 生产环境必须使用 SSL/TLS
3. **限制访问**: 使用防火墙限制访问来源
4. **定期更新**: 保持依赖和 opencode CLI 最新
5. **认证**: 如果公开部署，添加 API 认证
6. **日志审计**: 定期检查日志文件
7. **备份**: 定期备份配置和数据

---

## 14. 联系和支持

- **文档**: https://opencode.ai/docs
- **问题反馈**: GitHub Issues
- **社区**: OpenCode 社区论坛
