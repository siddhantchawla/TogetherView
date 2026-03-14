/**
 * TogetherView: Content Script
 * Responsibilities: DOM Injection, Loop Prevention, Time Synchronization
 */

let isHost = false;
let isRemoteEvent = false;
let videoElement = null;

// Ask Background script for our role immediately
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response) isHost = response.isHost;
});

// The Netflix API Hook
function getNetflixPlayer() {
    try {
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const sessionId = videoPlayer.getAllPlayerSessionIds()[0];
        return videoPlayer.getVideoPlayerBySessionId(sessionId);
    } catch (e) { return null; }
}

// Logic gate and Remote Executors (Cloud -> Netflix)
chrome.runtime.onMessage.addListener((message) => {
    if (!videoElement) return;
    const player = getNetflixPlayer();

    // HANDSHAKE: Only the Host responds to sync requests
    if (message.type === 'SYNC_GET_STATUS') {
        if (isHost) {
            console.log("TogetherView: I am Host. Sending status to new peer.");
            broadcast(videoElement.paused ? 'PAUSE' : 'PLAY');
        }
        return; 
    }

    // EXECUTION: Use the player API to seek
    isRemoteEvent = true;
    const remoteTime = message.time;
    const timeDiff = Math.abs(videoElement.currentTime - remoteTime);

    if (message.type === 'SYNC_PLAY') {
        if (player && timeDiff > 1.5) player.seek(remoteTime * 1000);
        videoElement.play();
    } else if (message.type === 'SYNC_PAUSE' || message.type === 'SYNC_SEEK') {
        if (player) player.seek(remoteTime * 1000);
        if (message.type === 'SYNC_PAUSE') videoElement.pause();
    }

    setTimeout(() => { isRemoteEvent = false; }, 1000);
});

const init = () => {
    // Netflix uses a complex player; we wait for the video element to exist
    const videoSelector = 'video';
    videoElement = document.querySelector(videoSelector);

    if (videoElement) {
        console.log("TogetherView: Video player hooked.");
        setupEventListeners();
        checkAutoJoin();
    } else {
        // Retry every second if Netflix is still loading
        setTimeout(init, 1000);
    }
};

// Local Listeners (Netflix -> Cloud) ---

function setupEventListeners() {
    // PLAY
    videoElement.onplay = () => {
        if (isRemoteEvent) return; 
        broadcast('PLAY');
    };

    // PAUSE
    videoElement.onpause = () => {
        if (isRemoteEvent) return;
        broadcast('PAUSE');
    };

    // SEEK
    videoElement.onseeked = () => {
        if (isRemoteEvent) return;
        broadcast('SEEK');
    };
}

function broadcast(action) {
    chrome.runtime.sendMessage({
        type: 'TO_SERVER',
        action: action,
        time: videoElement.currentTime // Always sync the exact timestamp
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