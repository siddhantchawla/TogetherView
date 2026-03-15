/**
 * TogetherView: Page Context Script
 *
 * This file is injected into the Netflix page via script.src (chrome-extension:// URL),
 * which is allowed by CSP. It runs in the PAGE context, giving it access to
 * the Netflix internal player API (window.netflix), which is trusted by DRM.
 *
 * Communicates with content.js via window.postMessage.
 */

(function () {
  if (window.__togetherViewInjected) return;
  window.__togetherViewInjected = true;

  const SYNC_THRESHOLD = 2.0; // seconds

  function getPlayer() {
    try {
      const videoPlayer =
        netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const sessionId = videoPlayer.getAllPlayerSessionIds()[0];
      return videoPlayer.getVideoPlayerBySessionId(sessionId);
    } catch (e) {
      console.warn("TogetherView: Netflix player API not ready.", e);
      return null;
    }
  }

  // Listen for commands from content.js
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "__togetherView_cmd") return;

    const { action, time } = event.data; // time is in SECONDS
    const player = getPlayer();
    if (!player) {
      console.warn("TogetherView: Player not available for command:", action);
      return;
    }

    const timeMs = Math.round(time * 1000); // Netflix API uses milliseconds
    const currentMs = player.getCurrentTime();
    const diffSec = Math.abs(currentMs / 1000 - time);

    console.log(
      `TogetherView: [Page Context] Executing ${action} at ${time}s (diff: ${diffSec.toFixed(2)}s)`,
    );

    if (action === "SYNC_PAUSE") {
      player.pause();
      if (diffSec > SYNC_THRESHOLD) player.seek(timeMs);
    } else if (action === "SYNC_PLAY") {
      if (diffSec > SYNC_THRESHOLD) player.seek(timeMs);
      player.play();
    } else if (action === "SYNC_SEEK") {
      // Netflix's seek() preserves play/pause state automatically
      player.seek(timeMs);
    }
  });

  // Listen for status requests from content.js (host responding to guest sync)
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "__togetherView_getStatus") return;

    const player = getPlayer();
    if (!player) return;

    window.postMessage(
      {
        source: "__togetherView_status",
        paused: player.isPaused(),
        time: player.getCurrentTime() / 1000, // convert ms → seconds
      },
      "*",
    );
  });

  console.log("TogetherView: Page context controller ready.");
})();
