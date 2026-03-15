// popup.js

const generateRoomId = () => {
    return 'TV-' + Math.random().toString(36).substr(2, 4).toUpperCase();
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. INITIALIZE
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response && response.isConnected && response.room) {
        // Already in a session — skip URL check, show active UI
        showActiveSession(response.room);
        return;
    }

    // Not in a session — check if we're on a Netflix watch page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url || '';
        const isOnWatchPage = /netflix\.com\/watch\/\d+/.test(url);

        if (isOnWatchPage) {
            document.getElementById('createBtn').style.display = 'block';
        } else {
            document.getElementById('notOnWatch').style.display = 'block';
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. UI CONTROLLER: Transitions the popup to "Connected Mode"
// ─────────────────────────────────────────────────────────────────────────────

function showActiveSession(roomCode) {
    // Hide idle-state elements
    document.getElementById('createBtn').style.display = 'none';
    document.getElementById('notOnWatch').style.display = 'none';

    const statusText = document.getElementById('statusText');
    statusText.innerHTML = `Connected to: <strong>${roomCode}</strong>`;
    document.getElementById('dot').classList.add('connected');

    // Button container
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.marginTop = '15px';

    // COPY INVITE LINK BUTTON
    const copyBtn = document.createElement('button');
    copyBtn.innerText = 'Copy Invite Link';
    copyBtn.onclick = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentUrl = tabs[0]?.url || '';
            const watchPart = currentUrl.match(/watch\/\d+/);

            if (watchPart) {
                const inviteUrl = `https://www.netflix.com/${watchPart[0]}?togetherViewRoom=${roomCode}`;
                navigator.clipboard.writeText(inviteUrl).then(() => {
                    copyBtn.innerText = 'Link Copied!';
                    copyBtn.style.backgroundColor = '#27ae60';
                    setTimeout(() => {
                        copyBtn.innerText = 'Copy Invite Link';
                        copyBtn.style.backgroundColor = '';
                    }, 2000);
                });
            } else {
                alert('Please navigate to the Netflix video first!');
            }
        });
    };

    // LEAVE BUTTON
    const leaveBtn = document.createElement('button');
    leaveBtn.innerText = 'Leave Party';
    leaveBtn.style.backgroundColor = '#333';
    leaveBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: 'LEAVE_SESSION' }, () => {
            window.location.reload();
        });
    };

    container.appendChild(copyBtn);
    container.appendChild(leaveBtn);
    document.body.appendChild(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CREATE PARTY
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('createBtn').addEventListener('click', () => {
    const newRoom = generateRoomId();
    chrome.runtime.sendMessage({
        type: 'START_SESSION',
        room: newRoom,
        role: 'HOST'
    }, () => showActiveSession(newRoom));
});
