// background.js
let session = {
    room: null,
    isConnected: false
};
  
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. When Popup tells us to start
    if (message.type === 'START_SESSION') {
        session.room = message.room;
        session.isConnected = true;
      
        // Save to storage so it survives a browser restart
        chrome.storage.local.set({ activeSession: session });
      
        console.log(`TogetherView: Session initialized for room ${session.room}`);
        sendResponse({ status: "success" });
    }
  
    // 2. When Popup asks "What is my current room?"
    if (message.type === 'GET_SESSION') {
        sendResponse(session);
    }
  
    // 3. Relaying Netflix events to the (future) server
    if (message.type === 'TO_SERVER') {
        if (session.isConnected) {
            console.log(`TogetherView: Group ${session.room} -> Broadcast ${message.action}`);
            // This is where Azure will eventually go
        }
    }
});

// A helper function to send messages to the open Netflix tab
function sendToTab(type, time) {
    chrome.tabs.query({ url: "*://*.netflix.com/*" }, (tabs) => {
        tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type, time });
        });
    });
}