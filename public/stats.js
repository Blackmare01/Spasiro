const $ = id => document.getElementById(id);
const number = value => new Intl.NumberFormat().format(value || 0);
let pilots = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function renderPilots() {
  const query = $("search").value.trim().toLowerCase();
  const filtered = pilots.map((pilot, index) => ({ ...pilot, rank: index + 1 }))
    .filter(pilot => !query || String(pilot.name || "").toLowerCase().includes(query) || String(pilot.uid || "").toLowerCase().includes(query));
  $("resultCount").textContent = `${number(filtered.length)} ${filtered.length === 1 ? "pilot" : "pilots"} shown`;
  $("pilotRows").innerHTML = filtered.length ? filtered.map(pilot => {
    const initial = escapeHtml((pilot.name || "?").trim().charAt(0).toUpperCase());
    const rankClass = pilot.rank <= 3 ? "rank top" : "rank";
    return `<tr>
      <td class="${rankClass}">#${number(pilot.rank).padStart(2, "0")}</td>
      <td><div class="pilot"><span class="avatar">${initial}</span><span><span class="pilotName">${escapeHtml(pilot.name)}</span><span class="pilotUid">${escapeHtml(pilot.uid)}</span></span></div></td>
      <td class="level">LV ${number(pilot.level)}</td>
      <td class="score">${number(pilot.score)}</td>
      <td>${number(pilot.kills)}</td>
      <td>${number(pilot.games)}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="empty">${query ? "No pilots match that search." : "No pilots in the fleet yet."}</td></tr>`;
}

async function loadStats() {
  const refresh = $("refresh");
  refresh.disabled = true;
  refresh.classList.add("loading");
  $("error").textContent = "";
  try {
    const response = await fetch("/api/stats", { cache: "no-store" });
    if (!response.ok) throw new Error(`Command returned ${response.status}`);
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Stats API not found on the running server. Restart the game server to load the latest update.");
    }
    const data = await response.json();
    pilots = Array.isArray(data.pilots) ? data.pilots : [];
    $("totalPilots").textContent = number(data.totals?.pilots);
    $("totalScore").textContent = number(data.totals?.score);
    $("totalKills").textContent = number(data.totals?.kills);
    $("totalSorties").textContent = number(data.totals?.sorties);
    $("lastUpdated").textContent = `UPDATED ${new Date(data.updatedAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderPilots();
  } catch (error) {
    $("error").textContent = error.message?.startsWith("Stats API not found")
      ? error.message
      : "Stats are temporarily unavailable. Start the game server with npm start, then refresh.";
    $("resultCount").textContent = "Unable to load pilots";
    $("pilotRows").innerHTML = '<tr><td colspan="6" class="empty">Unable to reach command.</td></tr>';
  } finally {
    refresh.disabled = false;
    refresh.classList.remove("loading");
  }
}

$("search").addEventListener("input", renderPilots);
$("refresh").addEventListener("click", loadStats);
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("search").focus();
  }
});
loadStats();
