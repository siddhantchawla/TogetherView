/**
 * TogetherView: Background Service Worker
 * Responsibilities: State management, Azure Handshake, WebSocket Relay
 *
 * State is persisted to chrome.storage.session to survive MV3 service worker
 * restarts. On wake-up, if a session was active, the WebSocket is automatically
 * reconnected.
 */

let socket = null;
let session = {
  room: null,
  isConnected: false,
  showTitle: null,
};
let isHost = false;
let myUserId = null; // Loaded from storage on startup
let popupClosedTimer = null; // Tracks the deferred POPUP_CLOSED message

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function saveState() {
  await chrome.storage.session.set({
    session,
    isHost,
    myUserId,
  });
}

async function clearState() {
  await chrome.storage.session.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP: Restore state and reconnect if session was active
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.session.get([
    "session",
    "isHost",
    "myUserId",
  ]);

  // Restore or generate userId (must be stable across restarts)
  myUserId =
    stored.myUserId || "user-" + Math.random().toString(36).substring(7);

  if (stored.session) {
    session = stored.session;
  }
  if (stored.isHost !== undefined) {
    isHost = stored.isHost;
  }

  // Save userId immediately in case it was just generated
  await saveState();

  // If there was an active session when the service worker was killed, reconnect
  if (session.room) {
    console.log(
      "TogetherView: Service worker restarted, reconnecting to room:",
      session.room,
    );
    session.isConnected = false; // Will be set to true on socket open
    await connectToAzure(session.room);
  }
}

// Store the init promise so connectToAzure can await it even when called early
const initPromise = init();

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE HANDSHAKE: Connect to Azure Web PubSub via your Azure Function
// ─────────────────────────────────────────────────────────────────────────────

const connectToAzure = async (roomID) => {
  // Ensure init has completed and myUserId is set before proceeding
  await initPromise;

  // Prevent duplicate connections
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log("TogetherView: Already connected, skipping reconnect.");
    return;
  }
  if (socket) {
    console.log("TogetherView: Closing existing connection...");
    socket.close();
  }

  // Handshake with your local Azure Function
  // NOTE: Update this URL when you deploy your Function to the cloud
  const response = await fetch(
    `https://togetherviewapi.azurewebsites.net/api/negotiate?room=${roomID}&userId=${myUserId}`,
  );
  if (!response.ok) {
    throw new Error(`Negotiate failed: ${response.status} ${response.statusText}`);
  }
  const { url } = await response.json();

  // Open WebSocket with the PubSub Sub-protocol
  socket = new WebSocket(url, "json.webpubsub.azure.v1");

  socket.onopen = async () => {
    console.log(`TogetherView: Connected to Cloud. Joining Room: ${roomID}`);

    // Join the specific "Room" (Group) in Azure
    socket.send(
      JSON.stringify({
        type: "joinGroup",
        group: roomID,
        ackId: 1,
      }),
    );

    session.isConnected = true;
    session.room = roomID;
    await saveState();

    // Notify the content script that the connection is ready.
    // Guests receive SESSION_READY to trigger GET_STATUS.
    // Hosts receive SESSION_STARTED to mount the overlay badge.
    if (!isHost) {
      sendToTab("SESSION_READY", 0);
    } else {
      sendToTab("SESSION_STARTED", 0);
    }
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log("TogetherView: Message from Azure:", message);

    // Filter for messages coming from other users
    if (message.type === "message" && message.data) {
      const { action, time } = message.data;
      console.log(`TogetherView: [Signal Received] ${action} at ${time}`);
      const senderId = message.fromUserId;

      if (senderId === myUserId) {
        console.log("TogetherView: Ignoring self-echo.");
        return;
      }

      // Handle host leaving the party
      if (action === "HOST_LEFT") {
        console.log("TogetherView: Host left the party.");
        if (socket) socket.close();
        session = { room: null, isConnected: false, showTitle: null };
        isHost = false;
        clearState();
        sendToTab("SESSION_ENDED", 0);
        chrome.runtime.sendMessage({ type: "SESSION_ENDED" }).catch(() => {});
        return;
      }

      if (action === "GET_STATUS" && !isHost) {
        // GET_STATUS will be only handled by the host, hence return if not the host.
        return;
      }
      // Relay the signal to the Netflix Content Script
      sendToTab(`SYNC_${action}`, time);
    }
  };

  socket.onclose = async () => {
    console.log("TogetherView: Cloud Disconnected.");
    session.isConnected = false;
    await saveState();
  };

  socket.onerror = (error) => {
    console.error("TogetherView: WebSocket Error", error);
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. MESSAGE ROUTER: Handles communication from Popup and Content Script
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // A. Triggered by Popup (Join/Create) or Content Script (Auto-Join)
  if (message.type === "START_SESSION") {
    isHost = message.role === "HOST";
    connectToAzure(message.room)
      .then(() => {
        sendResponse({ status: "success", room: message.room });
      })
      .catch((err) => {
        console.error(
          "TogetherView: Connection failed. Ensure Azure Function is running.",
          err,
        );
        sendResponse({ status: "error", error: err.message });
      });
    return true;
  }

  // B. Triggered by Popup to refresh its UI state
  if (message.type === "GET_SESSION") {
    sendResponse({ ...session, isHost });
    // Notify the Netflix tab that the popup is open so the overlay badge hides.
    // Since MV3 has no popup-close event, send POPUP_CLOSED after 5 seconds as
    // a safety net so the badge always reappears. Clear any pending timer first
    // to avoid duplicate POPUP_CLOSED messages if the popup is opened again.
    if (session.isConnected) {
      sendToTab("POPUP_OPENED", 0);
      if (popupClosedTimer) {
        clearTimeout(popupClosedTimer);
      }
      popupClosedTimer = setTimeout(() => {
        popupClosedTimer = null;
        sendToTab("POPUP_CLOSED", 0);
      }, 5000);
    }
  }

  // C. Triggered by Content Script when the local Netflix player state changes
  if (message.type === "TO_SERVER") {
    if (socket && socket.readyState === WebSocket.OPEN && session.isConnected) {
      console.log(`TogetherView: [Broadcasting] ${message.action}`);

      socket.send(
        JSON.stringify({
          type: "sendToGroup",
          group: session.room,
          dataType: "json",
          data: {
            action: message.action,
            time: message.time,
          },
        }),
      );
    }
  }

  // D. Triggered by Popup to end the session
  if (message.type === "LEAVE_SESSION") {
    // Notify all guests before closing (only if host)
    if (
      isHost &&
      socket &&
      socket.readyState === WebSocket.OPEN &&
      session.room
    ) {
      socket.send(
        JSON.stringify({
          type: "sendToGroup",
          group: session.room,
          dataType: "json",
          data: { action: "HOST_LEFT", time: 0 },
        }),
      );
    }
    // Small delay to let the HOST_LEFT message send before closing
    setTimeout(() => {
      if (socket) socket.close();
      session = { room: null, isConnected: false, showTitle: null };
      isHost = false;
      sendToTab("SESSION_ENDED", 0);
      clearState().then(() => {
        sendResponse({ status: "disconnected" });
      });
    }, 300);
    return true;
  }

  // E. Triggered by Content Script when no host responded after timeout
  if (message.type === "HOST_NOT_FOUND") {
    if (socket) socket.close();
    session = { room: null, isConnected: false, showTitle: null };
    isHost = false;
    clearState();
    sendToTab("SESSION_ENDED", 0);
    chrome.runtime.sendMessage({ type: "SESSION_ENDED" }).catch(() => {});
  }

  // F. Triggered by Content Script when Netflix JSON-LD metadata is read
  if (message.type === "SET_SHOW_TITLE") {
    session.showTitle = message.title;
    saveState();
    chrome.runtime
      .sendMessage({ type: "SHOW_TITLE_UPDATED", title: message.title })
      .catch(() => {});
    return;
  }

  return true; // Keep channel open for async responses
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TAB RELAY: Helper to find the Netflix tab and inject the command
// ─────────────────────────────────────────────────────────────────────────────

function sendToTab(type, time) {
  chrome.tabs.query({ url: "*://*.netflix.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      // Send to the first active Netflix tab found
      chrome.tabs.sendMessage(tabs[0].id, { type, time });
    }
  });
}
