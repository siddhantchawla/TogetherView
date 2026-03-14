// popup.js

const generateRoomId = () => {
    return 'TV-' + Math.random().toString(36).substr(2, 4).toUpperCase();
};

// 1. INITIALIZE: Check if background script is already in a session
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response && response.isConnected && response.room) {
        showActiveSession(response.room);
    }
});

// 2. UI CONTROLLER: Transitions the popup to "Connected Mode"
function showActiveSession(roomCode) {
    // Hide all entry inputs/buttons
    document.getElementById('createBtn').style.display = 'none';
    document.getElementById('roomInput').style.display = 'none';
    document.getElementById('joinBtn').style.display = 'none';
    
    const statusText = document.getElementById('statusText');
    statusText.innerHTML = `Connected to: <strong>${roomCode}</strong>`;
    document.getElementById('dot').classList.add('connected');
    
    // Create Button Container for better layout
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.marginTop = '15px';

    // INVITE BUTTON
    const copyBtn = document.createElement('button');
    copyBtn.innerText = "Copy Invite Link";
    copyBtn.onclick = () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const currentUrl = tabs[0].url;
            
            // Fix: Capture the exact /watch/12345 part
            const watchPart = currentUrl.match(/watch\/\d+/);
            
            if (watchPart) {
                const inviteUrl = `https://www.netflix.com/${watchPart[0]}?togetherViewRoom=${roomCode}`;
                navigator.clipboard.writeText(inviteUrl).then(() => {
                    copyBtn.innerText = "Link Copied!";
                    copyBtn.style.backgroundColor = "#27ae60";
                    setTimeout(() => { 
                        copyBtn.innerText = "Copy Invite Link"; 
                        copyBtn.style.backgroundColor = "";
                    }, 2000);
                });
            } else {
                alert("Please open a Netflix video first!");
            }
        });
    };

    // LEAVE BUTTON
    const leaveBtn = document.createElement('button');
    leaveBtn.innerText = "Leave Party";
    leaveBtn.style.backgroundColor = "#333";
    leaveBtn.onclick = () => {
        // Tell background to kill the socket
        chrome.runtime.sendMessage({ type: 'LEAVE_SESSION' }, () => {
            window.location.reload(); // Refresh popup to show join/create again
        });
    };

    container.appendChild(copyBtn);
    container.appendChild(leaveBtn);
    document.body.appendChild(container);
}

// 3. ACTION LISTENERS
document.getElementById('createBtn').addEventListener('click', () => {
    const newRoom = generateRoomId();
    chrome.runtime.sendMessage({ 
        type: "START_SESSION", 
        room: newRoom
    }, () => showActiveSession(newRoom));
});

document.getElementById('joinBtn').addEventListener('click', () => {
    const roomCode = document.getElementById('roomInput').value.trim().toUpperCase();
    if (roomCode) {
        chrome.runtime.sendMessage({ 
            type: "START_SESSION", 
            room: roomCode
        }, () => showActiveSession(roomCode));
    } else {
        alert("Enter a Room ID first!");
    }
});