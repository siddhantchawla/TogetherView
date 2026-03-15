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
  isConnected: false
};
let isHost = false;
let myUserId = null; // Loaded from storage on startup

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function saveState() {
  await chrome.storage.session.set({
    session,
    isHost,
    myUserId
  });
}

async function clearState() {
  await chrome.storage.session.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP: Restore state and reconnect if session was active
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  const stored = await chrome.storage.session.get(['session', 'isHost', 'myUserId']);

  // Restore or generate userId (must be stable across restarts)
  myUserId = stored.myUserId || ('user-' + Math.random().toString(36).substring(7));

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
    console.log('TogetherView: Service worker restarted, reconnecting to room:', session.room);
    session.isConnected = false; // Will be set to true on socket open
    await connectToAzure(session.room);
  }
}

init();

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE HANDSHAKE: Connect to Azure Web PubSub via your Azure Function
// ─────────────────────────────────────────────────────────────────────────────

const connectToAzure = async (roomID) => {
  try {
    // Prevent duplicate connections
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log('TogetherView: Already connected, skipping reconnect.');
      return;
    }
    if (socket) {
      console.log('TogetherView: Closing existing connection...');
      socket.close();
    }

    // Handshake with your local Azure Function
    // NOTE: Update this URL when you deploy your Function to the cloud
    const response = await fetch(`https://7071-firebase-netflixparty-1773435758580.cluster-52r6vzs3ujeoctkkxpjif3x34a.cloudworkstations.dev/api/negotiate?room=${roomID}&userId=${myUserId}`);
    const { url } = await response.json();

    // Open WebSocket with the PubSub Sub-protocol
    socket = new WebSocket(url, 'json.webpubsub.azure.v1');

    socket.onopen = async () => {
      console.log(`TogetherView: Connected to Cloud. Joining Room: ${roomID}`);

      // Join the specific "Room" (Group) in Azure
      socket.send(JSON.stringify({
        type: 'joinGroup',
        group: roomID,
        ackId: 1
      }));

      session.isConnected = true;
      session.room = roomID;
      await saveState();

      // Notify the content script that the connection is ready.
      // For guests joining via invite link, this triggers the initial GET_STATUS.
      sendToTab('SESSION_READY', 0);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('TogetherView: Message from Azure:', message);

      // Filter for messages coming from other users
      if (message.type === 'message' && message.data) {
        const { action, time } = message.data;
        console.log(`TogetherView: [Signal Received] ${action} at ${time}`);
        const senderId = message.fromUserId;

        if (senderId === myUserId) {
          console.log('TogetherView: Ignoring self-echo.');
          return;
        }

        // Relay the signal to the Netflix Content Script
        sendToTab(`SYNC_${action}`, time);
      }
    };

    socket.onclose = async () => {
      console.log('TogetherView: Cloud Disconnected.');
      session.isConnected = false;
      await saveState();
    };

    socket.onerror = (error) => {
      console.error('TogetherView: WebSocket Error', error);
    };

  } catch (err) {
    console.error('TogetherView: Connection failed. Ensure Azure Function is running.', err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. MESSAGE ROUTER: Handles communication from Popup and Content Script
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // A. Triggered by Popup (Join/Create) or Content Script (Auto-Join)
  if (message.type === 'START_SESSION') {
    isHost = message.role === 'HOST';
    connectToAzure(message.room).then(() => {
      sendResponse({ status: 'success', room: message.room });
    });
    return true;
  }

  // B. Triggered by Popup to refresh its UI state
  if (message.type === 'GET_SESSION') {
    sendResponse({ ...session, isHost });
  }

  // C. Triggered by Content Script when the local Netflix player state changes
  if (message.type === 'TO_SERVER') {
    if (socket && socket.readyState === WebSocket.OPEN && session.isConnected) {
      console.log(`TogetherView: [Broadcasting] ${message.action}`);

      socket.send(JSON.stringify({
        type: 'sendToGroup',
        group: session.room,
        dataType: 'json',
        data: {
          action: message.action,
          time: message.time
        }
      }));
    }
  }

  // D. Triggered by Popup to end the session
  if (message.type === 'LEAVE_SESSION') {
    if (socket) socket.close();
    session = { room: null, isConnected: false };
    isHost = false;
    clearState().then(() => {
      sendResponse({ status: 'disconnected' });
    });
    return true;
  }

  return true; // Keep channel open for async responses
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TAB RELAY: Helper to find the Netflix tab and inject the command
// ─────────────────────────────────────────────────────────────────────────────

function sendToTab(type, time) {
  chrome.tabs.query({ url: '*://*.netflix.com/*' }, (tabs) => {
    if (tabs.length > 0) {
      // Send to the first active Netflix tab found
      chrome.tabs.sendMessage(tabs[0].id, { type, time });
    }
  });
}