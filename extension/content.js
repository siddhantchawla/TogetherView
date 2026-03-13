let videoElement = null;
let isRemoteEvent = false;

// 1. Detect Netflix video player
const init = () => {
  const video = document.querySelector('video');
  if (video && video !== videoElement) {
    videoElement = video;
    setupListeners();
    console.log("TogetherView: Video player hooked.");
  }
};

// 2. Listen for Play/Pause/Seek
const setupListeners = () => {
  videoElement.onplay = () => notifyBackground('PLAY', videoElement.currentTime);
  videoElement.onpause = () => notifyBackground('PAUSE', videoElement.currentTime);
  videoElement.onseeked = () => notifyBackground('SEEK', videoElement.currentTime);
};

const notifyBackground = (action, time) => {
  if (isRemoteEvent) return; // Prevent feedback loops from server events
  chrome.runtime.sendMessage({ type: 'TO_SERVER', action, time });
};

// 3. Receive Sync commands FROM the server (via background.js)
chrome.runtime.onMessage.addListener((msg) => {
  if (!videoElement) return;

  isRemoteEvent = true; 
  if (msg.type === 'SYNC_PLAY') videoElement.play();
  if (msg.type === 'SYNC_PAUSE') videoElement.pause();
  if (msg.type === 'SYNC_SEEK') videoElement.currentTime = msg.time;
  
  setTimeout(() => { isRemoteEvent = false; }, 200);
});

setInterval(init, 2000); // Netflix loads player lazily