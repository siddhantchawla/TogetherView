/**
 * TogetherView: Content Script
 *
 * KEY FIX: All video/player manipulation is done via injected <script> tags
 * that run in the PAGE context (trusted by Netflix DRM), NOT the isolated
 * content script context (which triggers M7375).
 *
 * Netflix internal API is used for seek (player.seek(ms)) because direct
 * video.currentTime manipulation also triggers M7375.
 */

let isRemoteEvent = false;
const SYNC_THRESHOLD = 2.0; // seconds

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Inject a script into the Netflix page context (trusted by DRM)
// ─────────────────────────────────────────────────────────────────────────────

function injectPageScript(code) {
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. INJECT NETFLIX API CONTROLLER INTO PAGE CONTEXT
//    Runs once on load. Exposes a postMessage-based interface so the
//    content script can command the Netflix player safely.
// ─────────────────────────────────────────────────────────────────────────────

injectPageScript(`
    (function() {
        if (window.__togetherViewInjected) return;
        window.__togetherViewInjected = true;

        function getPlayer() {
            try {
                const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
                const sessionId = videoPlayer.getAllPlayerSessionIds()[0];
                return videoPlayer.getVideoPlayerBySessionId(sessionId);
            } catch(e) {
                console.warn('TogetherView: Netflix player API not ready.', e);
                return null;
            }
        }

        window.addEventListener('message', function(event) {
            if (event.source !== window) return;
            if (!event.data || event.data.source !== '__togetherView_cmd') return;

            const { action, time } = event.data; // time is in SECONDS
            const player = getPlayer();
            if (!player) return;

            const timeMs = Math.round(time * 1000); // Netflix API uses milliseconds
            const currentMs = player.getCurrentTime();
            const diffSec = Math.abs(currentMs / 1000 - time);
            const SYNC_THRESHOLD = ${SYNC_THRESHOLD};

            if (action === 'SYNC_PAUSE') {
                player.pause();
                if (diffSec > SYNC_THRESHOLD) player.seek(timeMs);
            }
            else if (action === 'SYNC_PLAY') {
                if (diffSec > SYNC_THRESHOLD) player.seek(timeMs);
                player.play();
            }
            else if (action === 'SYNC_SEEK') {
                player.seek(timeMs);
            }
        });

        // Listen for status requests (host responding to new guest sync requests)
        window.addEventListener('message', function(event) {
            if (event.source !== window) return;
            if (!event.data || event.data.source !== '__togetherView_getStatus') return;

            const player = getPlayer();
            if (!player) return;

            window.postMessage({
                source: '__togetherView_status',
                paused: player.isPaused(),
                time: player.getCurrentTime() / 1000  // convert ms -> seconds
            }, window.location.origin);
        });
    })();
`);

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
            window.postMessage({ source: '__togetherView_getStatus' }, window.location.origin);
        }
        return;
    }

    // Prevent feedback loops: ignore locally-triggered events after a remote sync
    if (isRemoteEvent) return;

    isRemoteEvent = true;
    // 1500ms guard: prevents the local play/pause/seek listeners from
    // re-broadcasting the event we just applied, avoiding A->B->A echo loops.
    setTimeout(() => { isRemoteEvent = false; }, 1500);

    console.log(`TogetherView: [Remote Command] ${message.type} at ${message.time}s`);

    // Forward the command to the injected page-context Netflix controller
    window.postMessage({
        source: '__togetherView_cmd',
        action: message.type,   // 'SYNC_PLAY', 'SYNC_PAUSE', 'SYNC_SEEK'
        time: message.time      // in seconds
    }, window.location.origin);
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
    video.addEventListener('play',   () => { if (!isRemoteEvent) broadcast('PLAY',  video.currentTime); });
    video.addEventListener('pause',  () => { if (!isRemoteEvent) broadcast('PAUSE', video.currentTime); });
    video.addEventListener('seeked', () => { if (!isRemoteEvent) broadcast('SEEK',  video.currentTime); });
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

        setTimeout(() => {
            console.log("TogetherView: Requesting initial sync...");
            broadcast('GET_STATUS', 0);
        }, 4000);

        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    }
}

init();