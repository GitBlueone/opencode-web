// 测试 ServeManager 功能
const path = require('path');
const { spawn } = require('child_process');

const OPENCODE_STORAGE_DIR = path.join(process.env.USERPROFILE, '.local', 'share', 'opencode', 'storage', 'session');
const DEFAULT_OPENCODE_SERVE_PORT = 4096;

// 构建目录到端口的映射
const DIRECTORY_TO_PORT = new Map();

function buildDirectoryToPortMapping() {
    const fs = require('fs');

    if (!fs.existsSync(OPENCODE_STORAGE_DIR)) {
        console.log('[映射] session 目录不存在');
        return;
    }

    const projectDirs = fs.readdirSync(OPENCODE_STORAGE_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    console.log(`[映射] 找到 ${projectDirs.length} 个 projectID`);

    for (const projectId of projectDirs) {
        const projectDir = path.join(OPENCODE_STORAGE_DIR, projectId);
        const sessionFiles = fs.readdirSync(projectDir, { withFileTypes: true })
            .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
            .map(dirent => dirent.name);

        if (sessionFiles.length === 0) continue;

        const firstSessionFile = path.join(projectDir, sessionFiles[0]);
        const sessionContent = JSON.parse(fs.readFileSync(firstSessionFile, 'utf8'));
        const directory = sessionContent.directory;

        if (directory && !DIRECTORY_TO_PORT.has(directory)) {
            const port = 4096 + DIRECTORY_TO_PORT.size;
            DIRECTORY_TO_PORT.set(directory, port);
            console.log(`[映射] "${directory}" -> 端口 ${port} (projectID: ${projectId.substring(0, 8)}...)`);
        }
    }

    console.log(`[映射] 总共映射 ${DIRECTORY_TO_PORT.size} 个目录到端口`);
}

buildDirectoryToPortMapping();

// 获取第一个目录
const firstDirectory = Array.from(DIRECTORY_TO_PORT.keys())[0];
const firstPort = DIRECTORY_TO_PORT.get(firstDirectory);

console.log(`\n[测试] 测试目录: ${firstDirectory}`);
console.log(`[测试] 目标端口: ${firstPort}`);

// 测试启动 opencode serve
console.log(`\n[测试] 启动 opencode serve...`);

const opencodePath = path.join(process.env.APPDATA, 'npm', 'opencode.cmd');
console.log(`[测试] opencode 路径: ${opencodePath}`);

const serveProcess = spawn(opencodePath, ['serve', '--port', String(firstPort)], {
    cwd: firstDirectory,
    shell: true,
    stdio: 'pipe',
    env: { ...process.env }
});

serveProcess.stdout.on('data', (data) => {
    console.log(`[serve:${firstPort}] ${data.toString().trim()}`);
});

serveProcess.stderr.on('data', (data) => {
    console.error(`[serve:${firstPort}] ${data.toString().trim()}`);
});

serveProcess.on('error', (error) => {
    console.error(`[测试] 启动失败: ${error.message}`);
    process.exit(1);
});

serveProcess.on('exit', (code, signal) => {
    console.log(`[测试] serve 已退出: 代码 ${code}, 信号 ${signal}`);
    process.exit(0);
});

// 等待 10 秒后停止
setTimeout(() => {
    console.log(`\n[测试] 10 秒后停止 serve...`);
    serveProcess.kill('SIGTERM');
    setTimeout(() => {
        if (!serveProcess.killed) {
            console.log(`[测试] 强制停止 serve...`);
            serveProcess.kill('SIGKILL');
        }
        process.exit(0);
    }, 5000);
}, 10000);
