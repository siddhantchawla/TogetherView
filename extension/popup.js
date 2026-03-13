// Generate a random Room ID
const generateRoomId = () => {
    return 'TV-' + Math.random().toString(36).substr(2, 4).toUpperCase();
};

// Run immediately when popup opens
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response && response.room) {
      showActiveSession(response.room);
    }
});
  
function showActiveSession(roomCode) {
    // Hide the join/create inputs
    document.getElementById('createBtn').style.display = 'none';
    document.getElementById('roomInput').style.display = 'none';
    document.getElementById('joinBtn').style.display = 'none';
    
    // Show the active status
    const statusText = document.getElementById('statusText');
    statusText.innerHTML = `Connected to: <strong>${roomCode}</strong>`;
    document.getElementById('dot').classList.add('connected');
    
    // Add a "Leave" button dynamically
    const leaveBtn = document.createElement('button');
    leaveBtn.innerText = "Leave Party";
    leaveBtn.style.marginTop = "10px";
    leaveBtn.style.backgroundColor = "#333";
    leaveBtn.onclick = () => {
        chrome.storage.local.remove('activeSession');
        location.reload(); // Reset the popup UI
    };
    document.body.appendChild(leaveBtn);

    const copyBtn = document.createElement('button');
    copyBtn.innerText = "Copy Invite Link";
    copyBtn.style.marginTop = "5px";
    copyBtn.onclick = () => {
        const inviteUrl = `https://www.netflix.com/watch?togetherViewRoom=${roomCode}`;
        navigator.clipboard.writeText(inviteUrl);
        copyBtn.innerText = "Link Copied!";
        setTimeout(() => { copyBtn.innerText = "Copy Invite Link"; }, 2000);
    };
    document.body.appendChild(copyBtn);
}

document.getElementById('createBtn').addEventListener('click', () => {
    const newRoom = generateRoomId();
    document.getElementById('roomInput').value = newRoom;
    
    chrome.runtime.sendMessage({ 
        type: "START_SESSION", 
        room: newRoom,
        role: "HOST" 
    });

    updateUI(newRoom, "Hosting");
});

document.getElementById('joinBtn').addEventListener('click', () => {
    const roomCode = document.getElementById('roomInput').value;
    if (roomCode) {
        chrome.runtime.sendMessage({ 
            type: "START_SESSION", 
            room: roomCode,
            role: "GUEST" 
        });
        updateUI(roomCode, "Joined");
    }
});

function updateUI(code, status) {
    document.getElementById('statusText').innerText = `${status}: ${code}`;
    document.getElementById('dot').classList.add('connected');
}