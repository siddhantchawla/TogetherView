// popup.js

const app = document.getElementById('app');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const setState = (state) => app.setAttribute('data-state', state);

const getTabInfo = (callback) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        callback(tabs[0] || {});
    });
};

const parseShowTitle = (tabTitle) => {
    // Netflix tab titles are like "Show Name - Netflix" or "Episode Title | Show Name | Netflix"
    if (!tabTitle) return '—';
    const cleaned = tabTitle.replace(/\s*[-|]\s*Netflix\s*$/i, '').trim();
    return cleaned || '—';
};

const isWatchPage = (url) => /netflix\.com\/watch\/\d+/.test(url || '');

const generateRoomId = () => 'TV-' + Math.random().toString(36).slice(2, 6).toUpperCase();

// ─── INIT ──────────────────────────────────────────────────────────────────────

setState('loading');

chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response && response.isConnected && response.room) {
        showActiveState(response.room);
        return;
    }

    getTabInfo((tab) => {
        if (isWatchPage(tab.url)) {
            const title = parseShowTitle(tab.title);
            document.getElementById('showTitle').textContent = title;
            setState('idle');
        } else {
            setState('not-on-watch');
        }
    });
});

// ─── STATE: ACTIVE ─────────────────────────────────────────────────────────────

function showActiveState(roomCode) {
    // Update live badge
    document.getElementById('liveRoom').textContent = `· ${roomCode}`;
    document.getElementById('liveBadge').classList.add('visible');

    // Update now watching title
    getTabInfo((tab) => {
        const title = parseShowTitle(tab.title);
        document.getElementById('showTitleActive').textContent = title;
    });

    setState('active');
}

// ─── STATE: ENDED ──────────────────────────────────────────────────────────────

function showEndedState(reason) {
    document.getElementById('liveBadge').classList.remove('visible');
    document.getElementById('endedMessage').textContent = reason || 'The host ended the party.';
    setState('ended');
}

// ─── BUTTON: Start Party ───────────────────────────────────────────────────────

document.getElementById('createBtn').addEventListener('click', () => {
    const newRoom = generateRoomId();
    chrome.runtime.sendMessage({
        type: 'START_SESSION',
        room: newRoom,
        role: 'HOST'
    }, () => showActiveState(newRoom));
});

// ─── BUTTON: Start New Party (from ended state) ────────────────────────────────

document.getElementById('newPartyBtn').addEventListener('click', () => {
    getTabInfo((tab) => {
        if (isWatchPage(tab.url)) {
            const newRoom = generateRoomId();
            chrome.runtime.sendMessage({
                type: 'START_SESSION',
                room: newRoom,
                role: 'HOST'
            }, () => showActiveState(newRoom));
        } else {
            setState('not-on-watch');
        }
    });
});

// ─── BUTTON: Copy Invite Link ──────────────────────────────────────────────────

document.getElementById('copyBtn').addEventListener('click', () => {
    const roomCode = document.getElementById('liveRoom').textContent.replace('· ', '').trim();

    getTabInfo((tab) => {
        const watchPart = (tab.url || '').match(/watch\/\d+/);
        if (watchPart) {
            const inviteUrl = `https://www.netflix.com/${watchPart[0]}?togetherViewRoom=${roomCode}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                const btn = document.getElementById('copyBtn');
                btn.textContent = '✓  Link Copied!';
                btn.classList.add('btn-success');
                setTimeout(() => {
                    btn.innerHTML = '<span class="btn-icon">🔗</span> Copy Invite Link';
                    btn.classList.remove('btn-success');
                }, 2000);
            });
        }
    });
});

// ─── BUTTON: Leave Party ───────────────────────────────────────────────────────

document.getElementById('leaveBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LEAVE_SESSION' }, () => {
        document.getElementById('liveBadge').classList.remove('visible');
        getTabInfo((tab) => {
            if (isWatchPage(tab.url)) {
                const title = parseShowTitle(tab.title);
                document.getElementById('showTitle').textContent = title;
                setState('idle');
            } else {
                setState('not-on-watch');
            }
        });
    });
});

// ─── RUNTIME MESSAGES (from background.js) ────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SESSION_ENDED') {
        showEndedState('The host ended the party.');
    }
    if (message.type === 'NOTIFY_NO_HOST') {
        showEndedState('This party has ended. No host found.');
    }
});
