const DEBUG = false;
const expandedDirectories = new Set();
let currentOpenCodePort = 4096;
let frontendConfig = {
    defaultDirectory: '',
    sseReconnectDelay: 3000
};

console.log('=== APP.JS v23.9 已加载 - 支持多实例切换 ===');

const API_BASE = '/api/sessions';
let selectedSessionId = null;
let sessions = [];
let messages = [];
let eventSource = null;
const sessionSendingStatus = new Map();
const processedTempMessageIds = new Set();
const sessionEventSources = new Map();  // sessionId -> EventSource

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

async function loadFrontendConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        frontendConfig = data;
        console.log('[配置] 已加载前端配置:', frontendConfig);
    } catch (error) {
        console.error('[配置] 加载失败，使用默认值:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('[DOMContentLoaded] 页面加载开始');
    setupMessageInput();
    setupCreateModal();
    // 注意：setupSidebarToggle() 会在下面异步加载后调用
});

function setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    sidebarToggle.addEventListener('click', (e) => {
        console.log('[按钮点击] 触发侧边栏切换');
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
            console.log('[按钮点击] 侧边栏状态:', sidebar.classList.contains('open') ? '打开' : '关闭');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('open');
                console.log('[点击外部] 关闭侧边栏');
            }
        }
    });

    // 触摸滑动：全屏支持从左向右打开，从右向左关闭
    let touchStartX = null;
    let hasSwiped = false;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        hasSwiped = false;
        console.log('[触摸开始] 起始位置:', touchStartX);
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (window.innerWidth <= 768 && touchStartX !== null && !hasSwiped) {
            const currentX = e.touches[0].clientX;
            const diffX = currentX - touchStartX;
            const isOpen = sidebar.classList.contains('open');

            // 从左向右滑动：打开侧边栏
            if (!isOpen && diffX > 100) {
                sidebar.classList.add('open');
                console.log('[滑动打开] 侧边栏已展开');
                hasSwiped = true;
            }
            // 从右向左滑动：关闭侧边栏
            else if (isOpen && diffX < -100) {
                sidebar.classList.remove('open');
                console.log('[滑动关闭] 侧边栏已收起');
                hasSwiped = true;
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        touchStartX = null;
        hasSwiped = false;
    }, { passive: true });

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
    console.log('[setupSessionsListEvents] 事件监听器已绑定到', sessionsList);

    sessionsList.addEventListener('click', (e) => {
        console.log('[点击事件] 目标:', e.target, '类名:', e.target.className);

        const directoryHeader = e.target.closest('.directory-header');
        const sessionItem = e.target.closest('.session-item');

        console.log('[点击事件] directoryHeader:', directoryHeader);
        console.log('[点击事件] sessionItem:', sessionItem);

        if (directoryHeader) {
            e.stopPropagation();
            const directory = directoryHeader.dataset.directory;
            console.log('[目录点击] directory:', directory);
            toggleDirectory(directory);
        } else if (sessionItem) {
            const sessionId = sessionItem.dataset.sessionId;
            selectSession(sessionId);

            if (window.innerWidth <= 768) {
                const sidebar = document.getElementById('sidebar');
                sidebar.classList.remove('open');
            }
        }
    });
}

// 刷新单个会话的标题（由 SSE session.updated 事件触发）
let titleRefreshTimer = null;
function refreshSessionTitle(sessionId, properties) {
    if (!sessionId || !properties) return;
    
    const info = properties.info;
    if (!info) return;
    
    const newTitle = info.title;
    if (!newTitle) return;
    
    const sessionIndex = sessions.findIndex(s => s.sessionId === sessionId);
    if (sessionIndex !== -1 && sessions[sessionIndex].title !== newTitle) {
        sessions[sessionIndex].title = newTitle;
        
        // 防抖：短时间内多次更新只渲染一次
        if (titleRefreshTimer) {
            clearTimeout(titleRefreshTimer);
        }
        titleRefreshTimer = setTimeout(() => {
            renderSessionsList(sessions);
            if (selectedSessionId === sessionId) {
                updateCurrentSessionDisplay();
            }
            console.log(`[标题更新] 会话 ${sessionId.substring(0, 12)}... 标题已更新为: ${newTitle}`);
        }, 500);
    }
}

// 更新当前选中会话的显示信息
function updateCurrentSessionDisplay() {
    if (!selectedSessionId) {
        document.getElementById('session-detail').style.display = 'none';
        document.getElementById('welcome-state').style.display = 'flex';
        return;
    }
    
    const session = sessions.find(s => s.sessionId === selectedSessionId);
    if (!session) {
        document.getElementById('session-detail').style.display = 'none';
        document.getElementById('welcome-state').style.display = 'flex';
        return;
    }
    
    document.getElementById('session-detail').style.display = 'block';
    document.getElementById('welcome-state').style.display = 'none';
    document.getElementById('detail-name').textContent = session.title || '未命名会话';
    document.getElementById('detail-status').textContent = session.active ? '运行中' : '已停止';
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

    const activeSessions = sessionsData
        .filter(session => session.active === true)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 3);

    let html = '';
    if (activeSessions.length > 0) {
        html += `
            <div class="active-sessions-section">
                <div class="active-sessions-header">
                    <span class="active-sessions-icon">⚡</span>
                    <span class="active-sessions-title">活跃会话</span>
                </div>
                <div class="active-sessions-list">
                    ${activeSessions.map(session => {
                        const time = new Date(session.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                        return `
                            <div class="session-item ${session.sessionId === selectedSessionId ? 'active' : ''}"
                                 data-session-id="${session.sessionId}">
                                <div class="session-item-icon running"></div>
                                <div class="session-item-content">
                                    <div class="session-item-title">${escapeHtml(session.title || '未命名会话')}</div>
                                    <div class="session-item-time">${time}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
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

    html += sortedDirs.map((dir, dirIndex) => {
        const sessionsInDir = groups.get(dir);
        const isExpanded = expandedDirectories.has(dir);
        // 跨平台路径处理：支持 Windows (\) 和 Unix (/)
        const dirDisplayName = dir.split(/[\\/]/).filter(Boolean).pop() || dir;

        console.log(`[渲染目录] dir="${dir}", isExpanded=${isExpanded}, displayName="${dirDisplayName}"`);

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

    sessionsList.innerHTML = html;
}

function toggleDirectory(directory) {
    if (expandedDirectories.has(directory)) {
        expandedDirectories.delete(directory);
    } else {
        expandedDirectories.add(directory);
    }
    renderSessionsList(sessions);
}

function updateActiveSessions(maxActive = 3) {
    const now = new Date().toISOString();

    const currentSession = sessions.find(s => s.sessionId === selectedSessionId);
    if (currentSession) {
        currentSession.updatedAt = now;
    }

    sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    sessions.forEach((session, index) => {
        session.active = index < maxActive;
    });
}

async function selectSession(sessionId) {
    if (selectedSessionId === sessionId) return;

    selectedSessionId = sessionId;

    updateActiveSessions(3);

    renderSessionsList(sessions);
    updateCurrentSessionDisplay();

    updateSendButtonState();

    // 清空临时消息 ID 集合
    processedTempMessageIds.clear();

    showLoadingOverlay();

    await loadMessages();

    // 建立新的 SSE 连接（不关闭旧连接，支持多会话并行）
    connectSSE(sessionId);
}

function updateSendButtonState() {
    const sendBtn = document.getElementById('send-message-btn');
    if (!sendBtn) return;

    const isSending = selectedSessionId && sessionSendingStatus.get(selectedSessionId);

    if (isSending) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="sending-spinner">⟳</span>';
    } else {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>`;
    }
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

function connectSSE(sessionId) {
    // 获取会话信息以获取 directory
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) {
        console.error('[connectSSE] 找不到会话:', sessionId);
        return;
    }

    // 如果已经有连接，直接返回
    if (sessionEventSources.has(sessionId)) {
        debugLog(`[SSE] 会话 ${sessionId} 的连接已存在，跳过创建`);
        return;
    }

    const url = `/api/sessions/${sessionId}/events?directory=${encodeURIComponent(session.directory)}`;
    const newEventSource = new EventSource(url);
    sessionEventSources.set(sessionId, newEventSource);

    debugLog(`[SSE] 正在连接到会话 ${sessionId}, URL: ${url}`);

    newEventSource.onmessage = (event) => {
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
                    eventSessionId = data.properties?.sessionID;
                    break;
                case 'session.updated':
                    // session.updated 事件的 sessionID 在 info.id 中
                    eventSessionId = data.properties?.info?.id;
                    refreshSessionTitle(eventSessionId, data.properties);
                    break;
                default:
                    eventSessionId = null;
                    break;
            }

            // 只处理当前选中的会话事件（session.updated 除外，已单独处理）
            if (data.type !== 'session.updated' && eventSessionId && eventSessionId !== selectedSessionId) {
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
                        // 检查是否已经处理过这个临时消息 ID（避免重复添加）
                        if (processedTempMessageIds.has(msgInfo.id)) {
                            debugLog('[SSE] 跳过已处理的临时消息:', msgInfo.id);
                            return;
                        }

                        message = {
                            id: msgInfo.id,
                            info: { role: msgInfo.role, time: msgInfo.time },
                            parts: []
                        };

                        messages.push(message);
                        debugLog('[SSE] 创建新消息:', JSON.stringify(message));
                        renderMessageElement(message);
                        scrollToBottom();

                        // 标记这个临时消息已处理
                        if (msgInfo.role === null || !msgInfo.role) {
                            processedTempMessageIds.add(msgInfo.id);
                        }
                    } else if (message.info?.role === null && msgInfo.role) {
                        message.info.role = msgInfo.role;
                        message.info.time = msgInfo.time;

                        debugLog('[SSE] 更新消息 role:', msgInfo.role);
                        updateMessageElementClass(message);

                        // role 更新后，从临时消息集合中移除
                        processedTempMessageIds.delete(msgInfo.id);
                    }

                    // Assistant 消息完成时提醒用户
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

                            if (!currentSession.tokenUsage || newUsage.total > 0) {
                                currentSession.tokenUsage = newUsage;
                                updateCurrentSessionDisplay();
                            }

                            // 如果不是当前会话，显示通知
                            if (eventSessionId && eventSessionId !== selectedSessionId) {
                                const sourceSession = sessions.find(s => s.sessionId === eventSessionId);
                                if (sourceSession) {
                                    showToast(`[${sourceSession.title}] AI 回复已完成`, 'success');
                                }
                            }

                            // 自动压缩：如果 token 总数超过 100000，自动调用压缩
                            if (newUsage.total > 100000) {
                                console.log(`[SSE] 触发自动压缩: ${currentSession.title}, total=${newUsage.total}`);
                                autoCompressSession(selectedSessionId);
                            }
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

    newEventSource.onerror = (error) => {
        console.error(`[SSE] 会话 ${sessionId} 连接错误:`, error);
        newEventSource.close();
        sessionEventSources.delete(sessionId);
    };

    debugLog(`[SSE] ✓ 已连接到会话 ${sessionId}`);
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
    if (message.failed) {
        messageElement.classList.add('message-failed');
    }
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
    if (!usage) {
        return '暂无数据';
    }

    if (typeof usage.total === 'undefined' || usage.total === null) {
        return '暂无数据';
    }

    const total = usage.total || 0;
    if (total === 0) {
        return '暂无数据';
    }

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
    const sendBtn = document.getElementById('send-message-btn');

    if (!content || !selectedSessionId) {
        return;
    }

    if (sessionSendingStatus.get(selectedSessionId)) {
        console.log('[sendMessage] 当前会话正在发送，忽略重复请求');
        return;
    }

    const session = sessions.find(s => s.sessionId === selectedSessionId);
    if (!session) {
        console.error('[sendMessage] 找不到会话:', selectedSessionId);
        showToast('找不到会话', 'error');
        return;
    }

    // 清空输入框（立即执行，无论成功失败）
    input.value = '';
    input.style.height = 'auto';

    sessionSendingStatus.set(selectedSessionId, true);
    updateSendButtonState();

    showToast('消息发送中...', 'info');

    try {
        const response = await fetch(`${API_BASE}/${selectedSessionId}/message?directory=${encodeURIComponent(session.directory)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `发送失败 (${response.status})`);
        }

        // 消息已发送，流式输出通过 SSE 实时接收
        showToast('消息已发送，AI 正在回复...', 'success');
    } catch (error) {
        console.error('Send message error:', error);
        showToast(`[${session.title}] ${error.message}`, 'error');
    } finally {
        sessionSendingStatus.delete(selectedSessionId);
        updateSendButtonState();
        input.focus();
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
    loadDirectory(frontendConfig.defaultDirectory);
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
        
        // 将新会话添加到本地列表（不重新加载整个列表）
        sessions.push(session);
        renderSessionsList(sessions);
        
        closeCreateModal();
        showToast('会话已创建', 'success');

        await selectSession(session.sessionId);
    } catch (error) {
        showToast('创建会话失败', 'error');
        console.error('Create session error:', error);
    }
}

async function compressCurrentSession() {
    if (!selectedSessionId) {
        console.error('[compressCurrentSession] 没有选中的会话');
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
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `压缩失败 (${response.status})`);
        }

        showToast('会话压缩请求已发送，正在后台处理...', 'success');
    } catch (error) {
        showToast('压缩会话失败', 'error');
        console.error('Compress session error:', error);
    }
}

// 自动压缩会话（由 SSE 事件触发）
async function autoCompressSession(sessionId) {
    const session = sessions.find(s => s.sessionId === sessionId);
    if (!session) {
        console.error('[autoCompressSession] 找不到会话:', sessionId);
        return;
    }

    console.log(`[自动压缩] 触发自动压缩: ${session.title}`);
    try {
        const response = await fetch(`${API_BASE}/${sessionId}/compress?directory=${encodeURIComponent(session.directory)}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[自动压缩] 失败:', errorData.error?.message);
            return;
        }

        console.log('[自动压缩] ✓ 请求已发送');
    } catch (error) {
        console.error('[自动压缩] 异常:', error);
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

        // 关闭该会话的 SSE 连接
        const es = sessionEventSources.get(selectedSessionId);
        if (es) {
            es.close();
            sessionEventSources.delete(selectedSessionId);
        }

        sessions = sessions.filter(s => s.sessionId !== selectedSessionId);
        selectedSessionId = null;
        messages = [];

        renderSessionsList(sessions);
        updateCurrentSessionDisplay();

        showToast('会话已删除', 'success');
    } catch (error) {
        showToast('删除会话失败', 'error');
        console.error('Delete session error:', error);
    }
}

function openEditTitleModal() {
    if (!selectedSessionId) {
        return;
    }

    const session = sessions.find(s => s.sessionId === selectedSessionId);
    if (!session) {
        return;
    }

    document.getElementById('edit-title-input').value = session.title || '';
    document.getElementById('edit-title-modal').classList.add('active');
    document.getElementById('edit-title-input').focus();
}

function closeEditTitleModal() {
    document.getElementById('edit-title-modal').classList.remove('active');
}

async function saveTitle(event) {
    event.preventDefault();

    if (!selectedSessionId) {
        return;
    }

    const session = sessions.find(s => s.sessionId === selectedSessionId);
    if (!session) {
        return;
    }

    const newTitle = document.getElementById('edit-title-input').value.trim();

    if (!newTitle) {
        showToast('标题不能为空', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/${selectedSessionId}?directory=${encodeURIComponent(session.directory)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || '更新标题失败');
        }

        const result = await response.json();

        // 更新本地会话数据
        const sessionIndex = sessions.findIndex(s => s.sessionId === selectedSessionId);
        if (sessionIndex !== -1) {
            sessions[sessionIndex].title = result.title;
            sessions[sessionIndex].updatedAt = result.updatedAt;
        }

        renderSessionsList(sessions);
        updateCurrentSessionDisplay();
        closeEditTitleModal();
        showToast('标题已更新', 'success');
    } catch (error) {
        showToast(`更新失败: ${error.message}`, 'error');
        console.error('Update title error:', error);
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

function toggleMetaInfo() {
    const meta = document.getElementById('session-meta');
    if (meta) {
        meta.classList.toggle('visible');
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
        // 页面隐藏时关闭所有 SSE 连接
        sessionEventSources.forEach((es, sessionId) => {
            es.close();
        });
        sessionEventSources.clear();
        console.log('[visibilitychange] 页面隐藏，已关闭所有 SSE 连接');
    } else {
        // 页面显示时重新连接当前会话
        if (selectedSessionId) {
            connectSSE(selectedSessionId);
            console.log('[visibilitychange] 页面显示，重新连接当前会话');
        }
    }
});

window.testAppJS = function() {
    console.log('=== app.js v22.1 验证函数已调用 ===');
    return 'app.js v22.1 已加载';
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[DOMContentLoaded] 第二个监听器开始执行');
    await loadFrontendConfig();
    await loadSessions();
    setupSidebarToggle();

    // 移动端侧边栏初始化：确保 CSS transform 正确生效
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            const transform = window.getComputedStyle(sidebar).transform;
            console.log('[初始化] 移动端侧边栏 transform 值:', transform);
        }
    }

    console.log('[DOMContentLoaded] 初始化完成');
    console.log('=== app.js 执行完成，调用 testAppJS:', typeof window.testAppJS);
});

