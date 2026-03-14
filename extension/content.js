/**
 * TogetherView: Content Script
 * Responsibilities: DOM Injection, Loop Prevention, Time Synchronization
 */

let isRemoteEvent = false;
let videoElement = null;

// --- 1. INITIALIZATION & DOM HOOKING ---

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

// --- 2. LOCAL LISTENERS (Netflix -> Cloud) ---

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

// --- 3. REMOTE EXECUTORS (Cloud -> Netflix) ---

chrome.runtime.onMessage.addListener((message) => {
    if (!videoElement) return;

    // We set the flag to true so our local listeners ignore this change
    isRemoteEvent = true;

    const remoteTime = message.time;
    const timeDiff = Math.abs(videoElement.currentTime - remoteTime);

    if (message.type === 'SYNC_PLAY') {
        // Only seek if the difference is significant (> 0.5s) to avoid micro-stutter
        if (timeDiff > 0.5) videoElement.currentTime = remoteTime;
        videoElement.play();
    }

    if (message.type === 'SYNC_PAUSE') {
        videoElement.pause();
        videoElement.currentTime = remoteTime; // Snap to the exact frame
    }

    if (message.type === 'SYNC_SEEK') {
        videoElement.currentTime = remoteTime;
    }

    // Reset the flag after a short delay to allow the DOM to process the change
    setTimeout(() => {
        isRemoteEvent = false;
    }, 500); 
});

// --- 4. AUTO-JOIN LOGIC ---

function checkAutoJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('togetherViewRoom');

    if (roomFromUrl) {
        console.log("TogetherView: Auto-joining room:", roomFromUrl);
        chrome.runtime.sendMessage({ 
            type: 'START_SESSION', 
            room: roomFromUrl 
        });
    }
}

// Start the engine
init();