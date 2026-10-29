const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);
const MODERATOR_CODE = String(process.env.MODERATOR_CODE || "77892321");
const PUBLIC_REGIONS = ["AS", "US", "EU"];
const PRIVATE_REGIONS = ["AS_private", "US_private", "EU_private"];
const ALL_REGIONS = [...PUBLIC_REGIONS, ...PRIVATE_REGIONS];

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const REDEEM_FILE = path.join(DATA_DIR, "redeem-codes.json");
const TEAMS_FILE = path.join(DATA_DIR, "teams.json");
const REGION_CODES_FILE = path.join(DATA_DIR, "region-codes.json");
const DIRECT_MESSAGES_FILE = path.join(DATA_DIR, "direct-messages.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const SPRITE_DIR = path.join(__dirname, "public", "uploads");
const PROFILE_DIR = path.join(SPRITE_DIR, "profiles");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(SPRITE_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}", "utf8");
if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, "[]", "utf8");
if (!fs.existsSync(REDEEM_FILE)) fs.writeFileSync(REDEEM_FILE, "[]", "utf8");
if (!fs.existsSync(TEAMS_FILE)) fs.writeFileSync(TEAMS_FILE, "[]", "utf8");
if (!fs.existsSync(REGION_CODES_FILE)) fs.writeFileSync(REGION_CODES_FILE, "{}", "utf8");
if (!fs.existsSync(DIRECT_MESSAGES_FILE)) fs.writeFileSync(DIRECT_MESSAGES_FILE, "{}", "utf8");

function loadUsers() { try { return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); } catch { return {}; } }
function loadStore() { try { const value = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")); return Array.isArray(value) ? value : []; } catch { return []; } }
function loadRedeemCodes() { try { const value = JSON.parse(fs.readFileSync(REDEEM_FILE, "utf8")); return Array.isArray(value) ? value : []; } catch { return []; } }
function loadTeams() { try { const value = JSON.parse(fs.readFileSync(TEAMS_FILE, "utf8")); return Array.isArray(value) ? value : []; } catch { return []; } }
function loadRegionCodes() { try { const value = JSON.parse(fs.readFileSync(REGION_CODES_FILE, "utf8")); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
function loadDirectMessages() { try { const value = JSON.parse(fs.readFileSync(DIRECT_MESSAGES_FILE, "utf8")); return value && typeof value === "object" ? value : {}; } catch { return {}; } }
let users = loadUsers();
let storeItems = loadStore();
let redeemCodes = loadRedeemCodes();
let teams = loadTeams();
let regionCodes = loadRegionCodes();
let directMessages = loadDirectMessages();
for (const u of Object.values(users)) {
  u.coins = Number.isFinite(u.coins) ? u.coins : 0;
  u.upgrades = u.upgrades && typeof u.upgrades === "object" ? u.upgrades : {};
  u.upgrades.speed = Number.isFinite(u.upgrades.speed) ? u.upgrades.speed : 0;
  u.upgrades.armor = Number.isFinite(u.upgrades.armor) ? u.upgrades.armor : 0;
  u.upgrades.weapon = Number.isFinite(u.upgrades.weapon) ? u.upgrades.weapon : 0;
  u.inventory = Array.isArray(u.inventory) ? u.inventory : [];
  u.friends = Array.isArray(u.friends) ? u.friends : [];
  u.friendRequests = Array.isArray(u.friendRequests) ? u.friendRequests : [];
  u.friends = Array.isArray(u.friends) ? u.friends : [];
  u.friendRequests = Array.isArray(u.friendRequests) ? u.friendRequests : [];
  u.teamInvites = Array.isArray(u.teamInvites) ? u.teamInvites : [];
  u.spriteId = typeof u.spriteId === "string" ? u.spriteId : null;
  u.banned = u.banned === true;
  u.isModerator = u.isModerator === true;
  u.suspendedUntil = Number(u.suspendedUntil) || 0;
}
let saveTimer = null;
function writeUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8"); }
function saveUsers() { clearTimeout(saveTimer); saveTimer = setTimeout(writeUsers, 100); }
function saveStore() { fs.writeFileSync(STORE_FILE, JSON.stringify(storeItems, null, 2), "utf8"); }
function saveRedeemCodes() { fs.writeFileSync(REDEEM_FILE, JSON.stringify(redeemCodes, null, 2), "utf8"); }
function saveTeams() { fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2), "utf8"); }
function saveRegionCodes() { fs.writeFileSync(REGION_CODES_FILE, JSON.stringify(regionCodes, null, 2), "utf8"); }
function saveDirectMessages() { fs.writeFileSync(DIRECT_MESSAGES_FILE, JSON.stringify(directMessages, null, 2), "utf8"); }
const moderatorLoginFailures = new Map();

const MODERATOR_TOKEN_SECRET = String(process.env.MODERATOR_TOKEN_SECRET || "");

if (!MODERATOR_TOKEN_SECRET) {
  throw new Error("MODERATOR_TOKEN_SECRET is not configured.");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createModeratorToken(payload) {
  const body = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", MODERATOR_TOKEN_SECRET)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyModeratorToken(token) {
  try {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) return null;

    const expected = crypto
      .createHmac("sha256", MODERATOR_TOKEN_SECRET)
      .update(body)
      .digest("base64url");

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    if (!payload.exp || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
function uid() { let id; do { id = "UID-" + crypto.randomBytes(6).toString("hex").toUpperCase(); } while (Object.values(users).some(u => u.uid === id)); return id; }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve({ salt, hash: key.toString("hex") }))); }
function verifyPassword(password, salt, stored) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => { if (err) return reject(err); const a = Buffer.from(stored, "hex"), b = Buffer.from(key.toString("hex"), "hex"); resolve(a.length === b.length && crypto.timingSafeEqual(a, b)); })); }
function cleanName(name) { name = String(name || "Pilot").trim().slice(0, 24); return name || "Pilot"; }
function normalizeRedeemCode(value) { return String(value || "").trim().toUpperCase().replace(/\s+/g, ""); }
function makeRedeemCode(customValue = "") {
  const custom = normalizeRedeemCode(customValue);
  if (custom && !/^[A-Z0-9_-]{4,32}$/.test(custom)) return { error: "Custom codes must be 4-32 letters, numbers, hyphens, or underscores." };
  const code = custom || crypto.randomBytes(6).toString("hex").toUpperCase();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  if (redeemCodes.some(record => record.codeHash === codeHash)) return { error: "That redeem code has already been created. Choose another." };
  return { code, codeHash };
}
function pilotName(u) { const team = teams.find(entry => entry.id === u.teamId); return `${team ? `<${team.name}> ${u.displayName || u.username}` : (u.displayName || u.username)}${u.isModerator ? " (MOD)" : ""}`; }
function cleanEmail(email) { return String(email || "").trim().toLowerCase(); }
function validEmail(email) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function cleanJet(jet) { return ["blue", "red", "yellow", "green"].includes(jet) ? jet : "blue"; }
function cleanJetColor(color) { return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color).toLowerCase() : "#58d8ff"; }
function cleanFlameColor(color) { return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color).toLowerCase() : "#ff9a35"; }
function getUpgrades(u) { return { speed: Math.max(0, Math.min(5, Number(u.upgrades?.speed) || 0)), armor: Math.max(0, Math.min(5, Number(u.upgrades?.armor) || 0)), weapon: Math.max(0, Math.min(5, Number(u.upgrades?.weapon) || 0)) }; }
function userLevel(u) { const earned = 1 + Math.floor((Number(u.score) || 0) / 500); return u.isModerator && Number.isInteger(u.levelOverride) ? Math.max(1, Math.min(10000, u.levelOverride)) : earned; }
function userPayload(u) { const team = teams.find(entry => entry.id === u.teamId); return { uid: u.uid, username: u.username, email: u.email || "", displayName: u.displayName, avatarUrl: u.avatarUrl || "", isModerator: !!u.isModerator, jet: u.jet, jetColor: cleanJetColor(u.jetColor), flameColor: cleanFlameColor(u.flameColor), score: u.score, kills: u.kills, games: u.games, level: userLevel(u), coins: u.coins || 0, upgrades: getUpgrades(u), inventory: u.inventory || [], spriteId: u.spriteId || null, teamId: team?.id || null, teamName: team?.name || "", teamLeader: !!team?.leaderUids?.includes(u.uid) }; }
function moderatorOnly(req, res, next) {
  const token = String(req.get("authorization") || "")
    .replace(/^Bearer\s+/i, "");

  const session = verifyModeratorToken(token);

  if (!session || session.type !== "moderator-session") {
    return res.status(401).json({
      error: "Moderator session expired. Sign in again."
    });
  }

  if (session.uid) {
    const user = findUserByUid(session.uid);

    if (!user?.isModerator || user.banned || user.suspendedUntil > Date.now()) {
      return res.status(401).json({
        error: "Moderator access is no longer valid."
      });
    }
  }

  req.moderatorSession = session;
  next();
}
app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/server", (req, res) => res.json({ online: true, players: players.size }));

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  const displayName = cleanName(req.body.displayName || username);

  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    return res.status(400).json({
      error: "Username must be 3-24 characters: letters, numbers, _, . or -."
    });
  }

  if (!validEmail(email)) {
    return res.status(400).json({
      error: "Enter a valid email address."
    });
  }

  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({
      error: "Password must be 6-128 characters."
    });
  }

  if (users[username]) {
    return res.status(409).json({
      error: "Username already exists on this account database."
    });
  }

  if (Object.values(users).some(u => cleanEmail(u.email) === email)) {
    return res.status(409).json({
      error: "An account already uses this email address."
    });
  }

  const hp = await hashPassword(password);

  users[username] = {
    uid: uid(),
    username,
    email,
    displayName,
    jet: cleanJet(req.body.jet),
    passwordHash: hp.hash,
    salt: hp.salt,
    score: 0,
    kills: 0,
    games: 0,
    coins: 0,
    upgrades: {
      speed: 0,
      armor: 0,
      weapon: 0
    },
    inventory: [],
    friends: [],
    friendRequests: [],
    spriteId: null,
    avatarUrl: "",
    banned: false,
    suspendedUntil: 0,
    createdAt: Date.now()
  };

  saveUsers();

  res.json({
    ok: true,
    ...userPayload(users[username])
  });
});

app.post("/api/mod/login", (req, res) => {
  const address = req.ip || req.socket.remoteAddress || "unknown";
  const attempts = moderatorLoginFailures.get(address);

  if (attempts && attempts.resetAt <= Date.now()) {
    moderatorLoginFailures.delete(address);
  }

  const current = moderatorLoginFailures.get(address);

  if (current && current.count >= 5) {
    return res.status(429).json({
      error: "Too many attempts. Try again in 15 minutes."
    });
  }

  const candidate = Buffer.from(String(req.body.code || ""));
  const expected = Buffer.from(MODERATOR_CODE);

  const valid =
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected);

  if (!valid) {
    const window = current || {
      count: 0,
      resetAt: Date.now() + 15 * 60 * 1000
    };

    window.count += 1;
    moderatorLoginFailures.set(address, window);

    return res.status(401).json({
      error: "Invalid moderator code."
    });
  }

  moderatorLoginFailures.delete(address);

  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;

  const token = createModeratorToken({
    type: "moderator-session",
    uid: null,
    exp: expiresAt
  });

  res.json({
    token,
    expiresAt
  });
});

app.post("/api/password/reset", async (req, res) => {
  const identifier = String(req.body.username || "").trim().toLowerCase();
  const resetCode = String(req.body.resetCode || "").trim();
  const password = String(req.body.password || "");

  const u = identifier.includes("@")
    ? Object.values(users).find(
        account => cleanEmail(account.email) === identifier
      )
    : users[identifier];

  if (
    !u ||
    !u.passwordReset ||
    u.passwordReset.expiresAt <= Date.now() ||
    !(await verifyPassword(
      resetCode,
      u.passwordReset.salt,
      u.passwordReset.hash
    ))
  ) {
    return res.status(400).json({
      error: "Invalid or expired recovery code. Ask a moderator for a new one."
    });
  }

  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({
      error: "New password must be 6-128 characters."
    });
  }

  const hp = await hashPassword(password);

  u.passwordHash = hp.hash;
  u.salt = hp.salt;
  delete u.passwordReset;

  saveUsers();

  res.json({
    ok: true,
    message: "Password changed. You can now sign in."
  });
});

app.post("/api/login", async (req, res) => {
  const identifier = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = identifier.includes("@")
    ? Object.values(users).find(
        account => cleanEmail(account.email) === identifier
      )
    : users[identifier];

  if (!user || !(await verifyPassword(password, user.salt, user.passwordHash))) {
    return res.status(401).json({
      error: "Invalid username or password."
    });
  }

  if (user.banned) {
    return res.status(403).json({
      error: "This account is banned."
    });
  }

  if (user.suspendedUntil > Date.now()) {
    return res.status(403).json({
      error: `This account is suspended until ${new Date(
        user.suspendedUntil
      ).toLocaleString()}.`
    });
  }

  res.json({
    ok: true,
    ...userPayload(user)
  });
});

app.post("/api/mod/login", (req, res) => {
  const address = req.ip || req.socket.remoteAddress || "unknown";
  const attempts = moderatorLoginFailures.get(address);

  if (attempts && attempts.resetAt <= Date.now()) {
    moderatorLoginFailures.delete(address);
  }

  const current = moderatorLoginFailures.get(address);

  if (current && current.count >= 5) {
    return res.status(429).json({
      error: "Too many attempts. Try again in 15 minutes."
    });
  }

  const candidate = Buffer.from(String(req.body.code || ""));
  const expected = Buffer.from(MODERATOR_CODE);

  const valid =
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected);

  if (!valid) {
    const window = current || {
      count: 0,
      resetAt: Date.now() + 15 * 60 * 1000
    };

    window.count += 1;
    moderatorLoginFailures.set(address, window);

    return res.status(401).json({
      error: "Invalid moderator code."
    });
  }

  moderatorLoginFailures.delete(address);

  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;

  const token = createModeratorToken({
    type: "moderator-session",
    uid: null,
    exp: expiresAt
  });

  res.json({
    token,
    expiresAt
  });
});

app.post("/api/password/reset", async (req, res) => {
  const identifier = String(req.body.username || "").trim().toLowerCase();
  const resetCode = String(req.body.resetCode || "").trim();
  const password = String(req.body.password || "");

  const u = identifier.includes("@")
    ? Object.values(users).find(
        account => cleanEmail(account.email) === identifier
      )
    : users[identifier];

  if (
    !u ||
    !u.passwordReset ||
    u.passwordReset.expiresAt <= Date.now() ||
    !(await verifyPassword(
      resetCode,
      u.passwordReset.salt,
      u.passwordReset.hash
    ))
  ) {
    return res.status(400).json({
      error: "Invalid or expired recovery code. Ask a moderator for a new one."
    });
  }

  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({
      error: "New password must be 6-128 characters."
    });
  }

  const hp = await hashPassword(password);

  u.passwordHash = hp.hash;
  u.salt = hp.salt;
  delete u.passwordReset;

  saveUsers();

  res.json({
    ok: true,
    message: "Password changed. You can now sign in."
  });
});

app.post("/api/login", async (req, res) => {
  const identifier = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = identifier.includes("@")
    ? Object.values(users).find(
        account => cleanEmail(account.email) === identifier
      )
    : users[identifier];

  if (!user || !(await verifyPassword(password, user.salt, user.passwordHash))) {
    return res.status(401).json({
      error: "Invalid username or password."
    });
  }

  if (user.banned) {
    return res.status(403).json({
      error: "This account is banned."
    });
  }

  if (user.suspendedUntil > Date.now()) {
    return res.status(403).json({
      error: `This account is suspended until ${new Date(
        user.suspendedUntil
      ).toLocaleString()}.`
    });
  }

  res.json({
    ok: true,
    ...userPayload(user)
  });
});
  }

  if (user.banned) {
    return res.status(403).json({
      error: "This account is banned."
    });
  }

  if (user.suspendedUntil > Date.now()) {
    return res.status(403).json({
      error: `This account is suspended until ${new Date(user.suspendedUntil).toLocaleString()}.`
    });
  }

  res.json(userPayload(user));
});
app.post("/api/mod/login-player", (req, res) => {
  const ticket = String(req.body.ticket || "");
  const ticketData = verifyModeratorToken(ticket);

  if (!ticketData || ticketData.type !== "moderator-handoff") {
    return res.status(401).json({
      error: "Moderator handoff is invalid or expired. Return to the signed-in game and try again."
    });
  }

  const user = findUserByUid(ticketData.uid);

  if (!user?.isModerator || user.banned || user.suspendedUntil > Date.now()) {
    return res.status(403).json({
      error: "This account no longer has moderator access."
    });
  }

  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;

  const token = createModeratorToken({
    type: "moderator-session",
    uid: user.uid,
    exp: expiresAt
  });

  res.json({ token, expiresAt });
});

app.post("/api/mod/logout", moderatorOnly, (req, res) => {
  res.json({ ok: true });
});

app.get("/api/mod/self/level", moderatorOnly, (req, res) => {
  const user = req.moderatorSession?.uid ? findUserByUid(req.moderatorSession.uid) : null;
  if (!user?.isModerator) return res.json({ linked: false });
  res.json({ linked: true, level: userLevel(user) });
});
app.post("/api/mod/self/level", moderatorOnly, (req, res) => {
  const user = req.moderatorSession?.uid ? findUserByUid(req.moderatorSession.uid) : null;
  if (!user?.isModerator) return res.status(403).json({ error: "Open the moderator room from your signed-in moderator account to change your own level." });
  const level = Number(req.body.level);
  if (!Number.isInteger(level) || level < 1 || level > 10000) return res.status(400).json({ error: "Choose a whole-number level from 1 to 10,000." });
  user.levelOverride = level;
  saveUsers();
  const player = [...players.values()].find(candidate => candidate.uid === user.uid);
  if (player) { player.level = level; pushAccountUpdate(user); }
  res.json({ ok: true, level });
});

app.get("/api/mod/overview", moderatorOnly, (req, res) => {
  const files = [USERS_FILE, STORE_FILE, REDEEM_FILE, TEAMS_FILE, REGION_CODES_FILE, DIRECT_MESSAGES_FILE];
  let storageBytes = files.reduce((sum, file) => { try { return sum + fs.statSync(file).size; } catch { return sum; } }, 0);
  function addDirectoryBytes(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) addDirectoryBytes(fullPath);
      else storageBytes += fs.statSync(fullPath).size;
    }
  }
  addDirectoryBytes(SPRITE_DIR);
  addDirectoryBytes(BACKUP_DIR);
  const backupCount = fs.readdirSync(BACKUP_DIR, { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
  res.json({
    pilots: Object.keys(users).length,
    banned: Object.values(users).filter(user => user.banned).length,
    suspended: Object.values(users).filter(user => user.suspendedUntil > Date.now()).length,
    restricted: Object.values(users).filter(user => user.banned || user.suspendedUntil > Date.now()).length,
    online: players.size,
    sprites: storeItems.length,
    storageBytes,
    backups: backupCount
  });
});

app.get("/api/mod/users", moderatorOnly, (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  const pilots = Object.values(users).map(user => ({
    uid: user.uid, username: user.username, name: user.displayName, isModerator: !!user.isModerator, email: user.email || "",
    score: user.score || 0, kills: user.kills || 0, coins: user.coins || 0,
    banned: !!user.banned, suspendedUntil: user.suspendedUntil || 0
  })).filter(user => !query || [user.uid, user.username, user.name, user.email].some(value => String(value).toLowerCase().includes(query)));
  res.json({ pilots });
});

app.post("/api/mod/users/:uid/moderator", moderatorOnly, (req, res) => {
  const user = Object.values(users).find(candidate => candidate.uid === req.params.uid);
  if (!user) return res.status(404).json({ error: "Pilot account not found." });
  user.isModerator = req.body.isModerator === true;
  if (user.isModerator) {
    user.inventory = Array.isArray(user.inventory) ? user.inventory : [];
    for (const item of storeItems) if (!user.inventory.includes(item.id)) user.inventory.push(item.id);
  }
  saveUsers();
  for (const player of players.values()) if (player.uid === user.uid) { player.name = pilotName(user); player.isModerator = user.isModerator; player.level = userLevel(user); if (user.isModerator) player.inventory = user.inventory; if (!user.isModerator) { player.isInvisible = false; player.spectateTargetId = null; } io.to(player.id).emit("accountUpdate", userPayload(user)); }
  res.json({ ok: true, isModerator: user.isModerator });
});

app.post("/api/mod/users/:uid/password-reset", moderatorOnly, async (req, res) => {
  const user = Object.values(users).find(candidate => candidate.uid === req.params.uid);
  if (!user) return res.status(404).json({ error: "Pilot account not found." });
  const resetCode = crypto.randomBytes(6).toString("hex").toUpperCase();
  const hp = await hashPassword(resetCode);
  user.passwordReset = { salt: hp.salt, hash: hp.hash, expiresAt: Date.now() + 30 * 60 * 1000 };
  saveUsers();
  res.json({ ok: true, resetCode, expiresAt: user.passwordReset.expiresAt });
});

app.post("/api/mod/users/:uid/status", moderatorOnly, (req, res) => {
  const user = Object.values(users).find(candidate => candidate.uid === req.params.uid);
  if (!user) return res.status(404).json({ error: "Pilot account not found." });
  const action = String(req.body.action || "");
  if (user.isModerator && ["ban", "suspend"].includes(action)) return res.status(403).json({ error: "Remove the MOD designation before restricting this account." });
  if (action === "ban") user.banned = true;
  else if (action === "unban") user.banned = false;
  else if (action === "suspend") {
    const minutes = Math.floor(Number(req.body.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600) return res.status(400).json({ error: "Suspension must be 1 minute to 365 days." });
    user.suspendedUntil = Date.now() + minutes * 60 * 1000;
  } else if (action === "unsuspend") user.suspendedUntil = 0;
  else return res.status(400).json({ error: "Unsupported moderation action." });
  saveUsers();
  if (user.banned || user.suspendedUntil > Date.now()) {
    for (const player of players.values()) if (player.uid === user.uid) io.sockets.sockets.get(player.id)?.disconnect(true);
  }
  res.json({ ok: true, pilot: { uid: user.uid, banned: user.banned, suspendedUntil: user.suspendedUntil } });
});

app.get("/api/shop/sprites", (req, res) => res.json({ items: storeItems }));

app.post("/api/mod/items", moderatorOnly, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 32);
  const distribution = String(req.body.distribution || "shop");
  const price = distribution === "shop" ? Math.floor(Number(req.body.price)) : 100;
  const preparedCode = distribution === "redeem" ? makeRedeemCode(req.body.code) : null;
  const imageMatch = String(req.body.png || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (name.length < 2) return res.status(400).json({ error: "Sprite name must have at least 2 characters." });
  if (!["shop", "redeem"].includes(distribution)) return res.status(400).json({ error: "Choose Shop or Redeem Code distribution." });
  if (distribution === "shop" && (!Number.isSafeInteger(price) || price < 1 || price > 1000000)) return res.status(400).json({ error: "Price must be between 1 and 1,000,000 coins." });
  if (preparedCode?.error) return res.status(400).json({ error: preparedCode.error });
  if (!imageMatch) return res.status(400).json({ error: "Choose a valid PNG sprite." });
  const image = Buffer.from(imageMatch[1], "base64");
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (image.length > 2 * 1024 * 1024 || image.length < 24 || !image.subarray(0, 8).equals(pngSignature) || image.toString("ascii", 12, 16) !== "IHDR") return res.status(400).json({ error: "PNG must be valid and no larger than 2 MB." });
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
  if (!width || !height || width > 1024 || height > 1024) return res.status(400).json({ error: "Sprite dimensions must be between 1 and 1024 pixels." });
  const id = crypto.randomBytes(9).toString("hex");
  const filename = `sprite-${id}.png`;
  fs.writeFileSync(path.join(SPRITE_DIR, filename), image, { flag: "wx" });
  const item = { id, name, price, distribution, available: distribution === "shop", imageUrl: `/uploads/${filename}`, width, height, createdAt: Date.now() };
  storeItems.push(item);
  saveStore();
  if (preparedCode) redeemCodes.push({ codeHash: preparedCode.codeHash, spriteId: item.id, createdAt: Date.now(), redeemedBy: null, redeemedAt: null });
  if (preparedCode) saveRedeemCodes();
  for (const user of Object.values(users)) if (user.isModerator) {
    user.inventory = Array.isArray(user.inventory) ? user.inventory : [];
    if (!user.inventory.includes(item.id)) user.inventory.push(item.id);
  }
  if (Object.values(users).some(user => user.isModerator)) saveUsers();
  for (const player of players.values()) if (player.isModerator) {
    player.inventory = Object.values(users).find(user => user.uid === player.uid)?.inventory || player.inventory;
    io.to(player.id).emit("accountUpdate", userPayload(findUserByUid(player.uid)));
  }
  res.json({ ok: true, item, ...(preparedCode ? { code: preparedCode.code } : {}) });
});

app.post("/api/mod/redeem-codes", moderatorOnly, (req, res) => {
  const item = storeItems.find(entry => entry.id === String(req.body.spriteId || ""));
  if (!item || (item.distribution !== "redeem" && item.available === false)) return res.status(400).json({ error: "Choose a sprite that is currently listed in the shop or set up for redemption." });
  const preparedCode = makeRedeemCode(req.body.code);
  if (preparedCode.error) return res.status(400).json({ error: preparedCode.error });
  const { code, codeHash } = preparedCode;
  redeemCodes.push({ codeHash, spriteId: item.id, createdAt: Date.now(), redeemedBy: null, redeemedAt: null });
  saveRedeemCodes();
  res.json({ ok: true, code, sprite: item.name });
});

app.post("/api/mod/items/:id/listing", moderatorOnly, (req, res) => {
  const item = storeItems.find(entry => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Sprite not found." });
  item.available = req.body.available === true;
  saveStore();
  res.json({ ok: true, item: { id: item.id, available: item.available } });
});

app.get("/api/mod/region-codes", moderatorOnly, (req, res) => {
  res.json({ regions: PRIVATE_REGIONS.map(region => ({ region, enabled: !!regionCodes[region] })) });
});
app.post("/api/mod/region-codes", moderatorOnly, (req, res) => {
  const region = String(req.body.region || "");
  if (!PRIVATE_REGIONS.includes(region)) return res.status(400).json({ error: "Choose AS_private, US_private, or EU_private." });
  const accessCode = crypto.randomBytes(6).toString("hex").toUpperCase();
  regionCodes[region] = crypto.createHash("sha256").update(normalizeRedeemCode(accessCode)).digest("hex");
  saveRegionCodes();
  res.json({ ok: true, region, accessCode });
});
app.delete("/api/mod/region-codes/:region", moderatorOnly, (req, res) => {
  if (!PRIVATE_REGIONS.includes(req.params.region)) return res.status(400).json({ error: "Unknown private region." });
  delete regionCodes[req.params.region];saveRegionCodes();res.json({ ok: true });
});

app.post("/api/mod/backup", moderatorOnly, (req, res) => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; writeUsers(); }
  const backupId = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(BACKUP_DIR, backupId);
  fs.mkdirSync(destination, { recursive: false });
  fs.copyFileSync(USERS_FILE, path.join(destination, "users.json"));
  fs.copyFileSync(STORE_FILE, path.join(destination, "store.json"));
  fs.copyFileSync(REDEEM_FILE, path.join(destination, "redeem-codes.json"));
  fs.copyFileSync(TEAMS_FILE, path.join(destination, "teams.json"));
  fs.copyFileSync(REGION_CODES_FILE, path.join(destination, "region-codes.json"));
  fs.copyFileSync(DIRECT_MESSAGES_FILE, path.join(destination, "direct-messages.json"));
  fs.cpSync(SPRITE_DIR, path.join(destination, "uploads"), { recursive: true });
  res.json({ ok: true, backup: backupId });
});

app.get("/api/leaderboard", (req, res) => res.json(Object.values(users).sort((a,b)=>b.score-a.score).slice(0,20).map(u=>({uid:u.uid,name:pilotName(u),score:u.score,kills:u.kills,games:u.games}))));
app.get("/api/teams/stats", (req, res) => {
  const rows = teams.map(team => {
    const members = Object.values(users).filter(user => user.teamId === team.id);
    return { id: team.id, name: team.name, members: members.length, score: members.reduce((sum, user) => sum + (Number(user.score) || 0), 0), kills: members.reduce((sum, user) => sum + (Number(user.kills) || 0), 0), leaders: members.filter(user => team.leaderUids?.includes(user.uid)).map(user => user.displayName || user.username), createdAt: team.createdAt };
  }).sort((a, b) => b.score - a.score || b.kills - a.kills);
  res.json({ teams: rows, totals: { teams: rows.length, members: rows.reduce((sum, team) => sum + team.members, 0), score: rows.reduce((sum, team) => sum + team.score, 0), kills: rows.reduce((sum, team) => sum + team.kills, 0) } });
});
app.get("/api/teams/:id", (req, res) => {
  const team = teams.find(entry => entry.id === req.params.id);
  if (!team) return res.status(404).json({ error: "Team not found." });
  const members = Object.values(users).filter(user => user.teamId === team.id).map(user => ({ uid: user.uid, name: user.displayName || user.username, level: userLevel(user), leader: team.leaderUids?.includes(user.uid) }));
  res.json({ team: { id: team.id, name: team.name, members, leaders: members.filter(member => member.leader).map(member => member.uid) } });
});
app.get("/api/mod/online", moderatorOnly, (req, res) => {
  res.json({ pilots: [...players.values()].filter(player=>!player.inMainMenu).map(player => ({ uid: player.uid, name: player.name, region: player.region, mode: player.matchMode, isModerator: player.isModerator, isInvisible: player.isInvisible })) });
});
app.post("/api/mod/players/:uid/invisibility", moderatorOnly, (req, res) => {
  const user = findUserByUid(req.params.uid);
  if (!user?.isModerator) return res.status(403).json({ error: "Only designated moderator pilots can use invisible mode." });
  const player = [...players.values()].find(candidate => candidate.uid === user.uid);
  if (!player) return res.status(404).json({ error: "Moderator pilot is not online." });
  player.isInvisible = req.body.enabled === true;
  if (player.isInvisible) player.input.shoot = false;
  res.json({ ok: true, isInvisible: player.isInvisible });
});
app.get("/api/mod/observe", moderatorOnly, (req, res) => {
  const player = [...players.values()].find(candidate => candidate.uid === String(req.query.uid || "")&&!candidate.inMainMenu);
  if (!player) return res.status(404).json({ error: "Choose an online pilot to spectate." });
  const room = roomFor(player.roomKey), viewer = { isModerator: true };
  res.json({ targetId: player.id, room: player.roomKey, world: WORLD, entities: allEntities(player.roomKey).filter(entity => canSeeInvisible(viewer, entity)), bullets: [...room.bullets.values()], asteroids: [...room.asteroids.values()], supplies: [...room.supplies.values()], match: { mode: room.mode, score: room.score } });
});
app.get("/api/stats", (req, res) => {
  const pilots = Object.values(users).map(u => ({
    uid: u.uid, name: pilotName(u), score: Number(u.score) || 0,
    kills: Number(u.kills) || 0, games: Number(u.games) || 0,
    level: userLevel(u)
  })).sort((a, b) => b.score - a.score || b.kills - a.kills);
  res.json({
    updatedAt: Date.now(),
    totals: {
      pilots: pilots.length,
      score: pilots.reduce((sum, p) => sum + p.score, 0),
      kills: pilots.reduce((sum, p) => sum + p.kills, 0),
      sorties: pilots.reduce((sum, p) => sum + p.games, 0)
    },
    pilots
  });
});
app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint not found" }));

let players = new Map();
const spectators = new Map();
const gameRooms = new Map();
const privateModes = Object.fromEntries(PRIVATE_REGIONS.map(region => [region, "ffa"]));
let nextId = 1;
const WORLD = { w: 2400, h: 1400 };
const UPGRADE_COSTS = [100, 250, 500, 1000, 2000];
function rand(a,b){return Math.random()*(b-a)+a;}
function roomFor(roomKey) {
  if (!gameRooms.has(roomKey)) {
    const room = { key: roomKey, asteroids: new Map(), bullets: new Map(), supplies: new Map(), mode: roomKey.endsWith(":tdm") ? "tdm" : "ffa", score: { red: 0, blue: 0 }, nextSupplyAt: Date.now() + 5000 };
    gameRooms.set(roomKey, room);
    for (let i=0;i<22;i++) addAsteroid(room);
  }
  return gameRooms.get(roomKey);
}
function addAsteroid(room){const id="a"+(nextId++);room.asteroids.set(id,{id,x:rand(50,WORLD.w-50),y:rand(50,WORLD.h-50),size:Math.random()<.65?48:70,kind:Math.random()<.5?1:2,vx:rand(-.45,.45),vy:rand(-.45,.45)});}
function allEntities(roomKey){return [...players.values()].filter(p=>p.roomKey===roomKey&&!p.inMainMenu).map(p=>({id:p.id,uid:p.uid,name:p.name,isModerator:p.isModerator,isInvisible:!!p.isInvisible,jet:p.jet,jetColor:p.jetColor,flameColor:p.flameColor,avatarUrl:p.avatarUrl||"",spriteId:p.spriteId,x:p.x,y:p.y,angle:p.angle,hp:p.hp,maxHp:p.maxHp,score:p.score,kills:p.kills,level:p.level,moving:Math.hypot(p.vx,p.vy)>28,side:p.side,bot:false}));}
function findUserByUid(v){return Object.values(users).find(x=>x.uid===v);}
function spawnPlayer(socket,u,region,matchMode,roomKey,inMainMenu=false){
  const upgrades=getUpgrades(u);u.inventory=Array.isArray(u.inventory)?u.inventory:[];
  if(u.isModerator)for(const item of storeItems)if(!u.inventory.includes(item.id))u.inventory.push(item.id);
  const room=roomFor(roomKey),members=[...players.values()].filter(player=>player.roomKey===roomKey&&!player.inMainMenu);
  const red=members.filter(player=>player.side==="red").length,blue=members.length-red;
  const p={id:socket.id,uid:u.uid,name:pilotName(u),isModerator:!!u.isModerator,isInvisible:false,inMainMenu,roomKey,region,matchMode,side:matchMode==="tdm"?(red<=blue?"red":"blue"):null,jet:u.jet,jetColor:cleanJetColor(u.jetColor),flameColor:cleanFlameColor(u.flameColor),avatarUrl:u.avatarUrl||"",spriteId:u.spriteId||null,inventory:u.inventory,x:rand(180,WORLD.w-180),y:rand(180,WORLD.h-180),angle:-Math.PI/2,hp:100+upgrades.armor*15,maxHp:100+upgrades.armor*15,score:u.score,kills:u.kills,coins:u.coins||0,level:userLevel(u),upgrades,vx:0,vy:0,input:{up:false,left:false,right:false,down:false,shoot:false},cooldown:0,respawn:0,weaponBoostUntil:0};
  players.set(socket.id,p);if(!inMainMenu)u.games+=1;saveUsers();return p;
}
function syncUserFromPlayer(p){const u=findUserByUid(p.uid);if(!u)return;u.coins=Math.max(0,Math.floor(p.coins));u.score=Math.max(0,Math.floor(p.score));u.kills=Math.max(0,Math.floor(p.kills));u.upgrades=getUpgrades(p);u.jet=cleanJet(p.jet);u.spriteId=p.spriteId||null;u.inventory=p.inventory||u.inventory||[];saveUsers();}
function teamRoom(id){return `team:${id}`;}
function refreshTeamPlayers(team){for(const player of players.values()){const user=findUserByUid(player.uid);if(!user)continue;if(user.teamId===team?.id||(!team&&player.teamId)){player.teamId=user.teamId||null;player.name=pilotName(user);}}}
function teamRoster(team){return Object.values(users).filter(user=>user.teamId===team.id).map(user=>({uid:user.uid,name:user.displayName||user.username,leader:team.leaderUids.includes(user.uid),online:[...players.values()].some(player=>player.uid===user.uid)}));}
function leaveTeam(user,socket){const old=teams.find(team=>team.id===user.teamId);if(old){old.memberUids=old.memberUids.filter(uid=>uid!==user.uid);old.leaderUids=old.leaderUids.filter(uid=>uid!==user.uid);if(!old.memberUids.length)teams=teams.filter(team=>team.id!==old.id);else if(!old.leaderUids.length)old.leaderUids=[old.memberUids[0]];socket?.leave(teamRoom(old.id));saveTeams();}user.teamId=null;}
function pushAccountUpdate(user){for(const player of players.values())if(player.uid===user.uid){player.name=pilotName(user);player.teamId=user.teamId||null;player.inventory=user.inventory||player.inventory;io.to(player.id).emit("accountUpdate",userPayload(user));}}
function canSeeInvisible(viewer,entity){return !entity.isInvisible||viewer?.isModerator||viewer?.uid===entity.uid;}
function isUserOnline(userUid){return [...players.values()].some(player=>player.uid===userUid)||[...spectators.values()].some(viewer=>viewer.uid===userUid);}
function teamInvitesPayload(user){const previous=user.teamInvites||[],valid=previous.filter(invite=>{const team=teams.find(entry=>entry.id===invite.teamId);return team&&team.leaderUids.includes(invite.fromUid)&&!user.teamId;});if(valid.length!==previous.length){user.teamInvites=valid;saveUsers();}return valid.map(invite=>{const team=teams.find(entry=>entry.id===invite.teamId),leader=findUserByUid(invite.fromUid);return {teamId:team.id,teamName:team.name,leaderName:leader?.displayName||leader?.username||"Team leader",createdAt:invite.createdAt};});}
function emitTeamInvites(user){emitToUser(user.uid,"team:invites",teamInvitesPayload(user));}
function publicFriendProfile(user){return {uid:user.uid,username:user.username,name:pilotName(user),avatarUrl:user.avatarUrl||"",level:userLevel(user),online:isUserOnline(user.uid)};}
function directConversationKey(uidA,uidB){return [String(uidA),String(uidB)].sort().join(":");}
function areFriends(userA,userB){return !!userA&&!!userB&&(userA.friends||[]).includes(userB.uid)&&(userB.friends||[]).includes(userA.uid);}
function friendsPayload(user){return {friends:(user.friends||[]).map(findUserByUid).filter(Boolean).map(publicFriendProfile),incoming:(user.friendRequests||[]).map(request=>findUserByUid(request.fromUid)).filter(Boolean).map(publicFriendProfile),outgoing:Object.values(users).filter(other=>(other.friendRequests||[]).some(request=>request.fromUid===user.uid)).map(publicFriendProfile)};}
function emitToUser(userUid,event,payload){for(const client of io.sockets.sockets.values())if(client.data.uid===userUid)client.emit(event,payload);}
function emitFriendsData(user){emitToUser(user.uid,"friends:data",friendsPayload(user));}
function attachChatRoom(socket,region,matchMode,isPrivate){if(socket.data.chatRoom)socket.leave(socket.data.chatRoom);const room=isPrivate?`private-chat:${region}`:`public-chat:${region}:${matchMode}`;socket.data.chatRoom=room;socket.join(room);}
function privateSystemMessage(region,text){io.to(`private-chat:${region}`).emit("chat:message",{channel:"system",name:"SERVER",text,at:Date.now()});}
function resolvePrivatePilot(region,rawName){const query=String(rawName||"").trim().toLowerCase();if(!query)return {error:"Enter a player name."};const matches=[...players.values()].filter(player=>player.region===region&&!player.inMainMenu).filter(player=>{const user=findUserByUid(player.uid);return [player.name,user?.username,user?.displayName,player.uid].some(value=>String(value||"").trim().toLowerCase()===query);});if(matches.length>1)return {error:"That name matches more than one player. Use their exact username or UID."};if(!matches.length)return {error:"That player is not currently in this private server."};return {player:matches[0]};}
function handlePrivateChatCommand(socket,text){
  const modeMatch=text.match(/^\/?game-mode(?:\s+to)?\s+(ffa|tdm)$/i);
  const assignMatch=text.match(/^\/?game-group\s+(.+?)\s+to\s+([12])$/i);
  const removeMatch=text.match(/^\/?game-group\s+(.+?)\s+remove\s+from\s*([12])$/i);
  const addPlayerMatch=text.match(/^\/?add\s+player\s+to\s+game(?:\s+(.+))?$/i);
  const resetGameMatch=/^\/?reset(?:\s+game)?$/i.test(text);
  const serverDownMatch=/^\/?server\s+down$/i.test(text);
  if(!modeMatch&&!assignMatch&&!removeMatch&&!addPlayerMatch&&!resetGameMatch&&!serverDownMatch)return false;
  const region=socket.data.region,player=players.get(socket.id),isPrivate=PRIVATE_REGIONS.includes(region);
  if(!isPrivate){socket.emit("chat:error","These commands work only in a private server's region chat.");return true;}
  if(resetGameMatch||serverDownMatch){
    const user=findUserByUid(socket.data.uid);if(!user?.isModerator){socket.emit("chat:error","Only designated moderators can use this command.");return true;}
    if(serverDownMatch){
      privateSystemMessage(region,"A moderator shut down this private server. Its access code has been revoked.");delete regionCodes[region];saveRegionCodes();
      for(const client of [...io.sockets.sockets.values()])if(client.data.region===region)client.disconnect(true);
      return true;
    }
    const mode=privateModes[region]||"ffa",room=roomFor(`${region}:${mode}`);room.bullets.clear();room.supplies.clear();room.asteroids.clear();room.score={red:0,blue:0};for(let i=0;i<22;i++)addAsteroid(room);
    for(const active of players.values())if(active.region===region&&!active.inMainMenu){active.x=rand(180,WORLD.w-180);active.y=rand(180,WORLD.h-180);active.vx=0;active.vy=0;active.hp=active.maxHp;active.angle=-Math.PI/2;active.input={up:false,down:false,left:false,right:false,shoot:false};active.cooldown=0;active.respawn=0;}
    privateSystemMessage(region,"A moderator reset the game. Players remain connected.");return true;
  }
  if(!socket.data.privateAdmin||socket.data.privateSpectator||!player||player.inMainMenu){socket.emit("chat:error","Only a player who joined this private server with its access code can use admin commands.");return true;}
  if(addPlayerMatch){
    const query=String(addPlayerMatch[1]||"").trim().toLowerCase();if(!query){socket.emit("chat:error","Usage: /add player to game <player name, username, or UID>.");return true;}
    const matches=[...spectators.values()].filter(observer=>observer.region===region).filter(observer=>{const user=findUserByUid(observer.uid);return [user?.username,user?.displayName,observer.uid].some(value=>String(value||"").trim().toLowerCase()===query);});
    if(matches.length>1){socket.emit("chat:error","That name matches more than one spectator. Use their exact username or UID.");return true;}
    if(!matches.length){socket.emit("chat:error","No matching spectator is currently in this private server.");return true;}
    const observer=matches[0],targetSocket=io.sockets.sockets.get(observer.id),user=findUserByUid(observer.uid);if(!targetSocket||!user){spectators.delete(observer.id);socket.emit("chat:error","That spectator is no longer connected.");return true;}
    const matchMode=privateModes[region]||"ffa",roomKey=`${region}:${matchMode}`;spectators.delete(observer.id);const activePlayer=spawnPlayer(targetSocket,user,region,matchMode,roomKey,false);
    targetSocket.data.region=region;targetSocket.data.matchMode=matchMode;targetSocket.data.roomKey=roomKey;targetSocket.data.privateSpectator=false;targetSocket.data.privateAdmin=false;targetSocket.emit("player:playResult",{ok:true,region,matchMode,privateSpectator:false,account:userPayload(user)});
    privateSystemMessage(region,`${pilotName(user)} was added to the game by the server code holder.`);return true;
  }
  if(modeMatch){
    const mode=modeMatch[1].toLowerCase(),previous=privateModes[region]||"ffa";if(mode===previous){privateSystemMessage(region,`Game mode is already ${mode.toUpperCase()}.`);return true;}
    privateModes[region]=mode;const nextKey=`${region}:${mode}`,room=roomFor(nextKey);room.mode=mode;room.score={red:0,blue:0};room.bullets.clear();
    const members=[...players.values()].filter(candidate=>candidate.region===region&&!candidate.inMainMenu);let red=0,blue=0;
    for(const member of members){member.roomKey=nextKey;member.matchMode=mode;if(mode==="tdm"){if(red<=blue){member.side="red";red++;}else{member.side="blue";blue++;}}else member.side=null;member.vx=0;member.vy=0;const client=io.sockets.sockets.get(member.id);if(client){client.data.roomKey=nextKey;client.data.matchMode=mode;client.emit("private:mode",{region,matchMode:mode});}}
    for(const observer of spectators.values())if(observer.region===region){observer.roomKey=nextKey;observer.matchMode=mode;const client=io.sockets.sockets.get(observer.id);if(client){client.data.roomKey=nextKey;client.data.matchMode=mode;client.emit("private:mode",{region,matchMode:mode});}}
    privateSystemMessage(region,`Game mode changed to ${mode==="ffa"?"Free for All":"Team Deathmatch"}. Team scores reset.`);return true;
  }
  if((assignMatch||removeMatch)&&privateModes[region]!=="tdm"){privateSystemMessage(region,"Set game mode to TDM before assigning team groups.");return true;}
  const match=assignMatch||removeMatch,result=resolvePrivatePilot(region,match[1]);if(result.error){socket.emit("chat:error",result.error);return true;}
  const target=result.player,side=match[2]==="1"?"red":"blue";
  if(assignMatch){target.side=side;privateSystemMessage(region,`${target.name} was assigned to group ${match[2]}.`);}
  else if(target.side!==side){privateSystemMessage(region,`${target.name} is not currently in group ${match[2]}.`);}
  else{target.side=null;privateSystemMessage(region,`${target.name} was removed from group ${match[2]}.`);}
  return true;
}

io.on("connection",socket=>{
  socket.on("network:ping",(sentAt,ack)=>{if(typeof ack==="function")ack(Number(sentAt)||Date.now());});
  socket.on("auth",data=>{
    const username=String(data?.username||"").trim().toLowerCase(),u=users[username];
    if(!u||String(data?.uid||"")!==u.uid)return socket.emit("authError","Account authentication failed. Sign in again.");
    if(u.banned)return socket.emit("authError","This pilot account is banned.");
    if(u.suspendedUntil>Date.now())return socket.emit("authError",`This pilot account is suspended until ${new Date(u.suspendedUntil).toLocaleString()}.`);
    const region=String(data?.region||"AS");let matchMode=String(data?.matchMode||"ffa");
    if(!ALL_REGIONS.includes(region))return socket.emit("authError","Choose a valid server region.");
    if(!["ffa","tdm"].includes(matchMode))return socket.emit("authError","Choose Free for All or Team Deathmatch.");
    const privateRegion=PRIVATE_REGIONS.includes(region),privateCode=normalizeRedeemCode(data?.regionCode);
    let privateSpectator=privateRegion&&!privateCode;socket.data.privateAdmin=false;
    if(privateRegion&&privateCode){const provided=crypto.createHash("sha256").update(privateCode).digest("hex"),expected=regionCodes[region]||"";if(!expected||provided!==expected)return socket.emit("authError","That private-region code is invalid or has been revoked.");privateSpectator=false;socket.data.privateAdmin=true;}
    if(privateRegion)matchMode=privateModes[region]||"ffa";
    for(const old of [...players.values(),...spectators.values()])if(old.uid===u.uid)io.sockets.sockets.get(old.id)?.disconnect(true);
    const publicRegion=privateRegion?region.slice(0,-8):region,roomKey=`${privateRegion?region:publicRegion}:${matchMode}`;
    roomFor(roomKey);socket.data.uid=u.uid;socket.data.region=region;socket.data.matchMode=matchMode;socket.data.roomKey=roomKey;socket.data.isModerator=!!u.isModerator;socket.data.privateSpectator=privateSpectator;
    socket.data.chatRoom=privateRegion?`private-chat:${region}`:`public-chat:${roomKey}`;
    if(privateSpectator)spectators.set(socket.id,{id:socket.id,uid:u.uid,roomKey,region,matchMode,isModerator:!!u.isModerator});
    else spawnPlayer(socket,u,region,matchMode,roomKey,true);
    socket.join(socket.data.chatRoom);
    if(u.teamId){socket.join(teamRoom(u.teamId));socket.emit("teamRoster",{members:teamRoster(teams.find(team=>team.id===u.teamId))});}
    const p=players.get(socket.id);
    socket.emit("init",{you:socket.id,world:WORLD,region,matchMode,privateSpectator,account:{...userPayload(u),coins:p?.coins??u.coins??0}});
    socket.emit("friends:data",friendsPayload(u));
    socket.emit("team:invites",teamInvitesPayload(u));
  });
  socket.on("player:play",data=>{
    const user=findUserByUid(socket.data.uid);if(!user)return socket.emit("player:playResult",{error:"Sign in again to enter the game."});
    const region=String(data?.region||"AS");let matchMode=String(data?.matchMode||"ffa");
    if(!ALL_REGIONS.includes(region)||!["ffa","tdm"].includes(matchMode))return socket.emit("player:playResult",{error:"Choose a valid region and game mode."});
    const privateRegion=PRIVATE_REGIONS.includes(region),privateCode=normalizeRedeemCode(data?.regionCode);
    let privateSpectator=privateRegion&&!privateCode;
    if(privateRegion&&privateCode){const provided=crypto.createHash("sha256").update(privateCode).digest("hex");if(!regionCodes[region]||provided!==regionCodes[region])return socket.emit("player:playResult",{error:"That private server code is invalid or has been revoked. Ask a moderator for the current code."});privateSpectator=false;socket.data.privateAdmin=true;}else socket.data.privateAdmin=false;
    if(privateRegion)matchMode=privateModes[region]||"ffa";
    const publicRegion=privateRegion?region.slice(0,-8):region,roomKey=`${privateRegion?region:publicRegion}:${matchMode}`;roomFor(roomKey);
    let player=players.get(socket.id);
    if(privateSpectator){if(player){syncUserFromPlayer(player);players.delete(socket.id);}spectators.set(socket.id,{id:socket.id,uid:user.uid,roomKey,region,matchMode,isModerator:!!user.isModerator});}
    else{
      spectators.delete(socket.id);
      if(!player)player=spawnPlayer(socket,user,region,matchMode,roomKey,true);
      const enteringFromLobby=!!player.inMainMenu;
      player.roomKey=roomKey;player.region=region;player.matchMode=matchMode;player.inMainMenu=false;player.x=rand(180,WORLD.w-180);player.y=rand(180,WORLD.h-180);player.vx=0;player.vy=0;player.input={up:false,left:false,right:false,down:false,shoot:false};player.spectateTargetId=null;player.isInvisible=false;
      const active=[...players.values()].filter(other=>other.id!==player.id&&other.roomKey===roomKey&&!other.inMainMenu),red=active.filter(other=>other.side==="red").length,blue=active.filter(other=>other.side==="blue").length;
      player.side=matchMode==="tdm"?(red<=blue?"red":"blue"):null;
      if(enteringFromLobby){user.games=(Number(user.games)||0)+1;saveUsers();}
    }
    socket.data.region=region;socket.data.matchMode=matchMode;socket.data.roomKey=roomKey;socket.data.privateSpectator=privateSpectator;attachChatRoom(socket,region,matchMode,privateRegion);
    socket.emit("player:playResult",{ok:true,region,matchMode,privateSpectator,account:userPayload(user)});
  });
  socket.on("player:lobby",()=>{
    const user=findUserByUid(socket.data.uid);if(!user)return;
    let player=players.get(socket.id);if(player){syncUserFromPlayer(player);player.inMainMenu=true;player.region="AS";player.matchMode="ffa";player.roomKey="AS:ffa";player.side=null;player.isInvisible=false;player.spectateTargetId=null;player.input={up:false,left:false,right:false,down:false,shoot:false};player.vx=0;player.vy=0;}
    else{spectators.delete(socket.id);player=spawnPlayer(socket,user,"AS","ffa","AS:ffa",true);}
    socket.data.region="AS";socket.data.matchMode="ffa";socket.data.roomKey="AS:ffa";socket.data.privateSpectator=false;socket.data.privateAdmin=false;attachChatRoom(socket,"AS","ffa",false);
    socket.emit("player:lobbyResult",{ok:true,region:"AS",matchMode:"ffa",account:userPayload(user)});
  });
  socket.on("friends:list",()=>{const user=findUserByUid(socket.data.uid);if(user)socket.emit("friends:data",friendsPayload(user));});
  socket.on("dm:open",(friendUid,ack)=>{
    const user=findUserByUid(socket.data.uid),friend=findUserByUid(String(friendUid||""));
    if(!areFriends(user,friend)){const error="Direct messages are available only between accepted friends.";socket.emit("dm:error",error);if(typeof ack==="function")ack({error});return;}
    const messages=directMessages[directConversationKey(user.uid,friend.uid)];
    const result={friend:publicFriendProfile(friend),messages:Array.isArray(messages)?messages:[]};socket.emit("dm:history",result);if(typeof ack==="function")ack({ok:true});
  });
  socket.on("dm:send",(payload,ack)=>{
    const user=findUserByUid(socket.data.uid),friend=findUserByUid(String(payload?.toUid||""));
    const fail=error=>{socket.emit("dm:error",error);if(typeof ack==="function")ack({error});};
    if(!areFriends(user,friend))return fail("Direct messages are available only between accepted friends.");
    const now=Date.now();if(now-(socket.data.lastDmAt||0)<350)return fail("Please wait a moment before sending another message.");
    const text=String(payload?.text||"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").trim().slice(0,500);if(!text)return fail("Type a message first.");
    socket.data.lastDmAt=now;const key=directConversationKey(user.uid,friend.uid),messages=directMessages[key]||(directMessages[key]=[]);
    const message={id:crypto.randomBytes(8).toString("hex"),fromUid:user.uid,name:pilotName(user),text,at:now};messages.push(message);if(messages.length>250)messages.splice(0,messages.length-250);saveDirectMessages();
    emitToUser(user.uid,"dm:message",{peer:publicFriendProfile(friend),message});emitToUser(friend.uid,"dm:message",{peer:publicFriendProfile(user),message});if(typeof ack==="function")ack({ok:true});
  });
  socket.on("friend:request",lookup=>{
    const sender=findUserByUid(socket.data.uid),search=String(lookup||"").trim().toLowerCase();if(!sender)return;
    const target=Object.values(users).find(user=>user.username.toLowerCase()===search||user.uid.toLowerCase()===search);
    if(!target)return socket.emit("friends:error","No pilot has that username or UID.");
    if(target.uid===sender.uid)return socket.emit("friends:error","You cannot send a friend request to yourself.");
    if((sender.friends||[]).includes(target.uid))return socket.emit("friends:error","That pilot is already your friend.");
    if((target.friendRequests||[]).some(request=>request.fromUid===sender.uid))return socket.emit("friends:error","A friend request is already waiting for them.");
    if((sender.friendRequests||[]).some(request=>request.fromUid===target.uid))return socket.emit("friends:error","They already sent you a request. Accept it from your Friends list.");
    target.friendRequests.push({fromUid:sender.uid,createdAt:Date.now()});saveUsers();
    emitToUser(target.uid,"friend:requestReceived",{from:publicFriendProfile(sender)});emitFriendsData(target);socket.emit("friends:message",`Friend request sent to ${target.displayName||target.username}.`);emitFriendsData(sender);
  });
  socket.on("friend:accept",fromUid=>{
    const user=findUserByUid(socket.data.uid),sender=findUserByUid(String(fromUid||""));if(!user||!sender)return socket.emit("friends:error","That pilot account could not be found.");
    const request=user.friendRequests.find(entry=>entry.fromUid===sender.uid);if(!request)return socket.emit("friends:error","That friend request is no longer pending.");
    user.friendRequests=user.friendRequests.filter(entry=>entry.fromUid!==sender.uid);user.friends=[...new Set([...user.friends,sender.uid])];sender.friends=[...new Set([...(sender.friends||[]),user.uid])];saveUsers();emitFriendsData(user);emitFriendsData(sender);emitToUser(sender.uid,"friends:message",`${user.displayName||user.username} accepted your friend request.`);
  });
  socket.on("friend:decline",fromUid=>{
    const user=findUserByUid(socket.data.uid);if(!user)return;const sender=findUserByUid(String(fromUid||""));user.friendRequests=user.friendRequests.filter(entry=>entry.fromUid!==String(fromUid||""));saveUsers();emitFriendsData(user);if(sender)emitFriendsData(sender);
  });
  socket.on("friend:remove",friendUid=>{
    const user=findUserByUid(socket.data.uid),friend=findUserByUid(String(friendUid||""));if(!user||!friend)return;
    user.friends=(user.friends||[]).filter(uid=>uid!==friend.uid);friend.friends=(friend.friends||[]).filter(uid=>uid!==user.uid);saveUsers();emitFriendsData(user);emitFriendsData(friend);
  });
  socket.on("profile:avatar",(dataUrl,ack)=>{
    const fail=message=>{socket.emit("profile:avatarError",message);if(typeof ack==="function")ack({error:message});};
    const player=players.get(socket.id),user=findUserByUid(socket.data.uid);if(!user)return fail("Sign in to the game before changing your photo.");
    const match=String(dataUrl||"").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[1].length>600000)return fail("Choose a photo smaller than 450 KB after resizing.");
    const image=Buffer.from(match[1],"base64");if(image.length>450*1024||image.length<4||image[0]!==0xff||image[1]!==0xd8||image[2]!==0xff)return fail("The profile photo must be a valid JPG image.");
    try{fs.writeFileSync(path.join(PROFILE_DIR,`${user.uid}.jpg`),image);}catch{return fail("Could not save the profile photo on the game server.");}
    user.avatarUrl=`/uploads/profiles/${user.uid}.jpg?v=${Date.now()}`;if(player)player.avatarUrl=user.avatarUrl;saveUsers();socket.emit("accountUpdate",userPayload(user));if(typeof ack==="function")ack({ok:true,avatarUrl:user.avatarUrl});
  });
  socket.on("profile:avatarRemove",()=>{
    const player=players.get(socket.id),user=findUserByUid(socket.data.uid);if(!user)return;
    try{fs.unlinkSync(path.join(PROFILE_DIR,`${user.uid}.jpg`));}catch{}user.avatarUrl="";if(player)player.avatarUrl="";saveUsers();socket.emit("accountUpdate",userPayload(user));socket.emit("avatarRemoved",{ok:true});
  });
  socket.on("input",input=>{const p=players.get(socket.id);if(!p)return;if(p.isModerator&&p.spectateTargetId){p.input={up:false,down:false,left:false,right:false,shoot:false};return;}p.input={up:!!input.up,down:!!input.down,left:!!input.left,right:!!input.right,shoot:!!input.shoot&&!p.isInvisible};});
  socket.on("mod:setCoins",rawAmount=>{const p=players.get(socket.id),user=p&&findUserByUid(p.uid);if(!p?.isModerator||!user?.isModerator)return socket.emit("mod:result",{error:"Moderator access required."});const amount=Number(rawAmount);if(!Number.isSafeInteger(amount)||amount<0)return socket.emit("mod:result",{error:"Enter a nonnegative whole number of coins."});p.coins=amount;user.coins=amount;saveUsers();socket.emit("accountUpdate",userPayload(user));socket.emit("mod:result",{coins:amount,message:`Coin balance set to ${amount.toLocaleString()}.`});});
  socket.on("spectator:target",targetId=>{const observer=spectators.get(socket.id);if(!observer)return socket.emit("spectator:error","Spectator access required.");const target=players.get(String(targetId));if(!target||target.roomKey!==observer.roomKey)return socket.emit("spectator:error","Choose a pilot in this private region's watch feed.");socket.emit("spectator:target",{id:target.id,name:target.name});});
  socket.on("mod:invisible",enabled=>{const p=players.get(socket.id);if(!p?.isModerator)return socket.emit("mod:result",{error:"Moderator access required."});p.isInvisible=enabled===true;if(p.isInvisible)p.input.shoot=false;socket.emit("mod:result",{isInvisible:p.isInvisible,message:`Invisible mode ${p.isInvisible?"enabled":"disabled"}.`});});
  socket.on("mod:spectate",targetId=>{const p=players.get(socket.id);if(!p?.isModerator)return socket.emit("mod:result",{error:"Moderator access required."});if(targetId===null||targetId===""){p.spectateTargetId=null;p.input={up:false,down:false,left:false,right:false,shoot:false};return socket.emit("mod:result",{spectateTargetId:null,message:"Spectating stopped."});}const target=players.get(String(targetId));if(!target||target.roomKey!==p.roomKey||target.id===p.id)return socket.emit("mod:result",{error:"Choose another pilot in your current region and game mode."});p.spectateTargetId=target.id;p.input={up:false,down:false,left:false,right:false,shoot:false};socket.emit("mod:result",{spectateTargetId:target.id,message:`Spectating ${target.name}.`});});
  socket.on("mod:flameColor",color=>{const p=players.get(socket.id),user=p&&findUserByUid(p.uid);if(!p?.isModerator||!user?.isModerator)return socket.emit("mod:result",{error:"Moderator access required."});if(!/^#[0-9a-f]{6}$/i.test(String(color||"")))return socket.emit("mod:result",{error:"Choose a valid flame color."});p.flameColor=cleanFlameColor(color);user.flameColor=p.flameColor;saveUsers();socket.emit("accountUpdate",userPayload(user));socket.emit("mod:result",{flameColor:p.flameColor,message:"Flame color saved."});});
 socket.on("mod:ticket", () => {
  const p = players.get(socket.id);
  const user = p && findUserByUid(p.uid);

  if (!p?.isModerator || !user?.isModerator) {
    return socket.emit("mod:ticket", {
      error: "Sign in with a designated moderator account first."
    });
  }

  const expiresAt = Date.now() + 2 * 60 * 1000;

  const ticket = createModeratorToken({
    type: "moderator-handoff",
    uid: user.uid,
    exp: expiresAt
  });

  socket.emit("mod:ticket", { ticket });
});
  socket.on("chat:send",data=>{const user=findUserByUid(socket.data.uid);if(!user)return;const text=String(data?.text||"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,200);if(!text)return;if(Date.now()-(socket.data.lastChatAt||0)<500)return socket.emit("chat:error","Please wait before sending another message.");socket.data.lastChatAt=Date.now();const channel=data?.channel==="team"?"team":"public";if(channel==="team"&&!user.teamId)return socket.emit("chat:error","Join a team to use team chat.");if(channel==="public"&&handlePrivateChatCommand(socket,text))return;const message={channel,name:pilotName(user),text,at:Date.now()};if(channel==="team")io.to(teamRoom(user.teamId)).emit("chat:message",message);else io.to(socket.data.chatRoom).emit("chat:message",message);});
  socket.on("team:create",rawName=>{const p=players.get(socket.id),user=findUserByUid(socket.data.uid);if(!p||!user)return;if(user.teamId)return socket.emit("team:error","Leave your current team before creating another.");const name=String(rawName||"").trim().replace(/\s+/g," ").slice(0,24);if(name.length<2)return socket.emit("team:error","Team names must be 2-24 characters.");if(teams.some(team=>team.name.toLowerCase()===name.toLowerCase()))return socket.emit("team:error","That team name is already taken.");const level=userLevel(user);if(level<30)return socket.emit("team:error","You need to be level 30 to create a team.");if(p.coins<1200)return socket.emit("team:error","You need 1,200 coins to create a team.");p.coins-=1200;user.coins=p.coins;const team={id:crypto.randomBytes(8).toString("hex"),name,leaderUids:[user.uid],memberUids:[user.uid],createdAt:Date.now()};teams.push(team);user.teamId=team.id;saveTeams();syncUserFromPlayer(p);socket.join(teamRoom(team.id));p.name=pilotName(user);socket.emit("accountUpdate",userPayload(user));socket.emit("teamRoster",{members:teamRoster(team)});socket.emit("team:message","Team created.");});
  socket.on("team:join",()=>socket.emit("team:error","Teams are invite-only. A team leader must send you a recruitment request."));
  socket.on("team:invite",rawTarget=>{
    const leader=findUserByUid(socket.data.uid),team=teams.find(entry=>entry.id===leader?.teamId);
    if(!team||!team.leaderUids.includes(leader.uid))return socket.emit("team:error","Only a team leader can recruit players.");
    const query=String(rawTarget||"").trim().toLowerCase();if(!query)return socket.emit("team:error","Enter the player's username or UID.");
    const matches=Object.values(users).filter(candidate=>[candidate.username,candidate.displayName,candidate.uid].some(value=>String(value||"").trim().toLowerCase()===query));
    if(matches.length>1)return socket.emit("team:error","That name matches multiple accounts. Use an exact username or UID.");
    const target=matches[0];if(!target)return socket.emit("team:error","No player account matches that username or UID.");
    if(target.uid===leader.uid)return socket.emit("team:error","You are already the leader of this team.");
    if(target.teamId)return socket.emit("team:error","That player is already in a team.");
    target.teamInvites=Array.isArray(target.teamInvites)?target.teamInvites:[];
    if(target.teamInvites.some(invite=>invite.teamId===team.id))return socket.emit("team:error","That player already has a pending request from your team.");
    target.teamInvites.push({teamId:team.id,fromUid:leader.uid,createdAt:Date.now()});saveUsers();emitTeamInvites(target);
    socket.emit("team:message",`Recruitment request sent to ${target.displayName||target.username}.`);
  });
  socket.on("team:inviteRespond",payload=>{
    const user=findUserByUid(socket.data.uid);if(!user)return;
    const teamId=String(payload?.teamId||""),accept=payload?.accept===true;user.teamInvites=Array.isArray(user.teamInvites)?user.teamInvites:[];
    const invite=user.teamInvites.find(entry=>entry.teamId===teamId);if(!invite)return socket.emit("team:error","That team request is no longer available.");
    const team=teams.find(entry=>entry.id===invite.teamId);
    if(!team||!team.leaderUids.includes(invite.fromUid)){user.teamInvites=user.teamInvites.filter(entry=>entry.teamId!==teamId);saveUsers();emitTeamInvites(user);return socket.emit("team:error","That team request has expired.");}
    if(!accept){user.teamInvites=user.teamInvites.filter(entry=>entry.teamId!==teamId);saveUsers();emitTeamInvites(user);socket.emit("team:message",`Declined ${team.name}'s recruitment request.`);return;}
    if(user.teamId)return socket.emit("team:error","Leave your current team before accepting another request.");
    user.teamId=team.id;team.memberUids=Array.isArray(team.memberUids)?team.memberUids:[];if(!team.memberUids.includes(user.uid))team.memberUids.push(user.uid);user.teamInvites=[];saveTeams();saveUsers();
    const player=players.get(socket.id);if(player){player.teamId=team.id;player.name=pilotName(user);}socket.join(teamRoom(team.id));emitToUser(user.uid,"accountUpdate",userPayload(user));emitTeamInvites(user);io.to(teamRoom(team.id)).emit("teamRoster",{members:teamRoster(team)});io.to(teamRoom(team.id)).emit("team:message",`${user.displayName||user.username} joined ${team.name}.`);
  });
  socket.on("team:leave",()=>{const p=players.get(socket.id),user=findUserByUid(socket.data.uid);if(!user?.teamId)return socket.emit("team:error","You are not in a team.");const old=teams.find(team=>team.id===user.teamId);leaveTeam(user,socket);if(old)io.to(teamRoom(old.id)).emit("teamRoster",{members:teamRoster(old)});if(p){p.teamId=null;p.name=pilotName(user);syncUserFromPlayer(p);}socket.emit("accountUpdate",userPayload(user));socket.emit("team:message","You left the team.");});
  socket.on("team:promote",targetUid=>{const user=findUserByUid(socket.data.uid),team=teams.find(entry=>entry.id===user?.teamId);if(!team||!team.leaderUids.includes(user.uid))return socket.emit("team:error","Only team leaders can promote members.");if(!team.memberUids.includes(String(targetUid))||targetUid===user.uid)return socket.emit("team:error","Choose another member of your team.");if(!team.leaderUids.includes(String(targetUid)))team.leaderUids.push(String(targetUid));saveTeams();const promoted=findUserByUid(String(targetUid));if(promoted)pushAccountUpdate(promoted);io.to(teamRoom(team.id)).emit("teamRoster",{members:teamRoster(team)});});
  socket.on("setProfile",data=>{const p=players.get(socket.id),u=findUserByUid(socket.data.uid);if(!u)return;if(data?.email!==undefined){const email=cleanEmail(data.email);if(!validEmail(email))return socket.emit("profileError","Enter a valid email address.");if(Object.values(users).some(other=>other.uid!==u.uid&&cleanEmail(other.email)===email))return socket.emit("profileError","An account already uses this email address.");u.email=email;}u.displayName=cleanName(data?.name||u.displayName);u.jet=cleanJet(data?.jet||u.jet);u.jetColor=cleanJetColor(data?.jetColor||u.jetColor);if(p){p.name=pilotName(u);p.jet=u.jet;p.jetColor=u.jetColor;}saveUsers();socket.emit("accountUpdate",userPayload(u));});
  socket.on("buySprite",itemId=>{const p=players.get(socket.id);if(!p)return;const u=findUserByUid(p.uid),item=storeItems.find(entry=>entry.id===itemId);if(!u||!item||item.available===false)return socket.emit("spriteStoreError","That sprite is no longer available.");if(p.inventory.includes(item.id))return socket.emit("spriteStoreError","You already own this sprite. Equip it from the shop.");if(!p.isModerator&&p.coins<item.price)return socket.emit("spriteStoreError",`You need ${item.price} coins to buy this sprite.`);if(!p.inventory.includes(item.id))p.inventory.push(item.id);if(!p.isModerator)p.coins-=item.price;p.spriteId=item.id;syncUserFromPlayer(p);socket.emit("accountUpdate",userPayload(u));});
  socket.on("equipSprite",itemId=>{const p=players.get(socket.id);if(!p)return;const u=findUserByUid(p.uid);if(!u||!p.inventory.includes(itemId)||!storeItems.some(entry=>entry.id===itemId))return socket.emit("spriteStoreError","You don't own that sprite.");p.spriteId=itemId;u.spriteId=itemId;saveUsers();socket.emit("accountUpdate",userPayload(u));});
  socket.on("redeemSpriteCode",rawCode=>{const p=players.get(socket.id);if(!p)return;const u=findUserByUid(p.uid);if(!u)return;const code=normalizeRedeemCode(rawCode);if(!/^[A-Z0-9_-]{4,32}$/.test(code))return socket.emit("spriteStoreError","Enter a valid code (4-32 letters, numbers, hyphens, or underscores).");const codeHash=crypto.createHash("sha256").update(code).digest("hex"),record=redeemCodes.find(entry=>entry.codeHash===codeHash&&!entry.redeemedBy);if(!record)return socket.emit("spriteStoreError","That code is invalid or has already been redeemed.");const item=storeItems.find(entry=>entry.id===record.spriteId);if(!item)return socket.emit("spriteStoreError","The sprite for this code is no longer available.");if(p.inventory.includes(item.id))return socket.emit("spriteStoreError","You already own that sprite. The code was not used.");record.redeemedBy=u.uid;record.redeemedAt=Date.now();p.inventory.push(item.id);p.spriteId=item.id;u.inventory=p.inventory;u.spriteId=item.id;saveRedeemCodes();syncUserFromPlayer(p);socket.emit("accountUpdate",userPayload(u));socket.emit("spriteStoreSuccess",`${item.name} unlocked and equipped!`);});
  socket.on("buyUpgrade",type=>{const p=players.get(socket.id);if(!p)return;if(!["speed","armor","weapon"].includes(type))return;const level=p.upgrades[type]||0;if(level>=5)return socket.emit("shopError","This upgrade is already maxed.");const cost=UPGRADE_COSTS[level];if(p.coins<cost)return socket.emit("shopError",`You need ${cost} coins.`);p.coins-=cost;p.upgrades[type]=level+1;if(type==="armor"){p.maxHp=100+p.upgrades.armor*15;p.hp=Math.min(p.maxHp,p.hp+15);}syncUserFromPlayer(p);socket.emit("accountUpdate",userPayload(findUserByUid(p.uid)));});
  socket.on("disconnect",()=>{const p=players.get(socket.id);if(p)syncUserFromPlayer(p);players.delete(socket.id);spectators.delete(socket.id);for(const observer of players.values())if(observer.spectateTargetId===socket.id)observer.spectateTargetId=null;});
});

function shoot(p){if(p.cooldown>0||p.hp<=0)return;const room=roomFor(p.roomKey),boosted=Date.now()<p.weaponBoostUntil,speed=11+p.upgrades.weapon*.6+(boosted?4:0),id="b"+(nextId++);room.bullets.set(id,{id,owner:p.id,x:p.x+Math.cos(p.angle)*28,y:p.y+Math.sin(p.angle)*28,vx:Math.cos(p.angle)*speed,vy:Math.sin(p.angle)*speed,life:90});p.cooldown=Math.max(.08,(boosted?.12:.22)-p.upgrades.weapon*.018);}
function addScore(p,amount){const previousEarned=1+Math.floor(p.score/500);p.score+=amount;const earned=1+Math.floor(p.score/500);const u=findUserByUid(p.uid);p.level=u?.isModerator&&Number.isInteger(u.levelOverride)?userLevel(u):earned;if(earned>previousEarned){p.coins+=(earned-previousEarned)*50;if(u)io.to(p.id).emit("accountUpdate",userPayload({...u,coins:p.coins,score:p.score}));}syncUserFromPlayer(p);}
function killPlayer(killer,victim){victim.hp=0;victim.respawn=2.5;if(killer&&killer.id!==victim.id){killer.kills=(killer.kills||0)+1;killer.coins=(killer.coins||0)+100;addScore(killer,100);if(killer.matchMode==="tdm"&&killer.side)roomFor(killer.roomKey).score[killer.side]+=1;}}
function spawnSupply(room){const kinds=["coins","repair","weapon"],kind=kinds[Math.floor(Math.random()*kinds.length)],id="s"+(nextId++);room.supplies.set(id,{id,kind,x:rand(100,WORLD.w-100),y:rand(100,WORLD.h-100)});}
function updateGameRoom(room,dt,now){
  const roomPlayers=[...players.values()].filter(player=>player.roomKey===room.key&&!player.inMainMenu);
  for(const p of roomPlayers){
    if(p.hp<=0){p.respawn-=dt;if(p.respawn<=0){p.x=rand(150,WORLD.w-150);p.y=rand(150,WORLD.h-150);p.hp=p.maxHp;p.angle=-Math.PI/2;}continue;}
    p.hp=Math.min(p.maxHp,p.hp+2*dt);
    if(p.isModerator&&p.spectateTargetId){p.vx=0;p.vy=0;p.input={up:false,down:false,left:false,right:false,shoot:false};continue;}
    const turn=2.8*dt,accel=(230+p.upgrades.speed*22)*dt;
    if(p.input.left)p.angle-=turn;if(p.input.right)p.angle+=turn;
    if(p.input.up){p.vx+=Math.cos(p.angle)*accel;p.vy+=Math.sin(p.angle)*accel;}
    if(p.input.down){p.vx-=Math.cos(p.angle)*accel*.55;p.vy-=Math.sin(p.angle)*accel*.55;}
    p.vx*=Math.pow(.985,dt*60);p.vy*=Math.pow(.985,dt*60);
    const max=360+p.upgrades.speed*25,sp=Math.hypot(p.vx,p.vy);if(sp>max){p.vx=p.vx/sp*max;p.vy=p.vy/sp*max;}
    p.x=(p.x+p.vx*dt+WORLD.w)%WORLD.w;p.y=(p.y+p.vy*dt+WORLD.h)%WORLD.h;p.cooldown=Math.max(0,p.cooldown-dt);if(p.input.shoot&&!p.isInvisible)shoot(p);
  }
  for(const a of room.asteroids.values()){a.x=(a.x+a.vx+WORLD.w)%WORLD.w;a.y=(a.y+a.vy+WORLD.h)%WORLD.h;}
  if(now>=room.nextSupplyAt&&room.supplies.size<6){spawnSupply(room);room.nextSupplyAt=now+20000;}
  for(const [id,supply] of room.supplies){for(const p of roomPlayers){if(p.hp>0&&Math.hypot(p.x-supply.x,p.y-supply.y)<34){room.supplies.delete(id);if(supply.kind==="coins"){p.coins+=75;addScore(p,20);}else if(supply.kind==="repair")p.hp=Math.min(p.maxHp,p.hp+45);else p.weaponBoostUntil=now+15000;const user=findUserByUid(p.uid);if(user){user.coins=p.coins;saveUsers();io.to(p.id).emit("accountUpdate",userPayload(user));}break;}}}
  for(const [id,b] of room.bullets){b.x+=b.vx;b.y+=b.vy;b.life--;if(b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h){room.bullets.delete(id);continue;}let hit=false;for(const p of roomPlayers){if(p.hp<=0||p.isInvisible||(p.isModerator&&p.spectateTargetId)||p.id===b.owner)continue;const owner=players.get(b.owner);if(room.mode==="tdm"&&owner?.side&&owner.side===p.side)continue;if(Math.hypot(p.x-b.x,p.y-b.y)<27){p.hp-=Math.max(12,34+(owner?.upgrades.weapon||0)*5);room.bullets.delete(id);hit=true;if(p.hp<=0)killPlayer(owner,p);break;}}if(hit)continue;for(const a of room.asteroids.values()){if(Math.hypot(a.x-b.x,a.y-b.y)<a.size*.6+7){const owner=players.get(b.owner);if(owner){owner.coins+=10;addScore(owner,10);}if(a.size>50){a.size=38;a.vx+=rand(-.4,.4);a.vy+=rand(-.4,.4);}else room.asteroids.delete(a.id);room.bullets.delete(id);break;}}}
  while(room.asteroids.size<22)addAsteroid(room);
  const entities=allEntities(room.key),allBullets=[...room.bullets.values()],rocks=[...room.asteroids.values()],supplies=[...room.supplies.values()];
  for(const client of io.sockets.sockets.values())if(client.data.roomKey===room.key){const viewer=players.get(client.id)||spectators.get(client.id)||{isModerator:client.data.isModerator,uid:client.data.uid};const visibleEntities=entities.filter(entity=>canSeeInvisible(viewer,entity));const visibleBullets=allBullets.filter(bullet=>{const owner=players.get(bullet.owner);return !owner?.isInvisible||owner.id===client.id||viewer.isModerator;});client.emit("state",{entities:visibleEntities,bullets:visibleBullets,asteroids:rocks,supplies,match:{mode:room.mode,score:room.score},room:room.key});}
}
let last=Date.now();setInterval(()=>{const now=Date.now(),dt=Math.min(.05,(now-last)/1000);last=now;for(const room of gameRooms.values())updateGameRoom(room,dt,now);},50);

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
server.on("error",error=>{if(error.code==="EADDRINUSE")console.error(`Port ${PORT} is already in use. Stop the other game server or start this one with PORT=3001.`);else console.error(error);process.exitCode=1;});
server.listen(PORT,()=>console.log(`Spasiro by Vector Viper running on port ${PORT}`));
