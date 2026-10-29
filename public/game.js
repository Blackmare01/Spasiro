const $=id=>document.getElementById(id);
let socket=io({autoConnect:false,transports:["websocket"]});
let mode="login", account=null, myId=null, world={w:2400,h:1400}, state={entities:[],bullets:[],asteroids:[]};
let keys={}, mouseDown=false, camera={x:0,y:0}, selectedJet="blue", editJet="blue", spectateTargetId=null, invisibleMode=false, spectateRosterKey="";
let currentRegion="AS",currentMatchMode="ffa",privateSpectator=false;
let mainMenuActive=false;
const jets=["blue","red","yellow","green"];
let soundOn=true,audioCtx=null,lastShotTone=0,liveScore=0,liveKills=0;
let spriteCatalog=[];
const customSpriteImages={};
let avatarUploadTimer=0;
let friendsCache=[],friendsDataCache=null,unreadDMs={},currentDMUid="";
let pingTimer=0,pingValue=null,pingRequestPending=false;
const upgradeInfo={
  speed:{name:"ENGINE",desc:"Higher acceleration and top speed.",icon:"⚡"},
  armor:{name:"ARMOR",desc:"More maximum health.",icon:"◆"},
  weapon:{name:"WEAPON",desc:"Higher damage and faster firing.",icon:"✦"}
};
const upgradeCosts=[100,250,500,1000,2000];

function jetPicker(el,current,setter){
  el.innerHTML="";
  jets.forEach(j=>{
    const b=document.createElement("button"); b.className="jet"+(j===current?" selected":"");
    b.innerHTML=`<img src="/assets/${j}.png" alt="${j}">`;
    b.onclick=()=>{setter(j);[...el.children].forEach(x=>x.classList.remove("selected"));b.classList.add("selected")};
    el.appendChild(b);
  });
}
jetPicker($("jetPick"),selectedJet,j=>selectedJet=j);
$("serverRegion").addEventListener("change",()=>{$("privateCodeWrap").classList.toggle("hidden",!$("serverRegion").value.endsWith("_private"));updatePrivateChatHelp();});

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  mode=b.dataset.mode;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  $("registerOnly").classList.toggle("hidden",mode!=="register");
  $("authBtn").textContent=mode==="login"?"ENTER SECTOR":"CREATE PILOT";
  $("authMsg").textContent="";
});

$("authBtn").onclick=async()=>{
  const body={username:$("username").value,password:$("password").value};
  if(mode==="register"){body.email=$("email").value;body.displayName=$("displayName").value;body.jet=selectedJet;}
  try{
    const r=await fetch("/api/"+mode,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||"Request failed");
    account=d; localStorage.setItem("spaceJetAccount",JSON.stringify({username:d.username,uid:d.uid}));
    connectServer();
  }catch(e){$("authMsg").textContent=e.message}
};
function connectServer(){
  if(!account)return;
  if(socket.connected) socket.disconnect();
socket=io({autoConnect:false,transports:["websocket"]});
  socket.on("connect",()=>{socket.emit("auth",{username:account.username,uid:account.uid,region:"AS",matchMode:"ffa"});startPingMonitor();});
  socket.on("disconnect",()=>{clearInterval(pingTimer);pingTimer=0;pingValue=null;pingRequestPending=false;updatePingDisplay();});
  socket.on("authError",m=>{$("authMsg").textContent=m});
  socket.on("disconnect",reason=>{if(reason==="io server disconnect"&&myId){myId=null;mainMenuActive=false;state={entities:[],bullets:[],asteroids:[]};$("game").classList.add("hidden");$("game").classList.remove("inMainMenu");$("menu").classList.add("hidden");$("auth").classList.remove("hidden");$("authMsg").textContent="This pilot session ended because the account signed in elsewhere or was restricted.";}});
  socket.on("profileError",m=>{$("profileMsg").textContent=m});
  socket.on("connect_error",()=>{$("authMsg").textContent="Can't reach the game server. Start it with npm start and refresh."});
  socket.on("init",d=>{myId=d.you;world=d.world;currentRegion=d.region;currentMatchMode=d.matchMode;privateSpectator=!!d.privateSpectator;spectateTargetId=null;account={...account,...(d.account||{})};mainMenuActive=true;$("auth").classList.add("hidden");$("game").classList.remove("hidden");$("game").classList.add("inMainMenu");$("mainMenu").classList.remove("hidden");$("mainMenuHome").classList.remove("hidden");$("friendsView").classList.add("hidden");$("nameHud").textContent=accountPilotName();$("uidHud").textContent=account.uid;$("serverHud").textContent=`${currentRegion} · ${currentMatchMode.toUpperCase()}`;$("observerTab").classList.toggle("hidden",!privateSpectator);$("modQuickToggle").classList.toggle("hidden",!account.isModerator||privateSpectator);$("mainModeratorLink").classList.toggle("hidden",!account.isModerator);$("modQuickPanel").classList.add("hidden");$("modFlameColor").value=account.flameColor||"#ff9a35";invisibleMode=false;refreshAccountUI();updateTeamUI();loadSpriteCatalog();});
  socket.on("accountUpdate",d=>{const oldAvatar=account?.avatarUrl;account={...account,...d};refreshAccountUI();updateTeamUI();$("nameHud").textContent=accountPilotName();$("modQuickToggle").classList.toggle("hidden",!account.isModerator||privateSpectator);$("mainModeratorLink").classList.toggle("hidden",!account.isModerator);if(!account.isModerator)$("modQuickPanel").classList.add("hidden");if(d.flameColor)$("modFlameColor").value=d.flameColor;if(d.avatarUrl&&d.avatarUrl!==oldAvatar)$("avatarMsg").textContent="Profile photo saved.";if(d.email){$("profileEmail").value=d.email;if(!$("profilePage").classList.contains("hidden"))$("profileMsg").textContent="Profile saved."; }});
  socket.on("player:playResult",result=>{const button=$("mainPlayBtn");button.disabled=false;if(result.error){$("mainMenuMsg").textContent=result.error;return;}account={...account,...result.account};currentRegion=result.region;currentMatchMode=result.matchMode;privateSpectator=!!result.privateSpectator;mainMenuActive=false;spectateTargetId=null;$("mainMenuMsg").textContent="";$("mainMenu").classList.add("hidden");$("game").classList.remove("inMainMenu");$("observerTab").classList.toggle("hidden",!privateSpectator);$("serverHud").textContent=`${currentRegion} · ${currentMatchMode.toUpperCase()}`;$("modQuickToggle").classList.toggle("hidden",!account.isModerator||privateSpectator);$("returnMainMenuBtn").classList.remove("hidden");refreshAccountUI();});
  socket.on("player:lobbyResult",result=>{if(result.error){$("mainMenuMsg").textContent=result.error;return;}account={...account,...result.account};currentRegion=result.region;currentMatchMode=result.matchMode;privateSpectator=false;mainMenuActive=true;spectateTargetId=null;$("game").classList.add("inMainMenu");$("mainMenu").classList.remove("hidden");$("mainMenuHome").classList.remove("hidden");$("friendsView").classList.add("hidden");$("menu").classList.add("hidden");$("serverHud").textContent=`${currentRegion} · ${currentMatchMode.toUpperCase()}`;$("observerTab").classList.add("hidden");$("mainMenuMsg").textContent="";$("returnMainMenuBtn").classList.add("hidden");refreshAccountUI();});
  socket.on("friends:data",renderFriends);socket.on("friends:error",message=>{$("friendsMessage").textContent=message;});socket.on("friends:message",message=>{$("friendsMessage").textContent=message;socket.emit("friends:list");});socket.on("friend:requestReceived",data=>{socket.emit("friends:list");$("friendsMessage").textContent=`Friend request from ${data.from.name}.`;});
  socket.on("dm:history",data=>{if(data?.friend?.uid!==currentDMUid)return;$('dmFriendName').textContent=data.friend.name;$('dmFriendStatus').textContent=data.friend.online?"● ONLINE":"○ OFFLINE";renderDMHistory(data.messages||[]);unreadDMs[currentDMUid]=0;updateDMUnread();});
  socket.on("dm:message",data=>{if(!data?.message||!data.peer)return;if(data.peer.uid===currentDMUid){appendDMMessage(data.message);unreadDMs[currentDMUid]=0;}else if(data.message.fromUid!==account?.uid){unreadDMs[data.peer.uid]=(unreadDMs[data.peer.uid]||0)+1;}updateDMUnread();if($("friendsView").classList.contains("hidden")===false)socket.emit("friends:list");});
  socket.on("dm:error",message=>{$("dmStatus").textContent=message;});
  socket.on("profile:avatarError",message=>{clearTimeout(avatarUploadTimer);$("avatarMsg").textContent=message;updateAvatarImages(account?.avatarUrl||"");});socket.on("avatarRemoved",()=>{$("avatarMsg").textContent="Profile photo removed.";});
  socket.on("shopError",m=>{$("shopMsg").textContent=m;setTimeout(()=>$("shopMsg").textContent="",2200)});
  socket.on("spriteStoreError",m=>{$("spriteStoreMsg").style.color="#ffb4a2";$("spriteStoreMsg").textContent=m;setTimeout(()=>$("spriteStoreMsg").textContent="",2600)});
  socket.on("spriteStoreSuccess",m=>{$("spriteStoreMsg").style.color="#83ddb4";$("spriteStoreMsg").textContent=m;$("spriteRedeemCode").value="";setTimeout(()=>$("spriteStoreMsg").textContent="",4000)});
  socket.on("state",s=>{state=s;const me=s.entities.find(e=>e.id===myId);if(privateSpectator)refreshSpectateRoster(s.entities);if(account?.isModerator&&!privateSpectator){refreshModSpectateRoster(s.entities);if(me){invisibleMode=!!me.isInvisible;$("invisibleToggle").textContent=invisibleMode?"GO VISIBLE":"GO INVISIBLE";}}if(spectateTargetId&&!s.entities.some(e=>e.id===spectateTargetId)){spectateTargetId=null;const message=account?.isModerator&&!privateSpectator?$("modQuickMsg"):$("spectatorMsg");message.textContent="Pilot left the sector. Choose another pilot.";}if(s.match?.mode==="tdm")$("matchScoreHud").textContent=s.match.score.red+" - "+s.match.score.blue;else $("matchScoreHud").textContent="";if(me){liveScore=me.score;liveKills=me.kills;$("scoreHud").textContent=me.score;$("killsHud").textContent=me.kills;$("levelHud").textContent=me.level??(1+Math.floor(me.score/500));renderMissions();}});
  socket.on("mod:result",result=>{if(result.error){$("modQuickMsg").textContent=result.error;return;}if(Object.prototype.hasOwnProperty.call(result,"spectateTargetId")){spectateTargetId=result.spectateTargetId;$("modQuickMsg").textContent=result.message||"Spectator view updated.";}else if(result.isInvisible!==undefined){invisibleMode=result.isInvisible;$("invisibleToggle").textContent=invisibleMode?"GO VISIBLE":"GO INVISIBLE";$("modQuickMsg").textContent=result.message||"Visibility updated.";}else if(result.coins!==undefined){account.coins=result.coins;refreshAccountUI();$("modQuickMsg").textContent=result.message||"Coin balance updated.";$("modCoinsAmount").value="";}else if(result.flameColor){$("modQuickMsg").textContent=result.message||"Flame color saved.";}});
  socket.on("spectator:target",target=>{spectateTargetId=target.id;$("spectatorMsg").textContent=`Now spectating ${target.name}.`;});
  socket.on("spectator:error",message=>$("spectatorMsg").textContent=message);
  socket.on("chat:message",appendChatMessage);socket.on("chat:error",message=>appendChatMessage({name:"SYSTEM",text:message,channel:"system"}));
  socket.on("private:mode",data=>{if(data?.region!==currentRegion)return;currentMatchMode=data.matchMode;$("serverHud").textContent=`${currentRegion} · ${currentMatchMode.toUpperCase()}`;$("matchMode").value=currentMatchMode;});
  socket.on("init",updatePrivateChatHelp);socket.on("player:playResult",updatePrivateChatHelp);socket.on("player:lobbyResult",updatePrivateChatHelp);
  socket.on("team:error",message=>$("teamMsg").textContent=message);socket.on("team:message",message=>$("teamMsg").textContent=message);socket.on("teamRoster",data=>renderTeamRoster(data.members||[]));socket.on("team:invites",renderTeamInvites);
  socket.connect();
}
function startPingMonitor(){clearInterval(pingTimer);pingRequestPending=false;pingValue=null;updatePingDisplay();const measure=()=>{if(!socket?.connected||pingRequestPending)return;pingRequestPending=true;const started=performance.now();const timeout=setTimeout(()=>{pingRequestPending=false;},2500);socket.emit("network:ping",Date.now(),()=>{clearTimeout(timeout);pingRequestPending=false;pingValue=Math.max(0,Math.round(performance.now()-started));updatePingDisplay();});};measure();pingTimer=setInterval(measure,3000);}
function updatePingDisplay(){const el=$("pingHud");if(!el)return;el.textContent=pingValue===null?"PING --":`PING ${pingValue} ms`;el.classList.toggle("pingGood",pingValue!==null&&pingValue<100);el.classList.toggle("pingFair",pingValue!==null&&pingValue>=100&&pingValue<220);el.classList.toggle("pingPoor",pingValue!==null&&pingValue>=220);}
(function restore(){try{const saved=JSON.parse(localStorage.getItem("spaceJetAccount")||"null");if(saved){account=saved;}}catch{};if(account) setTimeout(connectServer,300);})();

function refreshAccountUI(){
  const coins=account?.coins||0;
  $("coinsHud").textContent=coins;
  $("mainMenuName").textContent=accountPilotName();$("mainMenuLevel").textContent=account?.level||1;$("mainMenuCoins").textContent=coins;
  updateAvatarImages(account?.avatarUrl||"");
  $("shopCoins").textContent=coins;
  $("upgradeCoins").textContent=coins;
  $("spriteCoins").textContent=coins;
  renderShop(); renderUpgrades();renderMissions();renderSpriteStore();
}
function updateAvatarImages(url){
  const images=[$("mainMenuAvatar"),$("profileAvatarPreview")];
  for(const image of images){if(url){image.src=url;image.classList.remove("avatarEmpty");}else{image.removeAttribute("src");image.classList.add("avatarEmpty");}}
}
async function loadSpriteCatalog(){
  try{
    const response=await fetch("/api/shop/sprites",{cache:"no-store"});
    if(!response.ok)throw new Error("Sprite shop unavailable");
    const data=await response.json();
    spriteCatalog=Array.isArray(data.items)?data.items:[];
    spriteCatalog.forEach(item=>{if(!customSpriteImages[item.id]){const image=new Image();image.src=item.imageUrl;customSpriteImages[item.id]=image;}});
    renderSpriteStore();
  }catch{$("spriteShop").innerHTML='<div class="shopNote">Could not load the sprite bay. Reopen the shop to retry.</div>';}
}
function renderSpriteStore(){
  const el=$("spriteShop");if(!el)return;
  const owned=new Set(account?.inventory||[]);
  const offers=spriteCatalog.filter(item=>item.available!==false||owned.has(item.id));
  if(!offers.length){el.innerHTML='<div class="shopNote">No community sprites are available yet.</div>';return;}
  el.innerHTML=offers.map(item=>{
    const isOwned=owned.has(item.id),isEquipped=account?.spriteId===item.id;
    const action=isOwned?"equipSprite":"buySprite";
    const label=isEquipped?"EQUIPPED":isOwned?"EQUIP":"BUY "+numberText(item.price);
    const priceLabel=item.available===false&&isOwned?"OWNED · DELISTED":numberText(item.price)+" COINS";
    return '<article class="spriteOffer"><img src="'+escapeHtml(item.imageUrl)+'" alt=""><div class="spriteOfferInfo"><div class="spriteOfferName">'+escapeHtml(item.name)+'</div><div class="spriteOfferPrice">'+priceLabel+'</div></div><button data-sprite-action="'+action+'" data-sprite-id="'+escapeHtml(item.id)+'" '+(isEquipped?"disabled":"")+'>'+label+'</button></article>';
  }).join("");
  el.querySelectorAll("[data-sprite-action]").forEach(button=>button.onclick=()=>{
    $("spriteStoreMsg").textContent="";
    socket.emit(button.dataset.spriteAction,button.dataset.spriteId);
  });
}
function numberText(value){return new Intl.NumberFormat().format(value||0)}
function accountPilotName(){return `${account?.teamName?`<${account.teamName}> ${account?.displayName||account?.username||"PILOT"}`:(account?.displayName||account?.username||"PILOT")}${account?.isModerator?" (MOD)":""}`;}
function openLobbyMenu(page){
  mainMenuActive=true;$("mainMenu").classList.add("hidden");$("menu").classList.remove("hidden");$("returnMainMenuBtn").classList.add("hidden");prepareMenu(page);
}
function prepareMenu(page="shopPage"){
  $("profileEmail").value=account?.email||"";$("editName").value=account?.displayName||account?.username||"";editJet=account?.jet||"blue";jetPicker($("editJetPick"),editJet,j=>editJet=j);refreshAccountUI();loadBoard();loadSpriteCatalog();showPage(page);
}
$("mainPlayBtn").addEventListener("click",()=>{
  const button=$("mainPlayBtn");button.disabled=true;$("mainMenuMsg").textContent="Entering sector…";
  socket.emit("player:play",{region:$("serverRegion").value,matchMode:$("matchMode").value,regionCode:$("privateRegionCode").value});
});
$("mainShopBtn").addEventListener("click",()=>openLobbyMenu("shopPage"));
$("mainProfileBtn").addEventListener("click",()=>openLobbyMenu("profilePage"));
$("mainFriendsBtn").addEventListener("click",()=>{$("mainMenuHome").classList.add("hidden");$("friendsView").classList.remove("hidden");$("friendsDirectory").classList.remove("hidden");$("dmView").classList.add("hidden");currentDMUid="";$("friendsMessage").textContent="";socket.emit("friends:list");});
$("friendsBackBtn").addEventListener("click",()=>{$("friendsView").classList.add("hidden");$("mainMenuHome").classList.remove("hidden");currentDMUid="";});
$("dmBackBtn").addEventListener("click",()=>{currentDMUid="";$("dmView").classList.add("hidden");$("friendsDirectory").classList.remove("hidden");socket.emit("friends:list");});
$("mainLogoutBtn").addEventListener("click",logout);
$("returnMainMenuBtn").addEventListener("click",()=>{socket.emit("player:lobby");$("mainMenuMsg").textContent="Returning to the lobby…";});
$("friendRequestForm").addEventListener("submit",event=>{event.preventDefault();const lookup=$("friendLookup").value.trim();if(!lookup)return;socket.emit("friend:request",lookup);$("friendLookup").value="";});
$("incomingFriendRequests").addEventListener("click",event=>{const button=event.target.closest("[data-friend-action]");if(!button)return;socket.emit(button.dataset.friendAction,button.dataset.uid);});
$("friendsList").addEventListener("click",event=>{const button=event.target.closest("[data-friend-action], [data-dm-uid]");if(!button)return;if(button.dataset.dmUid){openDM(button.dataset.dmUid);return;}socket.emit(button.dataset.friendAction,button.dataset.uid);});
$("dmComposeForm").addEventListener("submit",event=>{event.preventDefault();const text=$("dmInput").value.trim();if(!text||!currentDMUid)return;$("dmStatus").textContent="";socket.emit("dm:send",{toUid:currentDMUid,text},result=>{if(result?.error){$("dmStatus").textContent=result.error;return;}$("dmInput").value="";$("dmInput").focus();});});
function renderFriends(data){
  if(!data)return;friendsDataCache=data;friendsCache=data.friends||[];const friendRows=friendsCache.map(friend=>friendCard(friend,`<button data-dm-uid="${escapeHtml(friend.uid)}">MESSAGE${unreadDMs[friend.uid]?` (${unreadDMs[friend.uid]})`:""}</button><button data-friend-action="friend:remove" data-uid="${escapeHtml(friend.uid)}">REMOVE</button>`)).join("");
  const incomingRows=(data.incoming||[]).map(friend=>friendCard(friend,`<button data-friend-action="friend:accept" data-uid="${escapeHtml(friend.uid)}">ACCEPT</button><button data-friend-action="friend:decline" data-uid="${escapeHtml(friend.uid)}">DECLINE</button>`)).join("");
  const outgoingRows=(data.outgoing||[]).map(friend=>friendCard(friend,"<span class=friendPending>PENDING</span>")).join("");
  $("friendsList").innerHTML=friendRows||'<div class="friendsEmpty">No friends yet. Search by username or UID to send a request.</div>';
  $("incomingFriendRequests").innerHTML=incomingRows||'<div class="friendsEmpty">No new requests.</div>';
  $("outgoingFriendRequests").innerHTML=outgoingRows||'<div class="friendsEmpty">No pending requests.</div>';
  $("friendRequestCount").textContent=data.incoming?.length?`(${data.incoming.length})`:"";
}
function updateDMUnread(){const total=Object.values(unreadDMs).reduce((sum,count)=>sum+count,0);$("mainFriendsBtn").dataset.unread=total?String(total):"";if(friendsDataCache&&!$("friendsView").classList.contains("hidden"))renderFriends(friendsDataCache);}
function openDM(uid){const friend=friendsCache.find(entry=>entry.uid===uid);if(!friend)return;currentDMUid=uid;$("friendsDirectory").classList.add("hidden");$("dmView").classList.remove("hidden");$("dmFriendName").textContent=friend.name;$("dmFriendStatus").textContent=friend.online?"● ONLINE":"○ OFFLINE";$("dmMessages").innerHTML="";$("dmStatus").textContent="Loading messages…";socket.emit("dm:open",uid,result=>{if(result?.error)$("dmStatus").textContent=result.error;});$("dmInput").focus();}
function renderDMHistory(messages){$("dmMessages").replaceChildren();for(const message of messages)appendDMMessage(message);$("dmStatus").textContent="";}
function appendDMMessage(message){const row=document.createElement("div");row.className=`dmMessage${message.fromUid===account?.uid?" own":""}`;const meta=document.createElement("div");meta.className="dmMessageMeta";meta.textContent=`${message.name||"Pilot"} · ${new Date(message.at||Date.now()).toLocaleString()}`;const body=document.createElement("div");body.className="dmMessageText";body.textContent=message.text||"";row.append(meta,body);$("dmMessages").appendChild(row);$("dmMessages").scrollTop=$("dmMessages").scrollHeight;}
function friendCard(friend,actions){
  const initials=escapeHtml((friend.name||friend.username||"?").trim().slice(0,2).toUpperCase());
  const avatar=friend.avatarUrl?`<img src="${escapeHtml(friend.avatarUrl)}" alt="">`:initials;
  return `<div class="friendCard"><div class="friendAvatar ${friend.avatarUrl?"hasImage":""}">${avatar}</div><div class="friendInfo"><strong>${escapeHtml(friend.name||friend.username)}</strong><span>${friend.online?"● ONLINE":"○ OFFLINE"} · ${escapeHtml(friend.uid)}</span></div><div class="friendActions">${actions}</div></div>`;
}
function readProfilePhoto(file){
  if(!file)return;if(!file.type.startsWith("image/")){$("avatarMsg").textContent="Choose an image file.";return;}
  const image=new Image(),reader=new FileReader();reader.onload=()=>{image.onload=()=>{const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=256;canvas.height=256;const scale=Math.max(256/image.width,256/image.height),width=image.width*scale,height=image.height*scale;ctx.drawImage(image,(256-width)/2,(256-height)/2,width,height);const dataUrl=canvas.toDataURL("image/jpeg",.82);if(dataUrl.length>600000){$("avatarMsg").textContent="This photo is too detailed. Choose a smaller image.";return;}if(!socket?.connected){$("avatarMsg").textContent="Game server is disconnected. Reconnect before uploading.";return;}$("profileAvatarPreview").src=dataUrl;$("mainMenuAvatar").src=dataUrl;$("avatarMsg").textContent="Uploading photo…";clearTimeout(avatarUploadTimer);avatarUploadTimer=setTimeout(()=>{if($("avatarMsg").textContent==="Uploading photo…"){$("avatarMsg").textContent="No response from the game server. Stop it with Ctrl+C, run npm start, then refresh this page.";updateAvatarImages(account?.avatarUrl||"");}},12000);socket.emit("profile:avatar",dataUrl,result=>{clearTimeout(avatarUploadTimer);if(!result?.ok){$("avatarMsg").textContent=result?.error||"The game server did not confirm the photo upload. Restart it and refresh.";updateAvatarImages(account?.avatarUrl||"");return;}account.avatarUrl=result.avatarUrl;updateAvatarImages(result.avatarUrl);$("avatarMsg").textContent="Profile photo saved.";});};image.onerror=()=>$("avatarMsg").textContent="Could not read that photo.";image.src=reader.result;};reader.onerror=()=>$("avatarMsg").textContent="Could not read that photo file.";reader.readAsDataURL(file);
}
$("profilePhotoFile").addEventListener("change",event=>readProfilePhoto(event.target.files?.[0]));
$("removeProfilePhoto").addEventListener("click",()=>socket.emit("profile:avatarRemove"));
setInterval(()=>{if(socket?.connected&&account)socket.emit("friends:list");},10000);
function updateTeamUI(){
  const inTeam=!!account?.teamId;
  $("teamActions").classList.toggle("hidden",inTeam);
  $("teamRecruitControls").classList.toggle("hidden",!inTeam||!account?.teamLeader);
  $("teamCurrent").textContent=inTeam?`${account.teamName}${account.teamLeader?" · TEAM LEADER":""}`:"You are not in a team. Create one at level 30 for 1,200 coins, or accept a leader's recruitment request below.";
  $("teamCurrent").innerHTML=inTeam?`${escapeHtml(account.teamName)}${account.teamLeader?" · TEAM LEADER":""} <button id="leaveTeamBtn" class="actionButton danger">LEAVE TEAM</button>`:"You are not in a team. Creating a team requires level 30 and 1,200 coins.";
  const teamOption=$("chatChannel").querySelector('option[value="team"]');if(teamOption)teamOption.disabled=!inTeam;
  if(inTeam)loadTeamRoster();else $("teamRoster").innerHTML="";
}
async function loadTeamRoster(){if(!account?.teamId)return;try{const response=await fetch(`/api/teams/${encodeURIComponent(account.teamId)}`,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error);renderTeamRoster(data.team.members||[]);}catch(error){$("teamMsg").textContent=error.message;}}
function renderTeamRoster(members){
  if(!account?.teamId)return;
  $("teamRoster").innerHTML=`<div class="sectionTitle">TEAM ROSTER · ${members.length}</div>`+members.map(member=>`<div class="row"><span class="rank">${member.online?"●":"○"}</span><span>${escapeHtml(member.name)} · LV ${member.level}${member.leader?" · LEADER":""}</span>${account.teamLeader&&!member.leader?`<button class="actionButton" data-promote="${escapeHtml(member.uid)}">MAKE LEADER</button>`:""}</div>`).join("");
}
function renderTeamInvites(invites){
  const list=Array.isArray(invites)?invites:[];
  $("teamInvites").innerHTML=`<div class="sectionTitle">RECRUITMENT REQUESTS · ${list.length}</div>`+(list.length?list.map(invite=>`<div class="row"><span>${escapeHtml(invite.leaderName)} invited you to <b>${escapeHtml(invite.teamName)}</b></span><button class="actionButton" data-team-accept="${escapeHtml(invite.teamId)}">ACCEPT</button><button class="actionButton danger" data-team-decline="${escapeHtml(invite.teamId)}">DECLINE</button></div>`).join(""):"<p class=\"shopNote\">No pending recruitment requests.</p>");
}
$("createTeamBtn").addEventListener("click",()=>{const name=$("teamNameInput").value.trim();if(!name){$("teamMsg").textContent="Enter a team name.";return;}socket.emit("team:create",name);$("teamMsg").textContent="Creating team…";});
$("sendTeamRequestBtn").addEventListener("click",()=>{const name=$("teamRecruitName").value.trim();if(!name){$("teamMsg").textContent="Enter the player's username or UID.";return;}socket.emit("team:invite",name);});
$("teamRoster").addEventListener("click",event=>{const promote=event.target.closest("[data-promote]");if(promote)socket.emit("team:promote",promote.dataset.promote);});
$("teamInvites").addEventListener("click",event=>{const accept=event.target.closest("[data-team-accept]"),decline=event.target.closest("[data-team-decline]"),button=accept||decline;if(button)socket.emit("team:inviteRespond",{teamId:button.dataset.teamAccept||button.dataset.teamDecline,accept:!!accept});});
$("teamCurrent").addEventListener("click",event=>{if(event.target.closest("#leaveTeamBtn"))socket.emit("team:leave");});
function updatePrivateChatHelp(){const help=$("privateChatCommandHelp");if(help)help.classList.toggle("hidden",!String(currentRegion).endsWith("_private"));}
function appendChatMessage(message){const row=document.createElement("div");row.className="chatMessage";const channel=message.channel==="team"?"[TEAM] ":message.channel==="system"?"[SYSTEM] ":"";row.textContent=`${channel}${message.name}: ${message.text}`;$("chatMessages").appendChild(row);while($("chatMessages").children.length>80)$("chatMessages").firstElementChild.remove();$("chatMessages").scrollTop=$("chatMessages").scrollHeight;}
function sendChat(){const text=$("chatInput").value.trim();if(!text)return;socket.emit("chat:send",{channel:$("chatChannel").value,text});$("chatInput").value="";}
$("sendChatBtn").addEventListener("click",sendChat);$("chatInput").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();sendChat();}});
$("chatBtn").addEventListener("click",()=>{if($("menu").classList.contains("hidden"))toggleMenu();showPage("chatPage");});
function renderMissions(){
  const el=$("missionList");if(!el)return;
  const missions=[{title:"ASTEROID BREAKER",detail:"Score 500 points",value:liveScore,goal:500},{title:"ACE PILOT",detail:"Earn 10 takedowns",value:liveKills,goal:10},{title:"SECTOR VETERAN",detail:"Reach level 5",value:Math.floor(liveScore/500)+1,goal:5}];
  el.innerHTML=missions.map(m=>{const pct=Math.min(100,Math.floor(m.value/m.goal*100));return `<article class="missionCard"><div class="missionHead"><b>${m.title}</b><span>${Math.min(m.value,m.goal)} / ${m.goal}</span></div><p>${m.detail}</p><div class="missionTrack"><i style="width:${pct}%"></i></div></article>`}).join("");
}
function renderShop(){
  if(!$("shopJets"))return;
  $("shopJets").innerHTML=jets.map(j=>`<button class="shopJet ${account?.jet===j?"chosen":""}" data-jet="${j}"><img src="/assets/${j}.png"><span>${j.toUpperCase()}</span><small>${account?.jet===j?"EQUIPPED":"UNLOCKED"}</small></button>`).join("");
  document.querySelectorAll(".shopJet").forEach(b=>b.onclick=()=>equipJet(b.dataset.jet));
}
function renderUpgrades(){
  if(!$("upgradeList"))return;
  const levels=account?.upgrades||{};
  $("upgradeList").innerHTML=Object.entries(upgradeInfo).map(([type,info])=>{
    const level=levels[type]||0, maxed=level>=5, cost=maxed?0:upgradeCosts[level];
    return `<div class="upgradeCard"><div class="upgradeIcon">${info.icon}</div><div class="upgradeMain"><div class="upgradeName">${info.name}<span>LV ${level}/5</span></div><div class="upgradeDesc">${info.desc}</div><div class="bars">${[0,1,2,3,4].map(i=>`<i class="${i<level?"on":""}"></i>`).join("")}</div></div><button class="buyBtn" data-upgrade="${type}" ${maxed?"disabled":""}>${maxed?"MAX":"BUY ${cost}"}</button></div>`;
  }).join("");
  document.querySelectorAll(".buyBtn").forEach(b=>b.onclick=()=>socket.emit("buyUpgrade",b.dataset.upgrade));
}
function equipJet(j){
  account.jet=j; refreshAccountUI();
  socket.emit("setProfile",{name:account.displayName,jet:j});
}

function tone(freq=420,duration=.055,wave="square",volume=.025){
  if(!soundOn)return;
  try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=wave;o.frequency.value=freq;g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch{}
}
$("soundBtn").onclick=()=>{$("soundBtn").textContent=soundOn?"SOUND OFF":"SOUND ON";soundOn=!soundOn;if(soundOn)tone(660,.08,"sine")};

const canvas=$("canvas"),ctx=canvas.getContext("2d");
window.addEventListener("keydown",e=>{if(e.target instanceof HTMLElement&&(e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))return;keys[e.code]=true;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();if(e.code==="Escape")toggleMenu()});
window.addEventListener("keyup",e=>{keys[e.code]=false});
$("chatInput").addEventListener("focus",()=>{keys={};});
$("chatInput").addEventListener("blur",()=>{keys={};});
canvas.onmousedown=()=>mouseDown=true;window.onmouseup=()=>mouseDown=false;
function inputLoop(){
  const chatFocused=document.activeElement===$("chatInput"),shooting=!chatFocused&&(keys.Space||mouseDown);
  if(myId && !mainMenuActive && !privateSpectator && $("menu").classList.contains("hidden")) socket.emit("input",{up:!chatFocused&&(keys.KeyW||keys.ArrowUp),down:!chatFocused&&(keys.KeyS||keys.ArrowDown),left:!chatFocused&&(keys.KeyA||keys.ArrowLeft),right:!chatFocused&&(keys.KeyD||keys.ArrowRight),shoot:shooting});
  if(shooting&&Date.now()-lastShotTone>180){lastShotTone=Date.now();tone(360,.045,"sawtooth",.012)}
  requestAnimationFrame(inputLoop);
}inputLoop();

$("menuBtn").onclick=toggleMenu;$("closeMenu").onclick=toggleMenu;$("logoutBtn").onclick=logout;
function logout(){
  if(socket?.connected)socket.disconnect();
  localStorage.removeItem("spaceJetAccount");
  account=null;myId=null;keys={};mouseDown=false;mainMenuActive=false;
  state={entities:[],bullets:[],asteroids:[]};
  $("game").classList.add("hidden");$("menu").classList.add("hidden");$("auth").classList.remove("hidden");
  $("username").value="";$("password").value="";$("email").value="";$("authMsg").textContent="";
  mode="login";
  document.querySelectorAll(".tab").forEach(tab=>tab.classList.toggle("active",tab.dataset.mode==="login"));
  $("registerOnly").classList.add("hidden");$("authBtn").textContent="ENTER SECTOR";
  $("username").focus();
}
function toggleMenu(){
  if(mainMenuActive){
    if(!$("mainMenu").classList.contains("hidden"))return;
    if($("menu").classList.contains("hidden")){$("menu").classList.remove("hidden");$("mainMenu").classList.add("hidden");prepareMenu("shopPage");}
    else{$("menu").classList.add("hidden");$("mainMenu").classList.remove("hidden");}
    return;
  }
  $("menu").classList.toggle("hidden");
  if(!$("menu").classList.contains("hidden")){
    $("returnMainMenuBtn").classList.remove("hidden");prepareMenu("shopPage");
  }
}
document.querySelectorAll(".menuTab").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function showPage(page){
  document.querySelectorAll(".menuPage").forEach(x=>x.classList.toggle("hidden",x.id!==page));
  document.querySelectorAll(".menuTab").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  if(page==="leaderPage")loadBoard();if(page==="teamPage")updateTeamUI();
}
function refreshSpectateRoster(entities){
  const pilots=entities.filter(p=>p.id!==myId),key=pilots.map(p=>`${p.id}:${p.name}`).join("|");
  if(key===spectateRosterKey)return;spectateRosterKey=key;
  const select=$("spectateTarget"),selected=spectateTargetId||select.value;
  select.innerHTML='<option value="">Choose a pilot…</option>'+pilots.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
  if(pilots.some(p=>p.id===selected))select.value=selected;
  else if(privateSpectator&&pilots.length){select.value=pilots[0].id;socket.emit("spectator:target",pilots[0].id);}
}
let modSpectateRosterKey="";
function refreshModSpectateRoster(entities){
  const pilots=entities.filter(p=>p.id!==myId),key=pilots.map(p=>`${p.id}:${p.name}`).join("|");
  if(key===modSpectateRosterKey)return;modSpectateRosterKey=key;
  const select=$("modSpectateTarget"),selected=spectateTargetId||select.value;
  select.innerHTML='<option value="">Choose a pilot in this sector…</option>'+pilots.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.isInvisible?" · INVISIBLE":""}</option>`).join("");
  if(pilots.some(p=>p.id===selected))select.value=selected;
}
$("spectateBtn").addEventListener("click",()=>{if(!privateSpectator)return;const target=$("spectateTarget").value;if(!target){$("spectatorMsg").textContent="Choose an online pilot.";return;}socket.emit("spectator:target",target);$("spectatorMsg").textContent="Changing spectator view…";});
$("modQuickToggle").addEventListener("click",()=>$("modQuickPanel").classList.toggle("hidden"));
$("invisibleToggle").addEventListener("click",()=>socket.emit("mod:invisible",!invisibleMode));
$("modSetCoins").addEventListener("click",()=>{const raw=$("modCoinsAmount").value.trim(),amount=Number(raw);if(!raw||!Number.isSafeInteger(amount)||amount<0){$("modQuickMsg").textContent="Enter a nonnegative whole number of coins.";return;}socket.emit("mod:setCoins",amount);$("modQuickMsg").textContent="Updating coin balance…";});
$("startModSpectate").addEventListener("click",()=>{const target=$("modSpectateTarget").value;if(!target){$("modQuickMsg").textContent="Choose a pilot in this region and mode.";return;}socket.emit("mod:spectate",target);$("modQuickMsg").textContent="Opening spectator view…";});
$("stopModSpectate").addEventListener("click",()=>socket.emit("mod:spectate",null));
$("modFlameColor").addEventListener("change",event=>{if(account?.isModerator)socket.emit("mod:flameColor",event.target.value);});
$("redeemSpriteCode").addEventListener("click",()=>{
  const code=$("spriteRedeemCode").value.trim();
  if(!code){$("spriteStoreMsg").textContent="Enter a sprite code first.";return;}
  $("spriteStoreMsg").textContent="Checking code…";
  socket.emit("redeemSpriteCode",code);
});
document.querySelectorAll(".moderatorLink").forEach(link=>link.addEventListener("click",event=>{
  if(!account?.isModerator)return;
  event.preventDefault();
  const tab=window.open("about:blank","_blank");
  if(!tab){$("profileMsg").textContent="Allow pop-ups to open the moderator room.";return;}
  const timeout=setTimeout(()=>{tab.close();$("profileMsg").textContent="Moderator handoff timed out. Try again.";},5000);
  socket.once("mod:ticket",handoff=>{
    clearTimeout(timeout);
    if(!handoff?.ticket){tab.close();$("profileMsg").textContent=handoff?.error||"Could not open moderator room.";return;}
    localStorage.setItem("spaceJetModeratorHandoff",JSON.stringify(handoff));
    tab.location.replace("/moderator.html");
  });
  socket.emit("mod:ticket");
}));
$("saveProfile").onclick=()=>{
  const name=$("editName").value.trim()||account.username;
  const email=$("profileEmail").value.trim();
  if(!email){$("profileMsg").textContent="Add an email address to keep this pilot account recoverable.";return;}
  account.displayName=name;account.jet=editJet;account.email=email;
  $("profileMsg").textContent="Saving profile…";
  socket.emit("setProfile",{name,jet:editJet,email});
  $("nameHud").textContent=name+(account.isModerator?" (MOD)":"");refreshAccountUI();
};
async function loadBoard(){
  const r=await fetch("/api/leaderboard"),rows=await r.json();
  $("leaderboard").innerHTML=rows.map((x,i)=>`<div class="row"><span class="rank">${i+1}</span><span>${escapeHtml(x.name)}</span><span class="score">${x.score}</span></div>`).join("")||"No pilots yet.";
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

const imgs={};["space","rock1","rock2","blue","red","yellow","green","laser","flame"].forEach(k=>{imgs[k]=new Image();imgs[k].src="/assets/"+k+".png"});
function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}addEventListener("resize",resize);resize();
function draw(){
  const w=innerWidth,h=innerHeight,me=state.entities.find(e=>e.id===myId),view=spectateTargetId?state.entities.find(e=>e.id===spectateTargetId):me;
  if(view){camera.x=view.x-w/2;camera.y=view.y-h/2}
  camera.x=Math.max(0,Math.min(world.w-w,camera.x));camera.y=Math.max(0,Math.min(world.h-h,camera.y));
  ctx.clearRect(0,0,w,h);
  for(let x=-((camera.x*.25)%512);x<w;x+=512)for(let y=-((camera.y*.25)%512);y<h;y+=512)ctx.drawImage(imgs.space,x,y,512,512);
  ctx.save();ctx.translate(-camera.x,-camera.y);
  state.asteroids.forEach(a=>ctx.drawImage(imgs[a.kind===1?"rock1":"rock2"],a.x-32,a.y-32,a.size,a.size));
  (state.supplies||[]).forEach(s=>{ctx.fillStyle=s.kind==="coins"?"#ffd34f":s.kind==="repair"?"#64e4a2":"#65cfff";ctx.fillRect(s.x-13,s.y-13,26,26);ctx.fillStyle="#10151c";ctx.font="bold 14px Arial";ctx.textAlign="center";ctx.fillText(s.kind==="coins"?"$":s.kind==="repair"?"+":"✦",s.x,s.y+5);});
  state.bullets.forEach(b=>ctx.drawImage(imgs.laser,b.x-12,b.y-12,24,24));
  state.entities.forEach(p=>{
    if(p.hp<=0)return;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle+Math.PI/2);
    if(p.moving){const flameColor=p.isModerator?(p.flameColor||"#ff9a35"):"#ff9a35",flicker=35+Math.random()*13,gradient=ctx.createLinearGradient(0,20,0,56);gradient.addColorStop(0,flameColor);gradient.addColorStop(.62,flameColor+"cc");gradient.addColorStop(1,"#ffb34700");ctx.globalAlpha=.65+Math.random()*.25;ctx.shadowBlur=13;ctx.shadowColor=flameColor;ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(-9,20);ctx.quadraticCurveTo(-8,31,-5,38);ctx.lineTo(-2,31);ctx.quadraticCurveTo(0,flicker,2,31);ctx.lineTo(5,39);ctx.quadraticCurveTo(9,29,9,20);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=.9;ctx.fillStyle="#fff1b5";ctx.beginPath();ctx.moveTo(-3,21);ctx.quadraticCurveTo(-1,29,0,34);ctx.quadraticCurveTo(2,29,3,21);ctx.closePath();ctx.fill();}ctx.globalAlpha=1;
    const customImage=p.spriteId&&customSpriteImages[p.spriteId];
    if(customImage?.complete&&customImage.naturalWidth){ctx.filter="none";ctx.drawImage(customImage,-32,-32,64,64);}
    else{ctx.filter="none";ctx.drawImage(imgs[p.jet],-32,-32,64,64);}
    ctx.restore();
    ctx.font="11px Arial";ctx.textAlign="center";ctx.fillStyle=p.side==="red"?"#ff7777":p.side==="blue"?"#68adff":p.isModerator?"#59c7ff":p.id===myId?"#fff":"#aaa";ctx.fillText(p.name,p.x,p.y-40);
    ctx.fillStyle="#222";ctx.fillRect(p.x-24,p.y-33,48,4);ctx.fillStyle="#fff";ctx.fillRect(p.x-24,p.y-33,48*Math.max(0,p.hp)/(p.maxHp||100),4);
  });
  ctx.restore();requestAnimationFrame(draw);
}draw();
