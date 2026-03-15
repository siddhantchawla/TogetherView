/**
 * TogetherView: Content Script
 *
 * Injects page-context.js into the Netflix page via script.src
 * (chrome-extension:// URL) to comply with Netflix's CSP.
 * All Netflix player API calls happen in page-context.js.
 * Communication between this file and page-context.js uses window.postMessage.
 */

let lastRemoteAction = null; // { action: string, time: number }
// Tolerance (seconds) for matching a local event echo to a remote command we just applied
const REMOTE_ACTION_TIME_THRESHOLD = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// 1. INJECT PAGE-CONTEXT SCRIPT (CSP-compliant: src= not inline)
// ─────────────────────────────────────────────────────────────────────────────

const script = document.createElement('script');
script.src = chrome.runtime.getURL('page-context.js');
script.onload = () => script.remove(); // Clean up the tag after load
(document.head || document.documentElement).appendChild(script);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROLE CHECK
// ─────────────────────────────────────────────────────────────────────────────

let isHost = false;
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
    if (response) {
        isHost = response.isHost;
        console.log("TogetherView: Role assigned -", isHost ? "HOST" : "GUEST");
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REMOTE MESSAGE HANDLER (receives sync commands from background.js)
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {

    // HANDSHAKE: Only the Host responds to sync requests from new guests
    if (message.type === 'SYNC_GET_STATUS') {
        if (isHost) {
            console.log("TogetherView: Responding to sync request...");
            // Ask the page-context controller for current player status
            window.postMessage({ source: '__togetherView_getStatus' }, '*');
        }
        return;
    }

    // SESSION_READY: WebSocket is open and group is joined — safe to request sync
    if (message.type === 'SESSION_READY') {
        console.log("TogetherView: Session ready, requesting initial sync...");
        broadcast('GET_STATUS', 0);
        return;
    }

    console.log(`TogetherView: [Remote Command] ${message.type} at ${message.time}s`);

    // Record the remote action so local event listeners can skip re-broadcasting it
    lastRemoteAction = { action: message.type, time: message.time };

    // Forward the command to the injected page-context Netflix controller
    window.postMessage({
        source: '__togetherView_cmd',
        action: message.type,   // 'SYNC_PLAY', 'SYNC_PAUSE', 'SYNC_SEEK'
        time: message.time      // in seconds
    }, '*');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LISTEN FOR STATUS RESPONSE (page context -> content script -> broadcast)
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== '__togetherView_status') return;
    broadcast(event.data.paused ? 'PAUSE' : 'PLAY', event.data.time);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. INITIALIZATION & LOCAL EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

const init = () => {
    const videoElement = document.querySelector('video');
    if (videoElement) {
        console.log("TogetherView: Video player hooked.");
        setupEventListeners(videoElement);
        checkAutoJoin();
    } else {
        setTimeout(init, 1000);
    }
};

function setupEventListeners(video) {
    // Use addEventListener (NOT .onplay/.onpause) to avoid overwriting
    // Netflix's own DRM event handlers on those properties.
    video.addEventListener('play', () => {
        if (lastRemoteAction?.action === 'SYNC_PLAY' &&
            Math.abs(video.currentTime - lastRemoteAction.time) < REMOTE_ACTION_TIME_THRESHOLD) {
            lastRemoteAction = null; // consume — this is the echo of what we just applied
            return;
        }
        broadcast('PLAY', video.currentTime);
    });

    video.addEventListener('pause', () => {
        if (lastRemoteAction?.action === 'SYNC_PAUSE' &&
            Math.abs(video.currentTime - lastRemoteAction.time) < REMOTE_ACTION_TIME_THRESHOLD) {
            lastRemoteAction = null;
            return;
        }
        broadcast('PAUSE', video.currentTime);
    });

    video.addEventListener('seeked', () => {
        if (lastRemoteAction?.action === 'SYNC_SEEK' &&
            Math.abs(video.currentTime - lastRemoteAction.time) < REMOTE_ACTION_TIME_THRESHOLD) {
            lastRemoteAction = null;
            return;
        }
        broadcast('SEEK', video.currentTime);
    });
}

function broadcast(action, time) {
    chrome.runtime.sendMessage({
        type: 'TO_SERVER',
        action: action,
        time: time  // in seconds
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. AUTO-JOIN
// ─────────────────────────────────────────────────────────────────────────────

function checkAutoJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('togetherViewRoom');

    if (roomFromUrl) {
        console.log("TogetherView: Auto-joining room:", roomFromUrl);
        chrome.runtime.sendMessage({
            type: 'START_SESSION',
            room: roomFromUrl
        });

        // GET_STATUS is sent when background.js fires SESSION_READY,
        // ensuring the WebSocket is open and the group is joined first.

        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    }
}

init();