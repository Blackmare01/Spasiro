# Spasiro Arcade

Spasiro is a free, single-player space arcade game by Team Vector. Fly through an endless asteroid field, dodge and attack drones, collect shields and extra lives, and beat the high score saved on your device. No account or game server is needed.

## Play

Open the site and press **Start Flight**. On desktop, use **← / →** (or **A / D**) to steer and hold **Space** to attack. Press **Esc** to pause. On phones and tablets, hold the on-screen **Left**, **Right**, and **Attack** controls.

Sound effects are synthesized in the browser, so they work offline and no audio files need to be downloaded. The game can be installed as a web app; after its first successful visit, the service worker caches the game shell for offline play. Records use this browser's local storage and do not sync across devices.

## Deploy to Vercel

Import this GitHub repository in Vercel. The included `vercel.json` publishes `public/` as a static site. No database, environment variables, account system, or backend server is needed. You can also use the Vercel CLI with `vercel --prod` after signing in and linking the project.

## Deploy to InfinityFree

This game is a static site and does not need Node.js, PHP, a database, or server-side accounts. In your InfinityFree hosting account, open the website's `htdocs` directory and upload these files directly from `public/`:

- `index.html`
- `arcade.css`
- `arcade.js`
- `icon.svg`
- `manifest.webmanifest`
- `sw.js`
- `.htaccess`

Keep the filenames lowercase and place `index.html` directly in `htdocs`, not inside an extra `public` folder. Open the site's HTTPS address after uploading. Free subdomains on InfinityFree have HTTPS available by default; `.htaccess` redirects HTTP to HTTPS, which is needed for browser offline caching and install support. If using a custom domain, make sure HTTPS is working before enabling the redirect.

The offline game saves scores in each player's browser. Those scores do not sync between devices, and uploading new files does not transfer scores from another host.

The Kode Mono font is loaded from Google Fonts when online. The game falls back to a system monospace font without a network connection.
