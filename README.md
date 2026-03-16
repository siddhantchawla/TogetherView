# TogetherView

<p align="center">
  <img src="extension/icons/image-128.png" alt="TogetherView Logo" width="96" />
</p>

### _Watch Netflix together, perfectly in sync._

![Chrome Extension MV3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)
![Azure Web PubSub](https://img.shields.io/badge/Azure-Web%20PubSub-0078D4?logo=microsoftazure&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jenmefpfcobifgngmpclopapbjapdceo?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/togetherview/jenmefpfcobifgngmpclopapbjapdceo)

---

## ✨ Features

- 🎬 **Real-time play / pause / seek sync** — every action is mirrored instantly across all viewers
- 🔗 **One-click invite link sharing** — start a party and share a single link
- ⚡ **Low-latency sync via Azure Web PubSub** — WebSocket-based relay keeps everyone frame-perfect
- 🧹 **Clean, minimal popup UI** — no clutter, just the controls you need
- 🔒 **No account required** — just the extension and a Netflix tab

---

## 🔧 How It Works

1. The **host** clicks _Start Party_ in the popup — a room is created and an invite link is generated.
2. The host shares the link with friends.
3. Each **guest** opens the link on their own Netflix tab — the extension auto-joins the room.
4. The guest sends a `GET_STATUS` broadcast; the host responds with the current playback position.
5. From that point on, every play, pause, and seek is broadcast to the Azure Web PubSub group and applied on every client in real time.

```
[Host's Netflix Tab]          [Guest's Netflix Tab]
  page-context.js               page-context.js
       ↕ postMessage                  ↕ postMessage
  content.js                    content.js
       ↕ chrome.runtime               ↕ chrome.runtime
  background.js ←──── WebSocket ────→ background.js
                         ↕
              Azure Web PubSub (cloud relay)
                         ↕
                  Azure Function (negotiate)
```

---

## 🛠 Tech Stack

| Layer                 | Technology                                                   |
| --------------------- | ------------------------------------------------------------ |
| Extension             | Chrome MV3, Vanilla JS                                       |
| Real-time relay       | Azure Web PubSub                                             |
| Backend               | Azure Functions (Node.js)                                    |
| Netflix player access | `window.netflix` player API via injected page-context script |

---

## 🏪 Install from Chrome Web Store

The easiest way to get TogetherView is directly from the Chrome Web Store:

**[👉 Install TogetherView](https://chromewebstore.google.com/detail/togetherview/jenmefpfcobifgngmpclopapbjapdceo)**

No setup required — just install, open Netflix, and start a party.

---

## 📦 Load from GitHub Release

If you want to install a specific version or test a release build without the Chrome Web Store:

1. Go to the [Releases page](https://github.com/siddhantchawla/TogetherView/releases)
2. Download the `togetherView-vX.X.X.zip` asset from the release you want
3. Unzip it to a folder on your machine
4. Open `chrome://extensions` in Chrome
5. Enable **Developer mode** (toggle in the top-right corner)
6. Click **Load unpacked** → select the unzipped folder

> **Note:** Extensions loaded this way won't auto-update. To get updates, repeat the steps above with the latest release.

---

## 🚀 Getting Started (Development)

### Prerequisites

- Node.js 18+
- An Azure account with a **Web PubSub** resource provisioned
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)

### Backend setup

```bash
cd api
npm install
# Add your Azure Web PubSub connection string to local.settings.json
func start
```

`local.settings.json` (not committed — create it yourself):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "WebPubSubConnectionString": "<your-connection-string>"
  }
}
```

### Extension setup

1. Navigate to `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** → select the `extension/` folder.
4. Open Netflix and start any video.
5. Click the **TogetherView** icon → **Start Party**.
6. Copy the invite link and share it with a friend.

### Configuration

The negotiate endpoint URL in `background.js` must point to your running Azure Function:

```javascript
// extension/background.js
const response = await fetch(
  `https://<your-function-url>/api/negotiate?room=${roomID}&userId=${myUserId}`,
);
```

---

## 📁 Project Structure

```
TogetherView/
├── .github/
│   └── workflows/
│       ├── ci.yml               # Lint + manifest validation on PRs
│       └── cd.yml               # Tag-based release + Chrome Web Store publish
├── extension/               # Chrome Extension (MV3)
│   ├── manifest.json        # Extension manifest
│   ├── background.js        # Service worker — state, Azure WebSocket handshake, message relay
│   ├── content.js           # Content script — injected into Netflix pages, handles sync logic
│   ├── page-context.js      # Injected into page context to access window.netflix player API
│   ├── popup.html           # Extension popup UI
│   ├── popup.css            # Popup styles
│   └── popup.js             # Popup logic
└── api/                     # Azure Functions backend
    ├── src/                 # Negotiate endpoint source
    ├── host.json
    └── package.json
```

---

## 🗺 Roadmap

- [x] Chrome Web Store release
- [ ] Show title display
- [ ] Guest count indicator
- [ ] Support for other streaming platforms

---

## 🚀 Releasing

See [RELEASING.md](RELEASING.md) for the release and CI/CD process.

---

## 📄 License

[MIT](LICENSE)

---

## 🔒 Privacy

[Privacy Policy](https://siddhantchawla.github.io/TogetherView/privacy)
