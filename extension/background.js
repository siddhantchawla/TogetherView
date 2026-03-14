/**
 * TogetherView: Background Service Worker
 * Responsibilities: State management, Azure Handshake, WebSocket Relay
*/

let socket = null;
let session = {
  room: null,
  isConnected: false
};

// 1. THE HANDSHAKE: Connect to Azure Web PubSub via your Azure Function
const connectToAzure = async (roomID) => {
  try {
    // Prevent duplicate connections: Close existing socket if it exists
    if (socket) {
      console.log("TogetherView: Closing existing connection...");
      socket.close();
    }

    // Handshake with your local Azure Function
    // NOTE: Update this URL when you deploy your Function to the cloud
    const response = await fetch(`https://7071-firebase-netflixparty-1773435758580.cluster-52r6vzs3ujeoctkkxpjif3x34a.cloudworkstations.dev/api/negotiate?room=SDE_TEST/api/negotiate?room=${roomID}`);
    const { url } = await response.json();

    // Open WebSocket with the PubSub Sub-protocol
    socket = new WebSocket(url, 'json.webpubsub.azure.v1');

    socket.onopen = () => {
      console.log(`TogetherView: Connected to Cloud. Joining Room: ${roomID}`);
      
      // Join the specific "Room" (Group) in Azure
      socket.send(JSON.stringify({
        type: 'joinGroup',
        group: roomID,
        ackId: 1 
      }));
      
      session.isConnected = true;
      session.room = roomID;
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      // Filter for messages coming from other users in the same group
      if (message.type === 'message' && message.from === 'group') {
        const { action, time } = message.data;
        console.log(`TogetherView: [Signal Received] ${action} at ${time}`);
        
        // Relay the signal to the Netflix Content Script
        sendToTab(`SYNC_${action}`, time);
      }
    };

    socket.onclose = () => {
      console.log("TogetherView: Cloud Disconnected.");
      session.isConnected = false;
      session.room = null;
    };

    socket.onerror = (error) => {
      console.error("TogetherView: WebSocket Error", error);
    };

  } catch (err) {
    console.error("TogetherView: Connection failed. Ensure Azure Function is running.", err);
  }
};

// 2. MESSAGE ROUTER: Handles communication from Popup and Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // A. Triggered by Popup (Join/Create) or Content Script (Auto-Join)
  if (message.type === 'START_SESSION') {
    connectToAzure(message.room);
    sendResponse({ status: "success", room: message.room });
  }

  // B. Triggered by Popup to refresh its UI state
  if (message.type === 'GET_SESSION') {
    sendResponse(session);
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
    sendResponse({ status: "disconnected" });
  }

  return true; // Keep channel open for async responses
});

// 3. TAB RELAY: Helper to find the Netflix tab and inject the command
function sendToTab(type, time) {
  chrome.tabs.query({ url: "*://*.netflix.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      // Send to the first active Netflix tab found
      chrome.tabs.sendMessage(tabs[0].id, { type, time });
    }
  });
}