chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'TO_SERVER') {
      console.log(`TogetherView Backend: Relaying ${message.action} to Azure...`);
      // This is where we will eventually put the Azure Web PubSub code
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