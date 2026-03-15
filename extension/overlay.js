/**
 * TogetherView: Overlay Badge Content Script
 *
 * A standalone content script that injects a persistent floating badge
 * into the Netflix page when a TogetherView watch party session is active.
 * Communicates via chrome.runtime.onMessage from background.js.
 */

const AUTO_MINIMIZE_DELAY_MS = 4000;
const MOUSELEAVE_DELAY_MS = 2000;
const FADE_OUT_DURATION_MS = 350;

let minimizeTimer = null;
let mouseleaveTimer = null;

function mountOverlay() {
  // Guard: only mount once
  if (document.getElementById("tv-overlay-badge")) return;

  const badge = document.createElement("div");
  badge.id = "tv-overlay-badge";
  badge.innerHTML =
    '<span class="tv-overlay-dot"></span>' +
    '<span class="tv-overlay-label">TogetherView</span>';

  document.body.appendChild(badge);

  // Auto-minimize after AUTO_MINIMIZE_DELAY_MS
  minimizeTimer = setTimeout(() => {
    badge.classList.add("tv-overlay-minimized");
  }, AUTO_MINIMIZE_DELAY_MS);

  // Expand on hover, re-minimize on mouse leave
  badge.addEventListener("mouseenter", () => {
    if (minimizeTimer) {
      clearTimeout(minimizeTimer);
      minimizeTimer = null;
    }
    if (mouseleaveTimer) {
      clearTimeout(mouseleaveTimer);
      mouseleaveTimer = null;
    }
    badge.classList.remove("tv-overlay-minimized");
  });

  badge.addEventListener("mouseleave", () => {
    mouseleaveTimer = setTimeout(() => {
      badge.classList.add("tv-overlay-minimized");
      mouseleaveTimer = null;
    }, MOUSELEAVE_DELAY_MS);
  });
}

function unmountOverlay() {
  const badge = document.getElementById("tv-overlay-badge");
  if (!badge) return;

  // Clear any pending timers
  if (minimizeTimer) {
    clearTimeout(minimizeTimer);
    minimizeTimer = null;
  }
  if (mouseleaveTimer) {
    clearTimeout(mouseleaveTimer);
    mouseleaveTimer = null;
  }

  // Fade out then remove from DOM
  badge.classList.add("tv-overlay-hidden");
  setTimeout(() => {
    badge.remove();
  }, FADE_OUT_DURATION_MS);
}

function hideOverlay() {
  const badge = document.getElementById("tv-overlay-badge");
  if (badge) badge.classList.add("tv-overlay-hidden");
}

function showOverlay() {
  const badge = document.getElementById("tv-overlay-badge");
  if (badge) badge.classList.remove("tv-overlay-hidden");
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLER: Listens for session lifecycle events from background.js
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SESSION_STARTED" || message.type === "SESSION_READY") {
    mountOverlay();
    return;
  }

  if (message.type === "SESSION_ENDED") {
    unmountOverlay();
    return;
  }

  if (message.type === "POPUP_OPENED") {
    hideOverlay();
    return;
  }

  if (message.type === "POPUP_CLOSED") {
    showOverlay();
    return;
  }
});

