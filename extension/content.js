/**
 * TogetherView: Content Script
 */

let isHost = false;
let isRemoteEvent = false;
let videoElement = null;
const SYNC_THRESHOLD = 2.0; // Seconds of drift allowed before we force a seek

// 1. ROLE CHECK
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response) {
        isHost = response.isHost;
        console.log("TogetherView: Role assigned -", isHost ? "HOST" : "GUEST");
    }
});

// 2. REMOTE MESSAGE HANDLER
chrome.runtime.onMessage.addListener((message) => {
    if (!videoElement) return;

    // HANDSHAKE: Only the Host responds to sync requests
    if (message.type === 'SYNC_GET_STATUS') {
        if (isHost) {
            console.log("TogetherView: Responding to sync request...");
            broadcast(videoElement.paused ? 'PAUSE' : 'PLAY');
        }
        return; 
    }

    // EXECUTION
    const remoteTime = message.time;
    const localTime = videoElement.currentTime;
    const timeDiff = Math.abs(localTime - remoteTime);

    isRemoteEvent = true;

    if (message.type === 'SYNC_PAUSE') {
        // ALWAYS pause first. Netflix is safest when paused.
        videoElement.pause();
        if (timeDiff > SYNC_THRESHOLD) videoElement.currentTime = remoteTime;
    } 
    
    else if (message.type === 'SYNC_PLAY') {
        // Only adjust time if we are currently paused or drift is massive
        if (videoElement.paused) {
            if (timeDiff > SYNC_THRESHOLD) videoElement.currentTime = remoteTime;
            videoElement.play().catch(() => console.log("Play blocked by browser."));
        } else if (timeDiff > SYNC_THRESHOLD) {
            videoElement.pause();
            videoElement.currentTime = remoteTime;
            setTimeout(() => {
                videoElement.play().catch(() => console.log("Play blocked after seek."));
            }, 50);
        }
    } 
    
    else if (message.type === 'SYNC_SEEK') {
        const wasPaused = videoElement.paused;
        videoElement.pause();
        videoElement.currentTime = remoteTime;
        if (!wasPaused) {
            setTimeout(() => {
                videoElement.play().catch(() => console.log("Play blocked after seek."));
            }, 50);
        }
    }

    // Guard window: prevents local listeners from reacting to our own sync
    setTimeout(() => { isRemoteEvent = false; }, 1000);
});

// 3. INITIALIZATION
const init = () => {
    videoElement = document.querySelector('video');
    if (videoElement) {
        console.log("TogetherView: Video player hooked.");
        setupEventListeners();
        checkAutoJoin();
    } else {
        setTimeout(init, 1000);
    }
};

function setupEventListeners() {
    videoElement.onplay = () => { if (!isRemoteEvent) broadcast('PLAY'); };
    videoElement.onpause = () => { if (!isRemoteEvent) broadcast('PAUSE'); };
    videoElement.onseeked = () => { if (!isRemoteEvent) broadcast('SEEK'); };
}

function broadcast(action) {
    chrome.runtime.sendMessage({
        type: 'TO_SERVER',
        action: action,
        time: videoElement.currentTime
    });
}

// Auto-join logic

function checkAutoJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('togetherViewRoom');

    if (roomFromUrl) {
        console.log("TogetherView: Auto-joining room:", roomFromUrl);
        chrome.runtime.sendMessage({ 
            type: 'START_SESSION', 
            room: roomFromUrl 
        });

        // Wait for player to load, then ask the room for the current status
        setTimeout(() => {
            console.log("TogetherView: Requesting initial sync...");
            broadcast('GET_STATUS'); 
        }, 4000);

        // Clean the URL: removes the ?togetherViewRoom=... part
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({path: cleanUrl}, '', cleanUrl);
    }
}

// Start the engine
init();