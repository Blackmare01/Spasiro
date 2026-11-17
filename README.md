# Spasiro

Spasiro is a multiplayer space shooter created by Vector Viper, with persistent email-linked pilot accounts, scores, kills, coins, upgrades, and a searchable stats page.

## Run locally

1. Install Node.js 20 or newer.
2. Open PowerShell in this folder and run `npm install` once.
3. Start the server with `npm start`.
4. Open `http://localhost:3000` for the game or `http://localhost:3000/stats.html` for pilot statistics.

The server stores accounts in `data/users.json`. Keep this file to preserve pilot progress. If port 3000 is already occupied, stop the other server process before starting Spasiro.

For production, set both `MODERATOR_CODE` to a private code and `MODERATOR_TOKEN_SECRET` to a long random value in the environment before starting Node. Do not commit either value to GitHub. The local moderator code is `77892321`; production refuses to start without a code. Local development generates a temporary token secret automatically when one is not configured.

## Hosting the online game

The game server keeps connected pilots, game rooms, Socket.IO rooms, and game state in one Node.js process. Its account, team, sprite, and chat files must be on persistent writable storage. Deploy it as one always-on Node service with one running instance, and attach a persistent disk. Set `DATA_DIR` and `UPLOADS_DIR` to directories on that disk. The included `Dockerfile` uses `/var/lib/spasiro` for both.

Vercel Functions and other read-only/serverless hosts are not suitable for durable multiplayer state: function instances can be isolated, and their filesystem is read-only except for temporary storage. If `DATA_DIR` or `UPLOADS_DIR` is not configured and the application bundle is read-only (for example, `/var/task`), the server falls back to a writable temporary directory instead of crashing. Registration and login can work while an instance is alive, but temporary files can be cleared on restart and are not shared between instances. Set both variables to persistent writable storage for durable accounts and uploads. `GET /api/server` reports `dataPersistent: false` when the app has to use temporary storage.

AS, US, and EU are currently room labels on the same server, not separate regional endpoints. Making them physical regions requires deploying a game server in each location and moving accounts, stats, moderation, and cross-server realtime state to shared durable storage.

## Moderator room

Open `http://localhost:3000/moderator.html` and enter the moderator code. In local development the code is `77892321`; production must use a private `MODERATOR_CODE` environment variable. Moderator sessions are saved in this browser and do not expire while the server process remains running. Logging out or restarting the server ends them. Repeated failed code attempts are rate limited.

