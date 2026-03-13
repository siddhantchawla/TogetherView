// Generate a random Room ID
const generateRoomId = () => {
    return 'TV-' + Math.random().toString(36).substr(2, 4).toUpperCase();
};

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