(() => {
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = { overlay: $('overlay'), title: $('overlayTitle'), copy: $('overlayCopy'), start: $('startButton'), score: $('liveScore'), best: $('bestScore'), last: $('lastScore'), flights: $('flightCount'), kills: $('totalKills'), lives: $('lives'), toast: $('toast'), sound: $('soundToggle'), network: $('networkState') };
  const STORE_KEY = 'spasiro-arcade-record-v1';
  let record;
  try { record = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { record = {}; }
  record = { best: Number(record.best) || 0, last: Number(record.last) || 0, flights: Number(record.flights) || 0, kills: Number(record.kills) || 0 };
  let W = 900, H = 580, dpr = 1, state = 'ready', previous = 0, elapsed = 0, score = 0, kills = 0, lives = 3, combo = 0, comboTimer = 0, difficulty = 1, spawnClock = 0, fireClock = 0, powerClock = 0, shield = 0, invulnerable = 0, audio = null, muted = false, toastTimer = 0;
  let ship, stars = [], rocks = [], enemies = [], shots = [], particles = [], pickups = [];
  const keys = { left: false, right: false, fire: false };
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v) => Math.floor(v).toString().padStart(6, '0');

  function saveRecord() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(record)); } catch { showToast('LOCAL STORAGE IS FULL'); }
    ui.best.textContent = fmt(record.best); ui.last.textContent = record.last ? fmt(record.last) : '—'; ui.flights.textContent = record.flights; ui.kills.textContent = record.kills;
  }
  saveRecord();

  function sound(freq, duration = .08, type = 'sine', volume = .045, slide = 0) {
    if (muted) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audio.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq + slide), audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
    } catch { /* Audio is optional on devices without Web Audio. */ }
  }
  function showToast(message) { ui.toast.textContent = message; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1300); }

  function resize() {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); W = rect.width; H = rect.height; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ship) { ship.x = clamp(ship.x, 34, W - 34); ship.y = H * .78; }
    if (!stars.length) stars = Array.from({ length: 105 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(.3, 1.6), r: rand(.35, 1.5) }));
  }
  window.addEventListener('resize', resize); new ResizeObserver(resize).observe(canvas); resize();

  function resetRun() {
    score = 0; kills = 0; lives = 3; combo = 0; comboTimer = 0; difficulty = 1; elapsed = 0; spawnClock = .55; fireClock = 0; powerClock = 12; shield = 0; invulnerable = 1.1;
    ship = { x: W / 2, y: H * .78, tilt: 0 };
    rocks = []; enemies = []; shots = []; particles = []; pickups = [];
    ui.score.textContent = fmt(score); updateLives();
  }
  function startRun() {
    if (state === 'playing') return;
    if (state === 'paused') { state = 'playing'; previous = performance.now(); ui.overlay.classList.add('hidden'); requestAnimationFrame(loop); return; }
    resetRun(); state = 'playing'; previous = performance.now(); ui.overlay.classList.add('hidden'); sound(420, .14, 'triangle', .06, 360); requestAnimationFrame(loop);
  }
  function finishRun() {
    if (state !== 'playing') return;
    state = 'over'; const newBest = score > record.best; record.last = score; record.best = Math.max(record.best, score); record.flights++; record.kills += kills; saveRecord();
    ui.title.innerHTML = 'FLIGHT<br><em>COMPLETE</em>'; ui.copy.innerHTML = `SCORE <b style="color:#61e5ff">${fmt(score)}</b> &nbsp; · &nbsp; ${kills} DRONE${kills === 1 ? '' : 'S'} CLEARED<br>${newBest ? 'NEW PERSONAL RECORD!' : `PERSONAL BEST ${fmt(record.best)}`}`;
    ui.start.querySelector('span').textContent = 'FLY AGAIN'; ui.overlay.classList.remove('hidden'); sound(140, .45, 'sawtooth', .065, -85);
  }
  function updateLives() { ui.lives.textContent = '◆ '.repeat(lives).trim() || '—'; ui.lives.style.color = lives === 1 ? '#ff657e' : '#ff94b3'; ui.lives.setAttribute('aria-label', `${lives} lives remaining`); }

  function burst(x, y, color, count = 12, force = 130) {
    for (let i = 0; i < count; i++) { const a = rand(0, Math.PI * 2), v = rand(force * .2, force); particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(.25, .65), max: .65, size: rand(1.3, 3.7), color }); }
  }
  function addRock() {
    const r = rand(13, 29); rocks.push({ x: rand(r, W - r), y: -r - 8, r, vx: rand(-16, 16), vy: rand(100, 160) * difficulty, angle: rand(0, 6), spin: rand(-1.5, 1.5), sides: Math.floor(rand(7, 11)), shape: Array.from({ length: 11 }, () => rand(.75, 1.18)) });
  }
  function addEnemy() { const x = rand(45, W - 45); enemies.push({ x, y: -30, baseX: x, r: 14, vy: rand(76, 105) * difficulty, phase: rand(0, 6), fireAt: rand(1.1, 2.2) }); }
  function addPickup() { const kind = Math.random() < .72 ? 'shield' : 'life'; pickups.push({ x: rand(35, W - 35), y: -22, kind, r: 12, vy: 90 * difficulty, pulse: 0 }); }
  function fire() {
    shots.push({ x: ship.x - 8, y: ship.y - 18, vx: -12, vy: -520, life: 1.1 }, { x: ship.x + 8, y: ship.y - 18, vx: 12, vy: -520, life: 1.1 });
    sound(680, .045, 'square', .018, -310);
  }
  function hitPlayer() {
    if (invulnerable > 0 || shield > 0) { if (shield > 0) { shield = 0; burst(ship.x, ship.y, '#61e5ff', 22, 210); sound(560, .22, 'sine', .06, -210); showToast('SHIELD ABSORBED IMPACT'); } return; }
    lives--; invulnerable = 1.5; updateLives(); burst(ship.x, ship.y, '#ff738d', 23, 230); sound(180, .22, 'sawtooth', .07, -110);
    if (lives <= 0) finishRun();
  }
  function damageEnemy(enemy) {
    enemy.hp = (enemy.hp || 1) - 1;
    if (enemy.hp <= 0) { enemies.splice(enemies.indexOf(enemy), 1); kills++; combo = Math.min(combo + 1, 12); comboTimer = 2.8; score += 120 + combo * 15; burst(enemy.x, enemy.y, '#ffbd69', 16, 170); sound(260, .12, 'triangle', .05, 360); if (combo > 1) showToast(`${combo}× STREAK  +${120 + combo * 15}`); }
  }

  function update(dt) {
    elapsed += dt; difficulty = 1 + Math.min(elapsed / 58, 1.9); score += dt * (14 + difficulty * 5); ui.score.textContent = fmt(score);
    if (comboTimer > 0) comboTimer -= dt; else combo = 0;
    if (invulnerable > 0) invulnerable -= dt; if (shield > 0) shield -= dt;
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); ship.x = clamp(ship.x + dir * (W * .72) * dt, 28, W - 28); ship.tilt += (dir * .35 - ship.tilt) * Math.min(1, dt * 8);
    for (const star of stars) { star.y += (65 + star.z * (100 + difficulty * 38)) * dt; if (star.y > H + 2) { star.y = -2; star.x = rand(0, W); } }
    spawnClock -= dt; if (spawnClock <= 0) { addRock(); if (elapsed > 13 && Math.random() < .25) addEnemy(); spawnClock = Math.max(.24, rand(.54, 1.08) / difficulty); }
    powerClock -= dt; if (powerClock <= 0) { addPickup(); powerClock = rand(18, 26); }
    fireClock -= dt; if (keys.fire && fireClock <= 0) { fire(); fireClock = .19; }
    for (const rock of rocks) { rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.angle += rock.spin * dt; if (rock.x < rock.r || rock.x > W - rock.r) rock.vx *= -1; if (Math.hypot(rock.x - ship.x, rock.y - ship.y) < rock.r + 12) { rock.y = H + 100; hitPlayer(); } }
    for (const enemy of enemies) { enemy.y += enemy.vy * dt; enemy.phase += dt * 2.3; enemy.x = enemy.baseX + Math.sin(enemy.phase) * 38; enemy.fireAt -= dt; if (enemy.fireAt <= 0) { enemy.fireAt = rand(1.25, 2.3); shots.push({ x: enemy.x, y: enemy.y + 10, vx: (ship.x - enemy.x) * .24, vy: 220 * difficulty, life: 2, hostile: true }); } if (Math.hypot(enemy.x - ship.x, enemy.y - ship.y) < 25) { enemy.y = H + 100; hitPlayer(); } }
    for (const shot of shots) { shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt; if (!shot.hostile) { for (const enemy of enemies) if (Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < enemy.r + 5) { shot.life = 0; damageEnemy(enemy); break; } for (const rock of rocks) if (shot.life > 0 && Math.hypot(rock.x - shot.x, rock.y - shot.y) < rock.r) { shot.life = 0; score += 12; burst(shot.x, shot.y, '#8deaff', 4, 70); } } else if (Math.hypot(ship.x - shot.x, ship.y - shot.y) < 17) { shot.life = 0; hitPlayer(); } }
    for (const pickup of pickups) { pickup.y += pickup.vy * dt; pickup.pulse += dt * 5; if (Math.hypot(ship.x - pickup.x, ship.y - pickup.y) < pickup.r + 15) { pickup.y = H + 100; if (pickup.kind === 'shield') { shield = 7; showToast('SHIELD ACTIVE · 7 SEC'); sound(600, .28, 'sine', .055, 500); burst(ship.x, ship.y, '#61e5ff', 15, 130); } else { lives = Math.min(5, lives + 1); updateLives(); showToast('EXTRA LIFE +1'); sound(420, .28, 'triangle', .055, 480); } score += 50; } }
    for (const particle of particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= .985; particle.vy *= .985; particle.life -= dt; }
    rocks = rocks.filter(v => v.y < H + v.r + 10); enemies = enemies.filter(v => v.y < H + 40); shots = shots.filter(v => v.life > 0 && v.y > -30 && v.y < H + 25); pickups = pickups.filter(v => v.y < H + 30); particles = particles.filter(v => v.life > 0);
  }

  function drawShip() {
    if (invulnerable > 0 && Math.floor(invulnerable * 12) % 2 === 0) return;
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.tilt);
    ctx.shadowBlur = 18; ctx.shadowColor = '#5de7ff';
    ctx.fillStyle = '#58dfff'; ctx.beginPath(); ctx.moveTo(-7, 12); ctx.lineTo(-5, 23 + rand(0, 7)); ctx.lineTo(0, 16); ctx.fill(); ctx.beginPath(); ctx.moveTo(7, 12); ctx.lineTo(5, 23 + rand(0, 7)); ctx.lineTo(0, 16); ctx.fill();
    const body = ctx.createLinearGradient(-15, 0, 15, 0); body.addColorStop(0, '#7188a6'); body.addColorStop(.5, '#f4feff'); body.addColorStop(1, '#56dfff'); ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(5, -6); ctx.lineTo(17, 10); ctx.lineTo(7, 8); ctx.lineTo(5, 15); ctx.lineTo(-5, 15); ctx.lineTo(-7, 8); ctx.lineTo(-17, 10); ctx.lineTo(-5, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#28a9d1'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, 0); ctx.lineTo(0, 5); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    if (shield > 0) { ctx.strokeStyle = `rgba(97,229,255,${.55 + Math.sin(elapsed * 8) * .2})`; ctx.lineWidth = 2; ctx.shadowBlur = 20; ctx.shadowColor = '#61e5ff'; ctx.beginPath(); ctx.arc(ship.x, ship.y, 27, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
  }
  function drawRock(rock) { ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.angle); ctx.beginPath(); for (let i = 0; i < rock.sides; i++) { const a = i / rock.sides * Math.PI * 2, r = rock.r * rock.shape[i % rock.shape.length]; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = '#263344'; ctx.strokeStyle = '#61758a'; ctx.lineWidth = 1.2; ctx.shadowBlur = 12; ctx.shadowColor = '#455a70'; ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(-rock.r * .2, -rock.r * .16, rock.r * .19, 0, Math.PI * 2); ctx.fillStyle = '#101924'; ctx.fill(); ctx.restore(); }
  function drawEnemy(enemy) { ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.shadowBlur = 16; ctx.shadowColor = '#ff8b75'; ctx.fillStyle = '#ff896e'; ctx.strokeStyle = '#ffd095'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(-17, -9); ctx.lineTo(-5, -5); ctx.lineTo(0, -14); ctx.lineTo(5, -5); ctx.lineTo(17, -9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#431e2b'; ctx.fillRect(-2, -3, 4, 5); ctx.restore(); }
  function draw() {
    ctx.clearRect(0, 0, W, H); const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#080f1c'); bg.addColorStop(1, '#091321'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#56b5e508'; ctx.lineWidth = 1; for (let y = (elapsed * 35) % 58; y < H; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (const star of stars) { ctx.globalAlpha = .25 + star.z * .45; ctx.fillStyle = star.z > 1.25 ? '#9befff' : '#b7ccdc'; ctx.fillRect(star.x, star.y, star.r, star.r * (1 + star.z * 2)); } ctx.globalAlpha = 1;
    for (const rock of rocks) drawRock(rock); for (const enemy of enemies) drawEnemy(enemy);
    for (const shot of shots) { ctx.fillStyle = shot.hostile ? '#ff657e' : '#9bf5ff'; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle; ctx.fillRect(shot.x - (shot.hostile ? 2 : 1.5), shot.y - 8, shot.hostile ? 4 : 3, 13); } ctx.shadowBlur = 0;
    for (const pickup of pickups) { ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.rotate(Math.sin(pickup.pulse) * .12); ctx.shadowBlur = 15; ctx.shadowColor = pickup.kind === 'shield' ? '#61e5ff' : '#ff638c'; ctx.strokeStyle = ctx.shadowColor; ctx.lineWidth = 1.6; ctx.beginPath(); if (pickup.kind === 'shield') { ctx.arc(0, 0, 10 + Math.sin(pickup.pulse) * 1.5, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#61e5ff'; ctx.font = '12px sans-serif'; ctx.fillText('✦', -5, 4); } else { ctx.fillStyle = '#ff638c'; ctx.font = '16px sans-serif'; ctx.fillText('♥', -8, 6); } ctx.restore(); }
    for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); } ctx.globalAlpha = 1;
    if (ship) drawShip();
  }
  function loop(now) { if (state !== 'playing') return; const dt = Math.min(.035, (now - previous) / 1000 || .016); previous = now; update(dt); draw(); if (state === 'playing') requestAnimationFrame(loop); }

  ui.start.addEventListener('click', startRun);
  function bindHold(button, key) {
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture?.(e.pointerId); keys[key] = true; button.classList.add('active'); if (state !== 'playing' && key !== 'fire') startRun(); if (key === 'fire' && state !== 'playing') startRun(); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, e => { e.preventDefault(); keys[key] = false; button.classList.remove('active'); });
  }
  bindHold($('leftButton'), 'left'); bindHold($('rightButton'), 'right'); bindHold($('fireButton'), 'fire');
  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'A', 'd', 'D'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
    if (e.key === ' ' || e.key === 'ArrowUp') { keys.fire = true; if (state !== 'playing') startRun(); }
    if (e.key === 'Enter' && state !== 'playing') startRun();
    if (e.key === 'Escape' && state === 'playing') { state = 'paused'; ui.title.innerHTML = 'FLIGHT<br><em>PAUSED</em>'; ui.copy.innerHTML = 'Take a breath, pilot.<br>Your run is waiting.'; ui.start.querySelector('span').textContent = 'RESUME FLIGHT'; ui.overlay.classList.remove('hidden'); }
  });
  window.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false; if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false; if (e.key === ' ' || e.key === 'ArrowUp') keys.fire = false; });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.fire = false; });
  ui.sound.addEventListener('click', () => { muted = !muted; ui.sound.innerHTML = muted ? '♫ <span>SOUND OFF</span>' : '♫ <span>SOUND ON</span>'; ui.sound.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off'); if (!muted) sound(520, .09); });
  function syncNetwork() { const online = navigator.onLine; ui.network.textContent = online ? 'READY TO FLY' : 'OFFLINE · READY'; }
  window.addEventListener('online', syncNetwork); window.addEventListener('offline', syncNetwork); syncNetwork();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  // Draw a living starfield behind the title screen.
  ship = { x: W / 2, y: H * .78, tilt: 0 };
  function attract(now) { if (state === 'ready' || state === 'over') { const dt = Math.min(.05, (now - (previous || now)) / 1000); previous = now; for (const s of stars) { s.y += (14 + s.z * 24) * dt; if (s.y > H) { s.y = -2; s.x = rand(0, W); } } draw(); } requestAnimationFrame(attract); }
  requestAnimationFrame(attract);
})();
