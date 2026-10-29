const $ = id => document.getElementById(id);
const tokenKey = "spaceJetModeratorSession";
let token = sessionStorage.getItem(tokenKey) || "";
let pilots = [];
let published = [];
let selectedPng = "";
let searchTimer = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function number(value) { return new Intl.NumberFormat().format(value || 0); }
function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function showLogin(message = "") {
  token = "";
  sessionStorage.removeItem(tokenKey);
  $("modConsole").classList.add("hidden");
  $("modLogin").classList.remove("hidden");
  $("loginMessage").textContent = message;
}
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && token) showLogin("Moderator session expired or the game server restarted. Enter the moderator code again.");
  if (!response.ok) {
    if (data.error === "API endpoint not found" || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("The running game server is out of date. Stop it with Ctrl+C, then run npm start and reload this page.");
    }
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  if (!data || typeof data !== "object") throw new Error("The server returned an invalid response.");
  return data;
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("loginMessage").textContent = "Checking code…";
  try {
    const data = await api("/api/mod/login", { method: "POST", body: JSON.stringify({ code: $("modCode").value }) });
    if (!data.token) throw new Error("The running game server is out of date. Stop it with Ctrl+C, then run npm start and reload this page.");
    token = data.token;
    sessionStorage.setItem(tokenKey, token);
    $("modCode").value = "";
    $("loginMessage").textContent = "";
    $("modLogin").classList.add("hidden");
    $("modConsole").classList.remove("hidden");
    await refreshConsole();
  } catch (error) {
    $("loginMessage").textContent = error.message;
  }
});

async function loadOverview() {
  const data = await api("/api/mod/overview", { cache: "no-store" });
  $("metricPilots").textContent = number(data.pilots);
  $("metricOnline").textContent = number(data.online);
  $("metricRestrictions").textContent = number(data.restricted);
  $("metricStorage").textContent = sizeLabel(data.storageBytes);
  $("metricBackups").textContent = `${number(data.backups)} BACKUPS · ${number(data.sprites)} SPRITES`;
  $("storageSummary").innerHTML = `<span>Pilot accounts<b>${number(data.pilots)}</b></span><span>Published sprites<b>${number(data.sprites)}</b></span><span>Restricted accounts<b>${number(data.restricted)}</b></span><span>Stored data and backups<b>${sizeLabel(data.storageBytes)}</b></span>`;
}
async function loadPilots() {
  const q = encodeURIComponent($("pilotSearch").value.trim());
  const data = await api(`/api/mod/users?q=${q}`, { cache: "no-store" });
  pilots = data.pilots || [];
  renderPilots();
}
async function loadSelfLevel() {
  const data = await api("/api/mod/self/level", { cache: "no-store" });
  if (!data.linked) {
    $("myLevelForm").classList.add("hidden");
    $("myLevelMessage").textContent = "Sign in to the game with your moderator account, then open this room from the game to edit your own level.";
    return;
  }
  $("myLevelForm").classList.remove("hidden");
  $("myLevelInput").value = data.level;
  $("myLevelMessage").textContent = `Current moderator level: ${number(data.level)}.`;
}
$("saveMyLevel").addEventListener("click", async () => {
  const button = $("saveMyLevel"); button.disabled = true;
  try {
    const data = await api("/api/mod/self/level", { method: "POST", body: JSON.stringify({ level: Number($("myLevelInput").value) }) });
    $("myLevelInput").value = data.level;
    $("myLevelMessage").textContent = `Your level is now ${number(data.level)}.`;
  } catch (error) { $("myLevelMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
let liveUid = "";
async function loadLivePilots() {
  const data = await api("/api/mod/online", { cache: "no-store" });
  const select = $("livePilotSelect"), previous = liveUid || select.value;
  const pilots = data.pilots || [];
  select.innerHTML = pilots.length ? '<option value="">Choose online pilot…</option>' + pilots.map(pilot => `<option value="${escapeHtml(pilot.uid)}">${escapeHtml(pilot.name)} · ${escapeHtml(pilot.region)} · ${escapeHtml(pilot.mode.toUpperCase())}${pilot.isInvisible ? " · INVISIBLE" : ""}</option>`).join("") : '<option value="">No pilots are online</option>';
  if (pilots.some(pilot => pilot.uid === previous)) select.value = previous;
  liveUid = select.value;
}
async function observeLivePilot() {
  const uid = $("livePilotSelect").value;
  if (!uid || $("livePanel").classList.contains("hidden")) return;
  liveUid = uid;
  try { const data = await api(`/api/mod/observe?uid=${encodeURIComponent(uid)}`, { cache: "no-store" }); drawModeratorView(data); }
  catch (error) { $("liveMessage").textContent = error.message; }
}
function drawModeratorView(data) {
  const canvas = $("modSpectateCanvas"), ctx = canvas.getContext("2d"), width = canvas.width, height = canvas.height;
  const target = data.entities.find(entity => entity.id === data.targetId);
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#02050a"; ctx.fillRect(0, 0, width, height);
  if (!target) { ctx.fillStyle = "#8c9db1"; ctx.textAlign = "center"; ctx.fillText("Pilot is no longer online", width / 2, height / 2); return; }
  const scale = Math.min(width / Math.min(data.world.w, 1300), height / Math.min(data.world.h, 760));
  const viewW = width / scale, viewH = height / scale;
  const camX = Math.max(0, Math.min(data.world.w - viewW, target.x - viewW / 2)), camY = Math.max(0, Math.min(data.world.h - viewH, target.y - viewH / 2));
  ctx.save(); ctx.scale(scale, scale); ctx.translate(-camX, -camY);
  ctx.strokeStyle = "#142131"; ctx.lineWidth = 1 / scale;
  for (let x = 0; x < data.world.w; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, data.world.h); ctx.stroke(); }
  for (let y = 0; y < data.world.h; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(data.world.w, y); ctx.stroke(); }
  for (const asteroid of data.asteroids) { ctx.fillStyle = "#536171"; ctx.beginPath(); ctx.arc(asteroid.x, asteroid.y, Math.max(10, asteroid.size / 2), 0, Math.PI * 2); ctx.fill(); }
  for (const bullet of data.bullets) { ctx.fillStyle = "#ffd84d"; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2); ctx.fill(); }
  for (const entity of data.entities) { ctx.save(); ctx.translate(entity.x, entity.y); ctx.rotate(entity.angle); ctx.fillStyle = entity.isModerator ? "#59c7ff" : entity.id === target.id ? "#fff" : "#96a9bd"; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -8); ctx.lineTo(-6, 0); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.font = "12px Arial"; ctx.textAlign = "center"; ctx.fillStyle = entity.isInvisible ? "#58c8ff" : "#d7e5f7"; ctx.fillText(entity.name, entity.x, entity.y - 16); }
  ctx.restore();
  $("liveMessage").textContent = `SPECTATING ${target.name} · ${data.room.toUpperCase()}${data.match.mode === "tdm" ? ` · ${data.match.score.red}-${data.match.score.blue}` : ""}`;
}
$("refreshLive").addEventListener("click", () => loadLivePilots().then(observeLivePilot).catch(error => $("liveMessage").textContent = error.message));
$("livePilotSelect").addEventListener("change", () => { liveUid = $("livePilotSelect").value; observeLivePilot(); });
$("startSpectating").addEventListener("click", observeLivePilot);
async function setModVisibility(enabled) {
  const uid = $("livePilotSelect").value;
  if (!uid) { $("liveMessage").textContent = "Choose an online moderator pilot first."; return; }
  try { await api(`/api/mod/players/${encodeURIComponent(uid)}/invisibility`, { method: "POST", body: JSON.stringify({ enabled }) }); $("liveMessage").textContent = `Invisible mode ${enabled ? "enabled" : "disabled"}.`; await loadLivePilots(); }
  catch (error) { $("liveMessage").textContent = error.message; }
}
$("invisibleOn").addEventListener("click", () => setModVisibility(true));
$("invisibleOff").addEventListener("click", () => setModVisibility(false));
setInterval(() => { if (!$("livePanel").classList.contains("hidden")) { observeLivePilot(); loadLivePilots().catch(error => $("liveMessage").textContent = error.message); } }, 900);
function renderPilots() {
  $("pilotCount").textContent = `${number(pilots.length)} PILOTS`;
  $("moderatorPilotRows").innerHTML = pilots.length ? pilots.map(pilot => {
    const suspended = pilot.suspendedUntil > Date.now();
    const status = pilot.banned ? "BANNED" : suspended ? `SUSPENDED · ${new Date(pilot.suspendedUntil).toLocaleString()}` : "ACTIVE";
    const restricted = pilot.banned || suspended;
    const action = pilot.isModerator ? `<span class="accountStatus">MOD PROTECTED</span>` : pilot.banned
      ? `<button class="actionButton safe" data-action="unban" data-uid="${escapeHtml(pilot.uid)}">UNBAN</button>`
      : `<button class="actionButton danger" data-action="ban" data-uid="${escapeHtml(pilot.uid)}">BAN</button>`;
    const suspension = pilot.isModerator ? "" : suspended
      ? `<button class="actionButton safe" data-action="unsuspend" data-uid="${escapeHtml(pilot.uid)}">LIFT SUSPENSION</button>`
      : !pilot.banned ? `<label class="customSuspend">MINUTES<input class="suspendChoice" type="number" min="1" max="525600" step="1" value="60" aria-label="Custom suspension duration in minutes" data-duration="${escapeHtml(pilot.uid)}"></label><button class="actionButton" data-action="suspend" data-uid="${escapeHtml(pilot.uid)}">SUSPEND</button>` : "";
    return `<tr>
      <td><div class="pilotIdentity"><strong>${escapeHtml(pilot.name || pilot.username)}${pilot.isModerator ? " (MOD)" : ""}</strong><span>${escapeHtml(pilot.username)} · ${escapeHtml(pilot.uid)}${pilot.email ? ` · ${escapeHtml(pilot.email)}` : ""}</span></div></td>
      <td>${number(pilot.score)}</td><td>${number(pilot.coins)}</td>
      <td><span class="accountStatus ${restricted ? "restricted" : ""}">${status}</span></td>
      <td><div class="accountActions"><button class="actionButton" data-action="moderator" data-uid="${escapeHtml(pilot.uid)}" data-enabled="${pilot.isModerator ? "false" : "true"}">${pilot.isModerator ? "REMOVE MOD" : "MAKE MOD"}</button><button class="actionButton" data-action="password-reset" data-uid="${escapeHtml(pilot.uid)}" data-name="${escapeHtml(pilot.username)}">ISSUE RESET</button>${action}${suspension}</div></td>
    </tr>`;
  }).join("") : '<tr><td colspan="5" class="empty">No matching pilot accounts.</td></tr>';
}
$("moderatorPilotRows").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "moderator") {
    button.disabled = true;
    try {
      await api(`/api/mod/users/${encodeURIComponent(button.dataset.uid)}/moderator`, { method: "POST", body: JSON.stringify({ isModerator: button.dataset.enabled === "true" }) });
      $("pilotMessage").textContent = button.dataset.enabled === "true" ? "Moderator designation added." : "Moderator designation removed.";
      await loadPilots();
    } catch (error) { $("pilotMessage").textContent = error.message; button.disabled = false; }
    return;
  }
  if (action === "password-reset") {
    button.disabled = true;
    try {
      const data = await api(`/api/mod/users/${encodeURIComponent(button.dataset.uid)}/password-reset`, { method: "POST", body: "{}" });
      $("pilotMessage").textContent = `One-time code for ${button.dataset.name}: ${data.resetCode} · expires in 30 minutes. Give it directly to the verified account owner.`;
    } catch (error) { $("pilotMessage").textContent = error.message; button.disabled = false; }
    return;
  }
  const payload = { action };
  if (action === "suspend") {
    const duration = document.querySelector(`[data-duration="${CSS.escape(button.dataset.uid)}"]`);
    payload.minutes = Number(duration?.value);
    if (!Number.isInteger(payload.minutes) || payload.minutes < 1 || payload.minutes > 525600) {
      $("pilotMessage").textContent = "Enter a suspension from 1 to 525,600 minutes (up to 365 days).";
      return;
    }
  }
  button.disabled = true;
  $("pilotMessage").textContent = "Applying account action…";
  try {
    await api(`/api/mod/users/${encodeURIComponent(button.dataset.uid)}/status`, { method: "POST", body: JSON.stringify(payload) });
    $("pilotMessage").textContent = "Pilot status updated.";
    await Promise.all([loadPilots(), loadOverview()]);
  } catch (error) {
    $("pilotMessage").textContent = error.message;
    button.disabled = false;
  }
});
$("pilotSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPilots().catch(error => $("pilotMessage").textContent = error.message), 160);
});
$("refreshPilots").addEventListener("click", () => Promise.all([loadPilots(), loadOverview()]).catch(error => $("pilotMessage").textContent = error.message));

function renderPublished() {
  const listed = published.filter(item => item.available !== false).length;
  $("spriteCount").textContent = `${number(listed)} IN SHOP · ${number(published.length)} TOTAL`;
  $("publishedSprites").innerHTML = published.length ? published.map(item => {
    const listed = item.available !== false;
    const status = listed ? `${number(item.price)} COINS · IN SHOP` : item.distribution === "redeem" ? "REDEEM ONLY" : "DELISTED";
    return `<article class="publishedItem"><img src="${escapeHtml(item.imageUrl)}" alt=""><div><strong>${escapeHtml(item.name)}</strong><span>${status}</span></div><button class="actionButton ${listed ? "danger" : "safe"}" data-listing="${listed ? "false" : "true"}" data-item="${escapeHtml(item.id)}">${listed ? "REMOVE" : "LIST IN SHOP"}</button></article>`;
  }).join("") : '<div class="empty">No sprites published yet.</div>';
}
async function loadSprites() {
  const data = await api("/api/shop/sprites", { cache: "no-store" });
  published = data.items || [];
  renderPublished();
  const redeemable = published.filter(item => item.available !== false || item.distribution === "redeem");
  $("redeemSpriteSelect").innerHTML = redeemable.length ? '<option value="">Choose sprite…</option>' + redeemable.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("") : '<option value="">Publish a sprite first</option>';
}
$("publishedSprites").addEventListener("click", async event => {
  const button = event.target.closest("button[data-listing]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/mod/items/${encodeURIComponent(button.dataset.item)}/listing`, { method: "POST", body: JSON.stringify({ available: button.dataset.listing === "true" }) });
    await Promise.all([loadSprites(), loadOverview()]);
    $("spriteMessage").textContent = button.dataset.listing === "true" ? "Sprite relisted in the shop." : "Sprite removed from the shop. Existing owners keep it.";
  } catch (error) { $("spriteMessage").textContent = error.message; button.disabled = false; }
});
$("redeemCodeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("redeemCodeForm").querySelector("button[type=submit]");
  button.disabled = true; $("redeemCodeMessage").textContent = "Generating one-use code…";
  try {
    const data = await api("/api/mod/redeem-codes", { method: "POST", body: JSON.stringify({ spriteId: $("redeemSpriteSelect").value, code: $("redeemCustomCode").value }) });
    $("redeemCodeMessage").textContent = `${data.sprite} code: ${data.code} · one use only. Copy it now; it will not be shown again.`;
    $("redeemCustomCode").value = "";
  } catch (error) { $("redeemCodeMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
function updateSpriteDistribution() {
  const redeem = $("spriteDistribution").value === "redeem";
  $("spritePriceField").classList.toggle("hidden", redeem);
  $("spritePrice").disabled = redeem;
  $("spritePrice").required = !redeem;
  $("spriteCustomCodeField").classList.toggle("hidden", !redeem);
  $("publishSpriteButton").textContent = redeem ? "CREATE SPRITE & REDEEM CODE" : "PUBLISH TO SPRITE BAY";
}
$("spriteDistribution").addEventListener("change", updateSpriteDistribution);
updateSpriteDistribution();
$("spriteFile").addEventListener("change", () => {
  const file = $("spriteFile").files?.[0];
  selectedPng = "";
  if (!file) { $("spriteFileName").textContent = "Choose PNG file…"; return; }
  if (file.type !== "image/png" || file.size > 2 * 1024 * 1024) {
    $("spriteMessage").textContent = "Choose a PNG file no larger than 2 MB.";
    $("spriteFile").value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { selectedPng = String(reader.result || ""); $("spriteFileName").textContent = `${file.name} · ${sizeLabel(file.size)}`; };
  reader.onerror = () => { $("spriteMessage").textContent = "Could not read that PNG file."; };
  reader.readAsDataURL(file);
});
$("spriteForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!selectedPng) { $("spriteMessage").textContent = "Choose a PNG sprite first."; return; }
  const button = $("spriteForm").querySelector("button[type=submit]");
  button.disabled = true;
  $("spriteMessage").textContent = "Uploading sprite…";
  try {
    const distribution = $("spriteDistribution").value;
    const data = await api("/api/mod/items", { method: "POST", body: JSON.stringify({ name: $("spriteName").value, distribution, price: Number($("spritePrice").value), code: $("spriteCustomCode").value, png: selectedPng }) });
    $("spriteMessage").textContent = distribution === "redeem" ? `${data.item.name} created for redemption. Code: ${data.code} · one use only. Copy it now; it will not be shown again.` : "Sprite published to the in-game shop.";
    $("spriteForm").reset();updateSpriteDistribution();selectedPng = "";$("spriteFileName").textContent = "Choose PNG file…";
    await Promise.all([loadSprites(), loadOverview()]);
  } catch (error) {
    $("spriteMessage").textContent = error.message;
  } finally { button.disabled = false; }
});

async function refreshConsole() {
  await Promise.all([loadOverview(), loadPilots(), loadSprites(), loadRegionCodeStatus(), loadSelfLevel()]);
}
$("createBackup").addEventListener("click", async () => {
  const button = $("createBackup");button.disabled = true;
  $("backupMessage").textContent = "Creating snapshot…";
  try {
    const data = await api("/api/mod/backup", { method: "POST", body: "{}" });
    $("backupMessage").textContent = `Backup created: ${data.backup}`;
    await loadOverview();
  } catch (error) { $("backupMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
$("refreshOverview").addEventListener("click", () => loadOverview().catch(error => $("backupMessage").textContent = error.message));
async function loadRegionCodeStatus() {
  const data = await api("/api/mod/region-codes", { cache: "no-store" });
  const current = data.regions.find(entry => entry.region === $("privateRegionSelect").value);
  $("regionCodeMessage").textContent = current?.enabled ? `${current.region} has an active code.` : `${current?.region || "Private region"} has no active code.`;
}
$("issueRegionCode").addEventListener("click", async () => {
  const button = $("issueRegionCode"); button.disabled = true;
  try { const data = await api("/api/mod/region-codes", { method: "POST", body: JSON.stringify({ region: $("privateRegionSelect").value }) }); $("regionCodeMessage").textContent = `${data.region} access code: ${data.accessCode} · copy it now. Generating another code replaces this one.`; }
  catch (error) { $("regionCodeMessage").textContent = error.message; }
  finally { button.disabled = false; }
});
$("revokeRegionCode").addEventListener("click", async () => {
  const region = $("privateRegionSelect").value;
  try { await api(`/api/mod/region-codes/${encodeURIComponent(region)}`, { method: "DELETE" }); $("regionCodeMessage").textContent = `${region} access code revoked.`; }
  catch (error) { $("regionCodeMessage").textContent = error.message; }
});
$("privateRegionSelect").addEventListener("change", () => loadRegionCodeStatus().catch(error => $("regionCodeMessage").textContent = error.message));

document.querySelectorAll(".modTab").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".modTab").forEach(tab => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(".modPanel").forEach(panel => panel.classList.toggle("hidden", panel.id !== button.dataset.panel));
}));
$("modLogout").addEventListener("click", async () => {
  try { await api("/api/mod/logout", { method: "POST", body: "{}" }); } catch {}
  showLogin("Moderator session closed.");
});

async function redeemGameHandoff() {
  const key = "spaceJetModeratorHandoff";
  const raw = localStorage.getItem(key);

  if (!raw) return;

  try {
    const handoff = JSON.parse(raw);

    if (!handoff.ticket) {
      throw new Error(
        "Moderator handoff is invalid. Return to the signed-in game and try again."
      );
    }

    $("loginMessage").textContent = "Verifying moderator account…";

    const response = await fetch("/api/mod/login-player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ticket: handoff.ticket
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.token) {
      throw new Error(
        data.error || "Could not verify moderator account."
      );
    }

    // Only consume the handoff after successful verification.
    localStorage.removeItem(key);

    token = data.token;
    sessionStorage.setItem(tokenKey, token);

    $("modLogin").classList.add("hidden");
    $("modConsole").classList.remove("hidden");

    await refreshConsole();
  } catch (error) {
    showLogin(error.message);
  }
}

if (token) {
  $("modLogin").classList.add("hidden");
  $("modConsole").classList.remove("hidden");
  refreshConsole().catch(error => showLogin(error.message));
} else redeemGameHandoff();

// Keep an open moderator room active; idle sessions still expire after eight hours.
setInterval(() => {
  if (token && !document.hidden) api("/api/mod/overview", { cache: "no-store" }).catch(error => {
    if (token) showLogin(error.message);
  });
}, 5 * 60 * 1000);
