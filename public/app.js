const DEBUG = false;
const expandedDirectories = new Set();
let currentOpenCodePort = 4096;

console.log('=== APP.JS v23.9 已加载 - 支持多实例切换 ===');

const API_BASE = '/api/sessions';
let selectedSessionId = null;
let sessions = [];
let messages = [];
let eventSource = null;

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadSessions();
    setupSidebarToggle();
    setupMessageInput();
    setupCreateModal();
});

function setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    sidebarToggle.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        }
    });

    setupSessionsListEvents();
}

function setupCreateModal() {
    document.getElementById('dir-up').addEventListener('click', () => {
        if (currentDirectoryPath) {
            const parentPath = getParentPath(currentDirectoryPath);
            if (parentPath && parentPath !== currentDirectoryPath) {
                loadDirectory(parentPath);
            }
        }
    });

    document.getElementById('create-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('session-title').value;
        const directory = document.getElementById('session-dir').value;
        await createSession(title, directory);
    });
}

function setupSessionsListEvents() {
    const sessionsList = document.getElementById('sessions-list');

    sessionsList.addEventListener('click', (e) => {
        const directoryHeader = e.target.closest('.directory-header');
        const sessionItem = e.target.closest('.session-item');

        if (directoryHeader) {
            const directory = directoryHeader.dataset.directory;
            toggleDirectory(directory);
        } else if (sessionItem) {
            const sessionId = sessionItem.dataset.sessionId;
            selectSession(sessionId);
        }
    });
}

async function loadSessions() {
    try {
        const response = await fetch(`/api/sessions?port=${currentOpenCodePort}`);
        const data = await response.json();
        sessions = data;

        debugLog('=== [loadSessions] 原始数据 ===');
        debugLog('数据长度:', data?.length);

        if (data && data.length > 0) {
            data.forEach((session, index) => {
                debugLog(`--- Session ${index + 1} ---`);
                debugLog('sessionId:', session.sessionId);
                debugLog('opencodeSessionId:', session.opencodeSessionId);
                debugLog('title:', session.title);
                debugLog('完整对象:', JSON.stringify(session, null, 2));
            });

            const pureSessions = data.filter(s => !s.parentID);
            const childSessions = data.filter(s => s.parentID);

            debugLog('=== 统计 ===');
            debugLog('纯净 session 数量（没有 parentID）:', pureSessions.length);
            debugLog('子 session 数量（有 parentID）:', childSessions.length);
        }

        renderSessionsList(sessions);

        if (selectedSessionId) {
            updateCurrentSessionDisplay();
        }
    } catch (error) {
        showToast('加载会话失败', 'error');
        console.error('Load sessions error:', error);
    }
}

function renderSessionsList(sessionsData) {
    const sessionsList = document.getElementById('sessions-list');

    if (!sessionsData || sessionsData.length === 0) {
        sessionsList.innerHTML = '<div class="sidebar-empty">暂无会话</div>';
        return;
    }

    const groups = new Map();
    sessionsData.forEach(session => {
        const dir = session.directory || '默认目录';
        if (!groups.has(dir)) {
            groups.set(dir, []);
        }
        groups.get(dir).push(session);
    });

    const sortedDirs = Array.from(groups.keys()).sort();
    const dirIndexMap = new Map();
    sortedDirs.forEach((dir, index) => {
        dirIndexMap.set(dir, index);
    });

    sessionsList.innerHTML = sortedDirs.map((dir, dirIndex) => {
        const sessionsInDir = groups.get(dir);
        const isExpanded = expandedDirectories.has(dir);
        const dirDisplayName = dir.split('\\').filter(Boolean).pop() || dir;

        // 按更新时间排序（降序，越晚越前）
        sessionsInDir.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        // 按日期切割会话列表（使用标准格式 YYYY-MM-DD）
        const dateGroups = new Map();
        sessionsInDir.forEach(session => {
            const dateObj = new Date(session.updatedAt);
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateKey = `${year}/${month}/${day}`;

            if (!dateGroups.has(dateKey)) {
                dateGroups.set(dateKey, []);
            }
            dateGroups.get(dateKey).push(session);
        });

        // 日期键已经是按插入顺序的（因为 sessionsInDir 已排序）
        const sortedDates = Array.from(dateGroups.keys());

        const sessionsHtml = sortedDates.map(date => {
            const sessionsInDate = dateGroups.get(date);
            return `
                <div class="date-group">
                    <div class="date-header">${date}</div>
                    ${sessionsInDate.map(session => {
                        const time = new Date(session.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                        return `
                            <div class="session-item ${session.sessionId === selectedSessionId ? 'active' : ''}"
                                 data-session-id="${session.sessionId}">
                                <div class="session-item-icon ${session.active ? 'running' : 'stopped'}"></div>
                                <div class="session-item-content">
                                    <div class="session-item-title">${escapeHtml(session.title || '未命名会话')}</div>
                                    <div class="session-item-time">${time}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');

        return `
            <div class="directory-group">
                <div class="directory-header" data-directory="${escapeHtml(dir)}">
                    <span class="directory-toggle">${isExpanded ? '▼' : '▶'}</span>
                    <span class="directory-name">${escapeHtml(dirDisplayName)}</span>
                    <span class="directory-count">(${sessionsInDir.length})</span>
                </div>
                <div class="directory-sessions ${isExpanded ? 'expanded' : 'collapsed'}">
                    ${sessionsHtml}
                </div>
            </div>
        `;
    }).join('');
}

function toggleDirectory(directory) {
    if (expandedDirectories.has(directory)) {
        expandedDirectories.delete(directory);
    } else {
        expandedDirectories.add(directory);
    }
    renderSessionsList(sessions);
}

async function selectSession(sessionId) {
    if (selectedSessionId === sessionId) return;

    selectedSessionId = sessionId;

    renderSessionsList(sessions);
    updateCurrentSessionDisplay();

    showLoadingOverlay();

    await loadMessages();

    connectSSE();
}

async function loadMessages() {
    try {
        // 获取会话信息以获取 directory
        const session = sessions.find(s => s.sessionId === selectedSessionId);
        if (!session) {
            console.error('[loadMessages] 找不到会话:', selectedSessionId);
            return;
        }

        const response = await fetch(`${API_BASE}/${selectedSessionId}/messages?directory=${encodeURIComponent(session.directory)}`);
        const data = await response.json();

        const messagesData = data.messages || [];
        const tokenUsage = data.tokenUsage || null;

        debugLog('=== [loadMessages] 原始数据 ===');
        debugLog('数据类型:', typeof data);
        debugLog('messages 是否为数组:', Array.isArray(messagesData));
        debugLog('消息长度:', messagesData.length);
        debugLog('tokenUsage:', tokenUsage);

        if (messagesData && messagesData.length > 0) {
            const firstMsg = messagesData[0];
            debugLog('=== [loadMessages] 第一条消息详情 ===');
            debugLog('msg.role:', firstMsg.role);
            debugLog('msg.info?.role:', firstMsg.info?.role);
            debugLog('msg.time:', firstMsg.time);
            debugLog('msg.info?.time:', firstMsg.info?.time);
            debugLog('msg.parts:', firstMsg.parts);
            debugLog('完整对象:', JSON.stringify(firstMsg, null, 2));
        }

        messages = messagesData;
        renderMessages(messages);

        scrollToBottom();

        // 从响应中获取 token 使用情况并更新 sessions 数组
        if (tokenUsage) {
            const sessionIndex = sessions.findIndex(s => s.sessionId === selectedSessionId);
            if (sessionIndex !== -1) {
                sessions[sessionIndex] = {
                    ...sessions[sessionIndex],
                    tokenUsage: tokenUsage
                };
                console.log('[loadMessages] 更新 tokenUsage:', tokenUsage);
                updateCurrentSessionDisplay();
            }
        }
    } catch (error) {
        showToast('加载消息失败', 'error');
        console.error('Load messages error:', error);
    } finally {
        hideLoadingOverlay();
    }
}

function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    // 获取会话信息以获取 directory
    const session = sessions.find(s => s.sessionId === selectedSessionId);
    if (!session) {
        console.error('[connectSSE] 找不到会话:', selectedSessionId);
        return;
    }

    const url = `/api/sessions/${selectedSessionId}/events?directory=${encodeURIComponent(session.directory)}`;
    eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            let eventSessionId = null;

            switch (data.type) {
                case 'message.part.updated':
                    eventSessionId = data.properties?.part?.sessionID;
                    break;
                case 'message.updated':
                    eventSessionId = data.properties?.info?.sessionID;
                    break;
                case 'session.status':
                case 'session.idle':
                case 'session.updated':
                    eventSessionId = data.properties?.sessionID;
                    break;
                default:
                    eventSessionId = null;
                    break;
            }

            if (eventSessionId && eventSessionId !== selectedSessionId) {
                return;
            }

            switch (data.type) {
                case 'message.part.updated':
                    const part = data.properties.part;
                    if (part) {
                        let existingMessage = messages.find(m => m.id === part.messageID);
                        if (!existingMessage) {
                            existingMessage = {
                                id: part.messageID,
                                info: { role: null, time: { created: Date.now() } },
                                parts: [part]
                            };
                            messages.push(existingMessage);
                        } else {
                            const existingPart = existingMessage.parts.find(p => p.id === part.id);
                            if (existingPart) {
                                Object.assign(existingPart, part);
                            } else {
                                existingMessage.parts.push(part);
                            }
                        }
                        appendOrUpdateMessagePart(part);
                        scrollToBottom();
                    }
                    break;

                case 'message.updated':
                    const msgInfo = data.properties.info;
                    let message = messages.find(m => m.id === msgInfo.id);

                    debugLog('[SSE] message.updated - msgInfo:', JSON.stringify(msgInfo));
                    debugLog('[SSE] message.updated - existing message:', message ? `found, role=${message.info?.role}` : 'not found');

                    if (!message) {
                        message = {
                            id: msgInfo.id,
                            info: { role: msgInfo.role, time: msgInfo.time },
                            parts: []
                        };

                        messages.push(message);
                        debugLog('[SSE] 创建新消息:', JSON.stringify(message));
                        renderMessageElement(message);
                        scrollToBottom();
                    } else if (message.info?.role === null && msgInfo.role) {
                        message.info.role = msgInfo.role;
                        message.info.time = msgInfo.time;

                        debugLog('[SSE] 更新消息 role:', msgInfo.role);
                        updateMessageElementClass(message);
                    }

                    if (msgInfo.role === 'assistant' && msgInfo.tokens) {
                        const currentSession = sessions.find(s => s.sessionId === selectedSessionId);
                        if (currentSession) {
                            const tokens = msgInfo.tokens;

                            const newUsage = {
                                total: (tokens.input || 0) + (tokens.output || 0) + (tokens.reasoning || 0) + (tokens.cache?.read || 0),
                                input: tokens.input || 0,
                                output: tokens.output || 0,
                                reasoning: tokens.reasoning || 0
                            };

                            currentSession.tokenUsage = newUsage;
                            updateCurrentSessionDisplay();
                        }
                    }
                    break;

                case 'session.idle':
                case 'session.error':
                    debugLog('会话状态变化:', data.type, data.properties);
                    break;
            }
        } catch (e) {
            console.error('[SSE] 解析事件失败:', e);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE 连接错误:', error);
        eventSource.close();
        eventSource = null;

        setTimeout(() => {
            connectSSE();
        }, 3000);
    };

    debugLog(`[SSE] 已连接到会话 ${selectedSessionId}`);
}

function renderMessages(messagesData, animate = false) {
    const container = document.getElementById('messages-content');

    if (!messagesData || messagesData.length === 0) {
        container.innerHTML = '<p class="messages-empty">暂无消息</p>';
        return;
    }

    container.innerHTML = messagesData.map(msg => {
        const isUser = msg.info?.role === 'user';
        const time = new Date(msg.info?.time?.created || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

        debugLog(`[renderMessages] msg.info?.role="${msg.info?.role}", isUser=${isUser}`);

        let partsHtml = '';
        if (msg.parts && msg.parts.length > 0) {
            partsHtml = msg.parts
                .filter(part => !['step-start', 'step-finish'].includes(part.type))
                .map(part => {
                    switch (part.type) {
                        case 'text':
                            return `<div class="part-text">${escapeHtml(part.text)}</div>`;
                        case 'reasoning':
                            return `
                                <div class="part-reasoning expanded">
                                    <div class="reasoning-header">💭 思考过程</div>
                                    <div class="reasoning-content">${escapeHtml(part.text)}</div>
                                </div>
                            `;
                        case 'tool':
                            const toolState = part.state?.status;
                            return `
                                <div class="part-tool">
                                    <div class="tool-header">
                                        <span class="tool-name">🔧 ${part.tool}</span>
                                        <span class="tool-status tool-status-${toolState}">${toolState}</span>
                                    </div>
                                    ${part.state?.output ? `<div class="tool-output">${escapeHtml(part.state.output)}</div>` : ''}
                                </div>
                            `;
                        case 'file':
                            return `
                                <div class="part-file">
                                    <div class="file-header">📎 ${part.filename || '文件'}</div>
                                    <a href="${part.url}" target="_blank" class="file-link">查看文件</a>
                                </div>
                            `;
                        default:
                            return `<div class="part-unknown">[${part.type}]</div>`;
                    }
                }).join('');
        } else if (msg.content) {
            partsHtml = `<div class="part-text">${escapeHtml(msg.content)}</div>`;
        }

        return `
            <div class="message ${isUser ? 'user' : 'assistant'}${animate ? ' new' : ''}">
                <div>
                    <div class="message-bubble">
                        ${partsHtml}
                    </div>
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderMessageElement(message) {
    const container = document.getElementById('messages-content');
    if (!container) return;

    const roleClass = {
        'user': 'user',
        'assistant': 'assistant'
    }[message.info?.role] || '';
    const time = new Date(message.info?.time?.created || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    debugLog(`[renderMessageElement] msg.id=${message.id}, msg.info?.role="${message.info?.role}", roleClass="${roleClass}"`);

    const messageElement = document.createElement('div');
    messageElement.className = `message ${roleClass}`.trim();
    messageElement.setAttribute('data-message-id', message.id);
    messageElement.innerHTML = `
        <div>
            <div class="message-bubble">
                <div class="message-parts" data-message-id="${message.id}"></div>
            </div>
            <div class="message-time">${time}</div>
        </div>
    `;
    container.appendChild(messageElement);

    message.parts
        .filter(part => !['step-start', 'step-finish'].includes(part.type))
        .forEach(part => {
            const partsContainer = messageElement.querySelector('.message-parts');
            let partElement = partsContainer.querySelector(`[data-part-id="${part.id}"]`);

            if (!partElement) {
                partElement = document.createElement('div');
                partElement.setAttribute('data-part-id', part.id);
                partsContainer.appendChild(partElement);
            }

            renderPartContent(partElement, part);
        });
}

function updateMessageElementClass(message) {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    if (!messageElement) return;

    const isUser = message.info?.role === 'user';
    messageElement.className = `message ${isUser ? 'user' : 'assistant'}`;

    const timeElement = messageElement.querySelector('.message-time');
    if (timeElement) {
        timeElement.textContent = new Date(message.info?.time?.created || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
}

function appendOrUpdateMessagePart(part) {
    const messageId = part.messageID;
    const message = messages.find(m => m.id === messageId);

    debugLog(`[appendOrUpdateMessagePart] part.type="${part.type}", msg.id=${messageId}, msg.info?.role="${message?.info?.role}"`);

    if (!message) {
        return;
    }

    let messageElement = document.querySelector(`[data-message-id="${messageId}"]`);

    if (!messageElement) {
        renderMessageElement(message);
        messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    }

    if (!messageElement) {
        return;
    }

    if (['step-start', 'step-finish'].includes(part.type)) {
        return;
    }

    const partsContainer = messageElement.querySelector('.message-parts');
    let partElement = partsContainer.querySelector(`[data-part-id="${part.id}"]`);

    if (!partElement) {
        partElement = document.createElement('div');
        partElement.setAttribute('data-part-id', part.id);
        partsContainer.appendChild(partElement);
    }

    renderPartContent(partElement, part);
}

function renderPartContent(partElement, part) {
    switch (part.type) {
        case 'text':
            partElement.className = 'part-text';
            partElement.innerHTML = escapeHtml(part.text);
            break;
        case 'reasoning':
            partElement.className = 'part-reasoning';
            partElement.innerHTML = `
                <details class="part-reasoning" open>
                    <summary>💭 思考过程</summary>
                    <div class="reasoning-content">${escapeHtml(part.text)}</div>
                </details>
            `;
            break;
        case 'tool':
            partElement.className = 'part-tool';
            const toolState = part.state?.status;
            partElement.innerHTML = `
                <div class="part-tool">
                    <div class="tool-header">
                        <span class="tool-name">🔧 ${part.tool}</span>
                        <span class="tool-status tool-status-${toolState}">${toolState}</span>
                    </div>
                    ${part.state?.output ? `<div class="tool-output">${escapeHtml(part.state.output)}</div>` : ''}
                </div>
            `;
            break;
        case 'file':
            partElement.className = 'part-file';
            partElement.innerHTML = `
                <div class="part-file">
                    <div class="file-header">📎 ${part.filename || '文件'}</div>
                    <a href="${part.url}" target="_blank" class="file-link">查看文件</a>
                </div>
            `;
            break;
        default:
            break;
    }
}

function updateCurrentSessionDisplay() {
    const session = sessions.find(s => s.sessionId === selectedSessionId);
    const welcomeState = document.getElementById('welcome-state');
    const sessionDetail = document.getElementById('session-detail');

    console.log('[updateCurrentSessionDisplay] selectedSessionId:', selectedSessionId);
    console.log('[updateCurrentSessionDisplay] session:', session);
    console.log('[updateCurrentSessionDisplay] session.tokenUsage:', session?.tokenUsage);

    if (!session) {
        welcomeState.style.display = 'flex';
        sessionDetail.style.display = 'none';
        return;
    }

    welcomeState.style.display = 'none';
    sessionDetail.style.display = 'block';

    document.getElementById('detail-name').textContent = session.title || '未命名会话';
    document.getElementById('detail-directory').textContent = session.directory || process.cwd();
    document.getElementById('detail-created').textContent = new Date(session.createdAt).toLocaleString('zh-CN');

    const portMatch = window.location.hostname.match(/:(\d+)/);
    document.getElementById('detail-port').textContent = portMatch ? portMatch[1] : '未知';

    // 显示 token 使用情况
    const tokenUsage = session.tokenUsage || { total: 0, input: 0, output: 0, reasoning: 0 };
    console.log('[updateCurrentSessionDisplay] tokenUsage:', tokenUsage);
    const tokenDisplay = formatTokenUsage(tokenUsage);
    console.log('[updateCurrentSessionDisplay] tokenDisplay:', tokenDisplay);
    document.getElementById('detail-tokens').textContent = tokenDisplay;
    document.getElementById('detail-tokens').style.color = getTokenUsageColor(tokenUsage);
}

function formatTokenUsage(usage) {
    if (!usage || usage.total === 0) {
        return '暂无数据';
    }

    const total = usage.total || 0;
    const input = usage.input || 0;
    const output = usage.output || 0;
    const reasoning = usage.reasoning || 0;

    // 格式化为 K 或数字
    const formatNum = (num) => num >= 1000 ? `${(num / 1000).toFixed(1)}K` : num;

    return `总计: ${formatNum(total)} (输入: ${formatNum(input)}, 输出: ${formatNum(output)}, 思考: ${formatNum(reasoning)})`;
}

function getTokenUsageColor(usage) {
    if (!usage || usage.total === 0) {
        return 'var(--text-secondary)';
    }

    const total = usage.total || 0;
    if (total > 100000) {
        return 'var(--error-color)';  // >100K
    } else if (total > 50000) {
        return '#f59e0b';  // >50K, 橙色
    } else if (total > 20000) {
        return 'var(--warning-color)';  // >20K, 黄色
    }
    return 'var(--success-color)';  // <=20K, 绿色
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content || !selectedSessionId) {
        return;
    }

    input.value = '';

    try {
        // 获取会话信息以获取 directory
        const session = sessions.find(s => s.sessionId === selectedSessionId);
        if (!session) {
            console.error('[sendMessage] 找不到会话:', selectedSessionId);
            return;
        }

        const response = await fetch(`${API_BASE}/${selectedSessionId}/message?directory=${encodeURIComponent(session.directory)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (!response.ok) {
            throw new Error('发送消息失败');
        }
    } catch (error) {
        showToast('发送消息失败', 'error');
        console.error('Send message error:', error);
    }
}

function setupMessageInput() {
    const input = document.getElementById('message-input');

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    });

    document.getElementById('send-message-btn').addEventListener('click', sendMessage);
}

function openCreateModal() {
    document.getElementById('create-modal').classList.add('active');
    loadDrives();
    loadDirectory('C:\\Users\\13927');
}

function closeCreateModal() {
    document.getElementById('create-modal').classList.remove('active');
    document.getElementById('create-form').reset();
}

let currentDirectoryPath = '';

async function loadDrives() {
    try {
        const response = await fetch('/api/drives');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || '加载磁盘列表失败');
        }

        updateDrivesUI(data.drives);
    } catch (error) {
        console.error('Load drives error:', error);
        showToast('加载磁盘列表失败', 'error');
    }
}

function updateDrivesUI(drives) {
    const drivesListEl = document.getElementById('drives-list');
    drivesListEl.innerHTML = '';

    drives.forEach(drive => {
        const item = document.createElement('span');
        item.className = 'drive-item';
        item.textContent = drive;
        item.addEventListener('click', () => loadDirectory(drive));
        drivesListEl.appendChild(item);
    });
}

async function loadDirectory(dirPath) {
    try {
        currentDirectoryPath = dirPath;

        const response = await fetch(`/api/directories?path=${encodeURIComponent(dirPath)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || '加载目录失败');
        }

        updateDirectoryUI(data);
    } catch (error) {
        console.error('Load directory error:', error);
        showToast('加载目录失败', 'error');
    }
}

function updateDirectoryUI(data) {
    const currentPathEl = document.getElementById('current-path');
    const selectedPathTextEl = document.getElementById('selected-path-text');
    const directoryListEl = document.getElementById('directory-list');
    const dirUpBtn = document.getElementById('dir-up');

    currentPathEl.textContent = data.path;
    selectedPathTextEl.textContent = data.path;
    document.getElementById('session-dir').value = data.path;

    const isRootDrive = /^[A-Z]:\\$/.test(data.path);
    dirUpBtn.disabled = isRootDrive;

    directoryListEl.innerHTML = '';

    if (data.directories.length === 0 && data.files.length === 0) {
        directoryListEl.innerHTML = '<div class="directory-item" style="color: var(--text-secondary);">此目录为空</div>';
        return;
    }

    data.directories.forEach(dir => {
        const item = document.createElement('div');
        item.className = 'directory-item';
        item.innerHTML = `
            <span class="folder-icon">📁</span>
            <span class="folder-name">${dir.name}</span>
        `;
        item.addEventListener('click', () => loadDirectory(dir.path));
        directoryListEl.appendChild(item);
    });

    data.files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'directory-item';
        item.innerHTML = `
            <span class="folder-icon">📄</span>
            <span class="folder-name">${file.name}</span>
            <span class="folder-time">${formatFileSize(file.size)}</span>
        `;
        item.addEventListener('click', () => {
            showToast('只能选择目录', 'info');
        });
        directoryListEl.appendChild(item);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getParentPath(dirPath) {
    const normalized = dirPath.replace(/\\/g, '/');

    const lastSlash = normalized.lastIndexOf('/');

    if (lastSlash <= 2 || lastSlash === -1) {
        return null;
    }

    const parentPath = normalized.substring(0, lastSlash);
    return parentPath.replace(/\//g, '\\');
}

async function startNewChat() {
    openCreateModal();
}

async function createSession(title, directory) {
    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, directory })
        });

        if (!response.ok) {
            throw new Error('创建会话失败');
        }

        const session = await response.json();
        sessions.push(session);
        renderSessionsList(sessions);
        closeCreateModal();
        showToast('会话已创建', 'success');
    } catch (error) {
        showToast('创建会话失败', 'error');
        console.error('Create session error:', error);
    }
}

async function compressCurrentSession() {
    if (!selectedSessionId) {
        return;
    }

    try {
        const session = sessions.find(s => s.sessionId === selectedSessionId);
        if (!session) {
            console.error('[compressCurrentSession] 找不到会话:', selectedSessionId);
            return;
        }

        const response = await fetch(`${API_BASE}/${selectedSessionId}/compress?directory=${encodeURIComponent(session.directory)}`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('压缩会话失败');
        }

        showToast('会话已压缩', 'success');
    } catch (error) {
        showToast('压缩会话失败', 'error');
        console.error('Compress session error:', error);
    }
}

async function deleteCurrentSession() {
    if (!selectedSessionId) {
        return;
    }

    if (!confirm('确定要删除这个会话吗？')) {
        return;
    }

    try {
        // 获取会话信息以获取 directory
        const session = sessions.find(s => s.sessionId === selectedSessionId);
        if (!session) {
            console.error('[deleteCurrentSession] 找不到会话:', selectedSessionId);
            return;
        }

        const response = await fetch(`${API_BASE}/${selectedSessionId}?directory=${encodeURIComponent(session.directory)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('删除会话失败');
        }

        sessions = sessions.filter(s => s.sessionId !== selectedSessionId);
        selectedSessionId = null;
        messages = [];

        renderSessionsList(sessions);
        updateCurrentSessionDisplay();

        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }

        showToast('会话已删除', 'success');
    } catch (error) {
        showToast('删除会话失败', 'error');
        console.error('Delete session error:', error);
    }
}

window.changeOpenCodePort = function(port) {
    if (currentOpenCodePort === parseInt(port)) return;

    currentOpenCodePort = parseInt(port);

    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }

    selectedSessionId = null;
    messages = [];
    showToast(`已切换到端口 ${port}`, 'info');
    loadSessions();
};

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.getElementById('messages-content');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function showLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (eventSource) {
            eventSource.close();
        }
    } else {
        if (selectedSessionId) {
            connectSSE();
        }
    }
});

window.testAppJS = function() {
    console.log('=== app.js v22.1 验证函数已调用 ===');
    return 'app.js v22.1 已加载';
};

console.log('=== app.js 执行完成，调用 testAppJS:', typeof window.testAppJS);
