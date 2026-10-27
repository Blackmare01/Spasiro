# Spasiro

Spasiro is a multiplayer space shooter created by Vector Viper, with persistent email-linked pilot accounts, scores, kills, coins, upgrades, and a searchable stats page.

## Run locally

1. Install Node.js 20 or newer.
2. Open PowerShell in this folder and run `npm install` once.
3. Start the server with `npm start`.
4. Open `http://localhost:3000` for the game or `http://localhost:3000/stats.html` for pilot statistics.

The server stores accounts in `data/users.json`. Keep this file to preserve pilot progress. If port 3000 is already occupied, stop the other server process before starting Spasiro.

## Moderator room

Open `http://localhost:3000/moderator.html` and enter the moderator code. To use a different code on your server, set `MODERATOR_CODE` before starting Node; the default is stored and checked server-side. Moderator sessions expire after eight hours, and repeated failed code attempts are rate limited.

