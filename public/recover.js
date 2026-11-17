const $ = id => document.getElementById(id);
const API_BASE=String(window.SPASIRO_API_BASE||"").replace(/\/$/,"");
$("resetBtn").addEventListener("click", async () => {
  const button = $("resetBtn"); button.disabled = true; $("recoverMsg").textContent = "Verifying recovery code…";
  try {
    const response = await fetch(API_BASE+"/api/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("username").value, resetCode: $("resetCode").value, password: $("newPassword").value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Password reset failed.");
    $("recoverMsg").textContent = `${data.message} Return to the game and sign in.`;
  } catch (error) { $("recoverMsg").textContent = error.message; }
  finally { button.disabled = false; }
});
