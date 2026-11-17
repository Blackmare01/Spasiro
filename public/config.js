/* Keep local development on its own server; use Enzonic for deployed clients. */
window.SPASIRO_API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? ""
  : "https://spasiro.enzonic.dev";
