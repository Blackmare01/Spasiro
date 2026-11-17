# Spasiro

Spasiro is a real-time multiplayer space shooter with persistent pilot accounts, three match regions, Free for All and Team Deathmatch, friends and direct messages, teams, chat, upgrades, cosmetics, missions, leaderboards, and moderator tools.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://localhost:3000`. Pilot records are stored under `data/`; set `DATA_DIR` and `UPLOADS_DIR` to persistent paths when deploying. Set `MODERATOR_CODE` to a private value before exposing a server.

## Deploy with GitHub and Render

Push this repository to GitHub, then create a Render Blueprint from `render.yaml`. It provisions one always-on Node service and a persistent disk for accounts, uploads, teams, and messages. Keep exactly one game server instance: live matches and Socket.IO state currently live in that process. Set a strong `MODERATOR_CODE` in Render's environment settings. The Render URL serves both the site and game server.

## Optional Vercel frontend

The game server must stay on Render because Vercel Functions do not share this game's long-lived Socket.IO match state or persistent disk. To host only the static client on Vercel, import the GitHub repository and set its **Root Directory** to `public`. In `public/config.js`, set `window.SPASIRO_API_BASE` to the Render service URL (for example `https://spasiro.onrender.com`, with no trailing slash). Set `CLIENT_ORIGIN` on Render to the exact Vercel origin, such as `https://spasiro.vercel.app`, then redeploy both. The same-origin Render setup requires no extra configuration.

`AS`, `US`, and `EU` are currently match-room labels on one host. They are not separate physical regions.

## Persistent cloud storage on Enzonic Deploy

The game can store account and game state in Enzonic Managed PostgreSQL instead of the temporary filesystem. Create a PostgreSQL database in Enzonic Databases, copy its TLS connection string, and add it to the Deploy project's environment as `DATABASE_URL`. Keep the connection string private; do not put it in this repository. Redeploy after saving the environment variable.

At startup, the server creates its tables and loads the saved state. On a new database it seeds the tables from the JSON data files available to that deployment. Accounts, teams, region codes, store items, redeem codes, direct messages, profile photos, and uploaded sprites are then stored in PostgreSQL. Check `/api/server`; the healthy response should include `"dataPersistent":true` and `"storage":"postgres"`.

The Enzonic free database plan can scale to zero when idle; data remains stored and the next connection wakes the database. That first connection can take longer. The free plan's current limits and backup retention are listed on [Enzonic Databases](https://databases.enzonic.com/).

## Accounts and local data

Sign-up uses a username, email, and password. Passwords are stored as salted scrypt hashes; the browser receives a random session token for multiplayer authentication. Without `DATABASE_URL`, local runs use JSON files under `data/`. For a hosted Enzonic deployment, configure PostgreSQL as described above so accounts survive restarts and redeploys.
