# Family Pub Quiz

A cheerful ten-question pub quiz for a host screen and four players on their phones. See [PRD.md](PRD.md) for the requirements.

## How to play

1. Open the site on a laptop or TV — this is the **host screen**. Keep it open for the whole game.
2. Each player scans the QR code with their phone and types their name.
3. When all four have joined, the host presses **Start the quiz**.
4. Players tap an answer on their phone. Once everyone has answered, the correct answer and scoreboard appear.
5. The host presses **Next question** until the final results.

Everyone should be on the same Wi-Fi for the most reliable connections.

## How it works

The site is static, so it runs on GitHub Pages. The host's browser tab runs the game; phones connect straight to it over WebRTC using [PeerJS](https://peerjs.com/). PeerJS's free public server only introduces the devices to each other.

- `index.html` + `js/host.js` — host screen and game logic
- `play.html` + `js/player.js` — player phone screen
- `js/questions.js` — the question bank (first option is the correct one)
- `js/common.js`, `css/style.css` — shared helpers and styles

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. To join from real phones, use your computer's Wi-Fi address instead of `localhost` (for example `http://192.168.1.20:8000`), so the QR code points somewhere the phones can reach.

## Publish on GitHub Pages

In the repository on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, choose `main` and `/ (root)`. The quiz will be at `https://<username>.github.io/easy-computergame/`.
