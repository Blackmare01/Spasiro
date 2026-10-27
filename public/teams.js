const team$ = id => document.getElementById(id);
const teamNum = value => new Intl.NumberFormat().format(value || 0);
async function loadTeams(){
  team$("teamsError").textContent="";
  try{
    const response=await fetch("/api/teams/stats",{cache:"no-store"}),data=await response.json();
    if(!response.ok)throw new Error(data.error||"Could not load team stats.");
    team$("teamTotal").textContent=teamNum(data.totals.teams);team$("memberTotal").textContent=teamNum(data.totals.members);team$("scoreTotal").textContent=teamNum(data.totals.score);team$("killTotal").textContent=teamNum(data.totals.kills);
    team$("teamRows").innerHTML=data.teams.length?data.teams.map((team,index)=>`<tr><td>${index+1}</td><td>${team.name.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}</td><td>${team.leaders.map(name=>name.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))).join(", ")||"—"}</td><td>${teamNum(team.members)}</td><td>${teamNum(team.score)}</td><td>${teamNum(team.kills)}</td></tr>`).join(""):'<tr><td colspan="6">No teams have been created yet.</td></tr>';
  }catch(error){team$("teamsError").textContent=error.message;}
}
team$("refreshTeams").addEventListener("click",loadTeams);loadTeams();
