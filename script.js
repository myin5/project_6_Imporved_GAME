/* =========================================================================
   Every Drop Matters – App Script (route-gated board + vertical menu)
   ========================================================================= */

/* ---------- DOM shortcuts ---------- */
const routes = ["home","stage","achievements","level1","challenge"];
const sections = Object.fromEntries(routes.map(r => [r, document.getElementById(r)]));
const navButtons = document.querySelectorAll('[data-route]');
const menuToggle = document.getElementById('menu-toggle');
const drawer = document.getElementById('main-menu');

/* Game containers & controls */
const boardWrap = document.querySelector('.board-wrap');
const board = document.getElementById('board');
const hudEl = document.querySelector('#level1 .hud');
const levelButtonsRow = document.querySelector('#level1 .row');
const pauseBtn = document.getElementById('btn-pause');
const exitBtn = document.getElementById('btn-exit1');
const resetBtn = document.getElementById('btn-reset-level');

/* =========================================================================
   Progressive enhancement (mute, toast, footer, HUD %)
   ========================================================================= */
(function ensureOptionalUI(){
  // 只保留 Simple/Hard（移除旧难度下拉）
  const oldDiff = document.getElementById('difficultySelect');
  if (oldDiff) oldDiff.parentElement?.remove();

  // HUD 百分比
  if (hudEl && !document.getElementById('progressPercent')) {
    const pct = document.createElement('div');
    pct.id = 'progressPercent';
    pct.className = 'score-box';
    pct.textContent = '0%';
    hudEl.appendChild(pct);
  }

  // Mute button
  if (hudEl && !document.getElementById('muteBtn')) {
    const mute = document.createElement('button');
    mute.id = 'muteBtn';
    mute.className = 'btn btn-small';
    mute.title = 'Mute/Unmute';
    mute.setAttribute('aria-pressed','false');
    mute.textContent = '🔊';
    hudEl.appendChild(mute);
  }
  // Milestone toast
  if (hudEl && !document.getElementById('toast')) {
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    hudEl.appendChild(toast);
  }
  // Footer links
  const footer = document.querySelector('footer');
  if (footer && footer.childElementCount === 0) {
    footer.classList.add('site-footer');
    footer.innerHTML = `
      <p>
        Learn more at
        <a href="https://www.charitywater.org" target="_blank" rel="noopener">charity: water</a>
        •
        <a href="https://www.charitywater.org/donate" target="_blank" rel="noopener">Donate</a>
      </p>`;
  }
})();

/* =========================================================================
   User + Storage
   ========================================================================= */
const USER_KEY = 'edm-user';
let currentUser = localStorage.getItem(USER_KEY) || 'guest';
function storageKey(){ return `edm-save:${currentUser}`; }

const store = {
  load(){ try { return JSON.parse(localStorage.getItem(storageKey())||'{}'); } catch { return {}; } },
  save(data){ localStorage.setItem(storageKey(), JSON.stringify(data)); },
  clear(){ localStorage.removeItem(storageKey()); }
};
let save = Object.assign({ completed: 0, unlocked: 1, achievements: {} }, store.load());

function injectLoginButton(){
  let btn = document.getElementById('btn-login');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'btn-login';
    drawer.appendChild(btn);
  }
  btn.textContent = `Login / Switch (${currentUser})`;
  btn.onclick = ()=>{
    const name = prompt('Enter a username to login/switch:', currentUser);
    if(!name) return;
    currentUser = name.trim() || 'guest';
    localStorage.setItem(USER_KEY, currentUser);
    save = Object.assign({ completed: 0, unlocked: 1, achievements: {} }, store.load());
    renderGlobalProgress(); renderStageGrid(); renderAchievements();
    goto('home'); injectLoginButton();
  };
}

/* =========================================================================
   Router
   ========================================================================= */
function toggleLevelUI(show){
  if(boardWrap) boardWrap.style.display = show ? 'block' : 'none';
  if(hudEl) hudEl.style.display = show ? 'grid' : 'none';
  if(levelButtonsRow) levelButtonsRow.style.display = show ? 'flex' : 'none';

  if(!show){
    stopRunner();
    if(board) board.innerHTML = '';
  }
}

function goto(route){
  routes.forEach(r => sections[r].hidden = (r !== route));
  navButtons.forEach(b => {
    if (b.dataset.route === route) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  drawer.classList.remove('open');
  menuToggle.setAttribute('aria-expanded','false');

  toggleLevelUI(route === 'level1');

  if(route === 'home') renderGlobalProgress();
  if(route === 'stage') renderStageGrid();
  if(route === 'achievements') renderAchievements();
  if(route === 'challenge') initSort();
  if(route !== 'level1') stopRunner();
}

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-route]');
  if(btn) goto(btn.dataset.route);
});
menuToggle.addEventListener('click', ()=>{
  const open = drawer.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', open ? 'true':'false');
});

document.getElementById('btn-reset-all')?.addEventListener('click', ()=>{
  if(!confirm(`Reset all progress for "${currentUser}"? This will clear achievements.`)) return;
  store.clear();
  save = { completed: 0, unlocked: 1, achievements: {} };
  renderGlobalProgress(); renderStageGrid(); renderAchievements();
  goto('home');
});

/* =========================================================================
   Home progress (6 drops: Simple=half, Hard=filled)
   ========================================================================= */
const TOTAL_STAGES = 6;
function renderGlobalProgress(){
  for(let i=1;i<=TOTAL_STAGES;i++){
    const el = document.querySelector(`.drops .drop[data-slot="${i-1}"]`);
    if(!el) continue;
    const hasS = !!save.achievements[`L${i}-S`];
    const hasH = !!save.achievements[`L${i}-H`];
    el.classList.remove('half','filled');
    if(hasH) el.classList.add('filled');
    else if(hasS) el.classList.add('half');
  }
}

/* =========================================================================
   Stage select (Simple / Hard)
   ========================================================================= */
function renderStageGrid(){
  const grid = document.getElementById('stage-grid');
  grid.innerHTML = '';
  for(let i=1;i<=TOTAL_STAGES;i++){
    const card = document.createElement('div');
    card.className = 'stage-card';
    card.innerHTML = `
      <div style="font-weight:900; margin-bottom:10px;">STAGE ${i}</div>
      <div class="mode-row" style="display:flex; gap:10px; justify-content:center;">
        <button class="btn btn-small" data-mode="S">Simple</button>
        <button class="btn btn-small" data-mode="H">Hard</button>
      </div>
    `;

    if(i>save.unlocked){
      card.classList.add('locked');
      card.querySelectorAll('button').forEach(b=> b.disabled = true);
      card.insertAdjacentHTML('beforeend', '<span class="badge">Locked</span>');
    }else{
      const hasS = !!save.achievements[`L${i}-S`];
      const hasH = !!save.achievements[`L${i}-H`];
      const label = [hasS?'✓ Simple':'', hasH?'★ Hard':''].filter(Boolean).join(' ');
      if(label) card.insertAdjacentHTML('beforeend', `<span class="badge">${label}</span>`);
      const btnS = card.querySelector('[data-mode="S"]');
      const btnH = card.querySelector('[data-mode="H"]');
      btnH.disabled = !hasS; // Hard 需先过 Simple
      btnS.addEventListener('click', ()=>{
        goto('level1');
        if(i === 6) startStage6Placeholder(); else startRunner(i,'S');
      });
      btnH.addEventListener('click', ()=>{
        if(btnH.disabled) return;
        goto('level1');
        if(i === 6) startStage6Placeholder(); else startRunner(i,'H');
      });
    }

    grid.appendChild(card);
  }
}

/* =========================================================================
   Achievements（Tab 分别统计 & 可点击）
   ========================================================================= */
let achTab = 'simple';
const achList = document.getElementById('ach-list');
const achP = document.getElementById('ach-p');

function achievementMeta(level, tab){
  return (tab === 'simple')
    ? { ach:`Complete Stage ${level} (Simple)`, reward:`Revive and mark Simple` }
    : { ach:`Complete Stage ${level} (Hard)`,   reward:`Revive and mark Hard` };
}
function statusLabel(s){ return s === 'finished' ? 'Finished' : s[0].toUpperCase()+s.slice(1); }

function renderAchievements(){
  let html = `
    <div class="ach-row ach-head">
      <div>Achievement</div><div>Reward</div>
    </div>`;

  let finishedCount = 0;

  for(let i=1;i<=TOTAL_STAGES;i++){
    const hasS = !!save.achievements[`L${i}-S`];
    const hasH = !!save.achievements[`L${i}-H`];

    let status, mode;
    if (achTab === 'simple') {
      mode = 'S';
      if (i > save.unlocked) status = 'locked';
      else status = hasS ? 'finished' : 'unlocked';
    } else {
      mode = 'H';
      if (!hasS) status = 'locked';
      else status = hasH ? 'finished' : 'unlocked';
    }
    if (status === 'finished') finishedCount++;

    const meta = achievementMeta(i, achTab);
    const disabledAttr = status === 'locked' || status === 'finished' ? 'disabled aria-disabled="true"' : '';

    html += `
      <button class="ach-row ach-btn ${status}" data-level="${i}" data-mode="${mode}" ${disabledAttr}>
        <div class="ach-left">
          <span class="ach-title">${meta.ach}</span>
          <span class="status ${status}">${statusLabel(status)}</span>
        </div>
        <div class="ach-right">${meta.reward}</div>
      </button>`;
  }

  achList.innerHTML = html;

  const progressText = `Progress: ${finishedCount}/${TOTAL_STAGES}`;
  const progHost = document.querySelector('#achievements .ach-progress');
  if (progHost) progHost.textContent = progressText;
  if (achP) achP.textContent = `${finishedCount}/${TOTAL_STAGES}`;

  document.querySelectorAll('#achievements .tab').forEach(btn=>{
    const on = btn.dataset.tab === achTab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true':'false');
  });
}
document.querySelectorAll('#achievements .tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{ achTab = btn.dataset.tab; renderAchievements(); });
});
achList?.addEventListener('click', (e)=>{
  const rowBtn = e.target.closest('.ach-btn');
  if(!rowBtn || rowBtn.disabled) return;
  const level = parseInt(rowBtn.dataset.level, 10);
  const mode  = rowBtn.dataset.mode; // 'S'|'H'
  goto('level1');
  if (level === 6) startStage6Placeholder(); else startRunner(level, mode);
});

/* =========================================================================
   Runner (Stages 1–5)
   ========================================================================= */
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const pollEl = document.getElementById('poll');
const hudLevelEl = document.getElementById('hud-level');
const pctEl = document.getElementById('progressPercent');

const GROUND_Y = 100;
const LANES = [8, 58, 108];
const PIT_MIN_GAP = 320;
const DROP_SPACING = 140;

let raf = 0, running = false;
let viewW = 0, scrollX = 0, maxSpawnX = 0;
let pitProb = 0.16, lastPitX = -Infinity;
let timeLeft = 180, score = 0, collected = 0, pollution = 0;
let player = { x: 30, y: 0, vy: 0, onGround: true, w:48, h:56 }; // left=30
let levelIdx = 1;
let stageMode = 'S'; // 'S' | 'H'
let drops = [];   // {x,y,type,taken,el}
let pits = [];    // {x,w,el}
let timerId = 0;
let runnerSnapshot = null;

/* Milestones */
const MILESTONES = [
  { score: 5,  text: "Nice start! 🌊" },
  { score: 10, text: "Halfway there! 💧" },
  { score: 15, text: "So close! 🚀" },
];
const shownMilestones = new Set();
function maybeShowMilestone(curScore){
  for (const m of MILESTONES) {
    if (curScore >= m.score && !shownMilestones.has(m.score)) {
      shownMilestones.add(m.score);
      const t = document.getElementById('toast');
      if(t){
        t.textContent = m.text;
        t.classList.add('show');
        setTimeout(()=> t.classList.remove('show'), 1200);
      }
      break;
    }
  }
}

/* Stage tuning */
const STAGES = {
  1: { timeS:180, goalS:20, timeH:150, goalH:25, pollution:false, basePit:0.16, hardPitAdd:0.03 },
  2: { timeS:180, goalS:25, timeH:150, goalH:30, pollution:false, basePit:0.16, hardPitAdd:0.03 },
  3: { timeS:180, goalS:25, timeH:150, goalH:32, pollution:true,  basePit:0.18, hardPitAdd:0.04 },
  4: { timeS:180, goalS:30, timeH:150, goalH:36, pollution:true,  basePit:0.20, hardPitAdd:0.05 },
  5: { timeS:300, goalS:40, timeH:240, goalH:48, pollution:true,  basePit:0.20, hardPitAdd:0.05 },
};
function currentGoal(){
  const s = STAGES[levelIdx];
  return stageMode==='H' ? s.goalH : s.goalS;
}
function updatePct(){
  const goal = currentGoal();
  const pct = Math.min(100, Math.round((score/goal)*100));
  if(pctEl) pctEl.textContent = `${pct}%`;
}

function makeGround(){
  board.innerHTML = '';
  const ground = document.createElement('div');
  ground.className = 'ground';
  ground.style.bottom = `${GROUND_Y}px`;
  board.appendChild(ground);
}
function spawnStatics(){ drops = []; pits = []; maxSpawnX = 0; lastPitX = -Infinity; }
function spawnAhead(){
  const targetX = scrollX + viewW + 200;
  const stage = STAGES[levelIdx];
  while(maxSpawnX < targetX){
    const lane = LANES[(Math.floor(maxSpawnX / DROP_SPACING)) % 3];
    const isDirty = stage.pollution && Math.random()<0.25;
    const drop = { x:maxSpawnX+180, y:lane, type: (isDirty?'dirty':'clean'), taken:false };
    const el = document.createElement('div');
    el.className = 'static-drop'; el.style.bottom = `${GROUND_Y + drop.y}px`; el.innerHTML = `<div class="drop"></div>`;
    if(drop.type==='dirty') el.firstChild.style.background = '#6b7280';
    drop.el = el; board.appendChild(el); drops.push(drop);

    if(Math.random() < pitProb && (drop.x - lastPitX) > PIT_MIN_GAP){
      const width = 70 + Math.floor(Math.random()*20);
      const pit = { x: drop.x + 120, w: width };
      const pel = document.createElement('div');
      pel.className = 'pit'; pel.style.bottom = `${GROUND_Y}px`; pel.style.width = `${pit.w}px`;
      pit.el = pel; board.appendChild(pel); pits.push(pit); lastPitX = pit.x;
    }
    maxSpawnX += DROP_SPACING;
  }
}
function mountPlayer(){
  const el = document.createElement('div');
  el.className = 'player';
  el.style.left = `${player.x}px`;
  el.style.bottom = `${GROUND_Y + 8}px`;
  board.appendChild(el);
  player.el = el; player.y = 0; player.vy = 0; player.onGround = true;
  renderPlayer();
}
function renderPlayer(){ player.el.style.transform = `translateY(${-player.y}px)`; }

function startRunner(level, mode='S'){
  levelIdx = level;
  stageMode = mode;

  const base = STAGES[levelIdx];
  timeLeft = (mode==='H') ? base.timeH : base.timeS;
  pitProb  = base.basePit + (mode==='H' ? base.hardPitAdd : 0);
  pitProb  = Math.max(0, Math.min(0.35, pitProb));

  hudLevelEl.textContent = String(levelIdx);
  score = 0; collected = 0; pollution = 0;
  shownMilestones.clear();

  scoreEl.textContent = '0'; pollEl.textContent = String(pollution);
  document.querySelectorAll('[data-hslot]').forEach(d=>d.classList.remove('filled'));
  updatePct();

  viewW = board.clientWidth || 640; scrollX = 0; maxSpawnX = 0;
  makeGround(); spawnStatics(); mountPlayer();

  sfx.play('start');

  running = true; cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  if(timeLeft>0){ clearTimeout(timerId); tickTimer(); }
  bindControls();

  runnerSnapshot = null;
}

function stopRunner(){
  running = false;
  cancelAnimationFrame(raf);
  clearTimeout(timerId);
  unbindControls();
}

/* Controls */
let jumpHeld = false, jumpBoost = 0;
function bindControls(){
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('auxclick', onAuxClick);
  window.addEventListener('contextmenu', (e)=>{ if(!sections['level1'].hidden) e.preventDefault(); });
}
function unbindControls(){
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('auxclick', onAuxClick);
}
function isUiClick(t){ return !!t.closest('button, a, .nav-drawer, #challenge, .tabs, .sort-board'); }
function onKeyDown(e){ if(e.code==='Space'){ if(!jumpHeld){ startJump(); } e.preventDefault(); } if(e.code==='KeyP'){ togglePause(); } }
function onKeyUp(e){ if(e.code==='Space'){ endJump(); e.preventDefault(); } }
function onPointerDown(e){ if(sections['level1'].hidden || isUiClick(e.target)) return; startJump(); }
function onPointerUp(){ if(sections['level1'].hidden) return; endJump(); }
function onAuxClick(e){ if(sections['level1'].hidden || isUiClick(e.target)) return; if(e.button===2){ e.preventDefault(); startJump(); } }
function startJump(){ jumpHeld = true; if(player.onGround){ player.vy = 12; player.onGround = false; jumpBoost = 14; } }
function endJump(){ if(!jumpHeld) return; jumpHeld = false; jumpBoost = 0; }
function togglePause(){
  running = !running;
  if(pauseBtn) pauseBtn.textContent = running ? 'Pause' : 'Resume';
  if(running){
    raf = requestAnimationFrame(loop);
    tickTimer();
  }else{
    clearTimeout(timerId); // 暂停时停止计时器
  }
}
pauseBtn?.addEventListener('click', togglePause);
exitBtn?.addEventListener('click', ()=>{ sfx.play('fail'); goto('stage'); });
resetBtn?.addEventListener('click', ()=>{ stopRunner(); startRunner(levelIdx, stageMode); });

/* Loop */
function loop(){
  if(!running) return;

  scrollX += 3.2;
  if(!player.onGround){
    if(jumpHeld && jumpBoost > 0){ player.vy += 0.5; jumpBoost--; }
    player.vy -= 0.7; player.y += player.vy;
    if(player.y <= 0){ player.y = 0; player.vy = 0; player.onGround = true; }
  }

  spawnAhead();

  // 更新位置
  drops.forEach(d=>{
    if(d.taken) return;
    const sx = d.x - scrollX;
    d.el.style.left = `${sx}px`;
    if(sx < -60){ d.taken = true; d.el.remove(); }
  });
  pits.forEach(p=>{
    const sx = p.x - scrollX;
    p.el.style.left = `${sx}px`;
  });

  /* --------- 修正后的坑碰撞（矩形重叠 + 接地才判定） --------- */
  const playerLeft  = player.x;
  const playerRight = player.x + player.w;
  const nearGround  = player.y <= 2; // 脚基本贴地才算

  if(nearGround){
    for(const p of pits){
      const pitLeft  = parseFloat(p.el.style.left) || (p.x - scrollX);
      const pitRight = pitLeft + p.w;
      // 水平有重叠才判；给 2px 安全边距
      if (playerRight-2 >= pitLeft && playerLeft+2 <= pitRight){
        failStage('pit');
        return;
      }
    }
  }

  // 收集/污染
  for (const d of drops){
    if(d.taken) continue;
    const sx = d.x - scrollX;
    const dx = Math.abs(sx - (player.x + 16)); // 以角色大致中心比对
    const dy = Math.abs(d.y - player.y);
    if(dx < 24 && dy < 24){
      d.taken = true;

      if(d.type==='dirty'){
        d.el.remove();
        pollution = Math.min(100, pollution + 25); pollEl.textContent = String(pollution);
        if(pollution>=100){ failStage('pollution'); return; }
      }else{
        d.el.classList.add('pop');
        setTimeout(()=> d.el.remove(), 120);

        score++; collected++; scoreEl.textContent = String(score);
        updatePct();

        const filled = collected % 8;
        document.querySelectorAll('[data-hslot]').forEach((dd,i)=> dd.classList.toggle('filled', i < filled));

        maybeShowMilestone(score);
        if(score >= currentGoal()){ winStage(); return; }
      }
    }
  }

  renderPlayer();
  raf = requestAnimationFrame(loop);
}

/* Timer */
function tickTimer(){
  if(!running || timeLeft<=0) return;
  timeLeft--;
  const m = Math.floor(timeLeft/60), s = String(timeLeft%60).padStart(2,'0');
  timerEl.textContent = `${m}:${s}`;
  if(timeLeft <= 0){ failStage('timeout'); return; }
  timerId = setTimeout(tickTimer, 1000);
}

/* Confetti */
const confettiHost = document.getElementById('confetti-host');
function confettiBurst(count=120){
  const colors = ['#2aa4f4','#0e7ec1','#f3c84e','#f4d24f','#7ea0b7','#5e7f94','#97e8c0'];
  for(let i=0;i<count;i++){
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random()*100 + 'vw';
    el.style.background = colors[(Math.random()*colors.length)|0];
    el.style.animationDelay = (Math.random()*0.4)+'s';
    el.style.transform = `translateY(-20px) rotate(${Math.random()*360}deg)`;
    confettiHost.appendChild(el);
    setTimeout(()=> el.remove(), 1600);
  }
}

/* Outcomes */
function winStage(){
  stopRunner();
  const key = `L${levelIdx}-${stageMode}`;
  save.achievements[key] = true;

  // 通过 Simple 解锁下一关；Hard 不解锁
  if(stageMode === 'S'){
    save.unlocked = Math.max(save.unlocked, levelIdx+1);
    save.completed = Math.max(save.completed||0, Math.min(levelIdx, TOTAL_STAGES));
  }
  store.save(save);

  confettiBurst();
  sfx.play('win');

  setTimeout(()=> alert(`Level ${levelIdx} complete! ${stageMode==='H'?'HARD':'SIMPLE'} achievement unlocked.`), 50);
  renderGlobalProgress();
  renderStageGrid();
  renderAchievements();
  goto('stage');
}

function snapshotRunner(){
  runnerSnapshot = {
    levelIdx, stageMode,
    scrollX, timeLeft, score, collected, pollution,
    player: { y: player.y, vy: player.vy, onGround: player.onGround },
    drops: drops.filter(d=>!d.taken).map(d => ({ x: d.x, y: d.y, type: d.type })),
    pits: pits.map(p => ({ x: p.x, w: p.w })),
    pitProb
  };
}
function resumeRunnerFromSnapshot(){
  if(!runnerSnapshot){ startRunner(levelIdx, stageMode); return; }
  const snap = runnerSnapshot;

  levelIdx   = snap.levelIdx;
  stageMode  = snap.stageMode;
  scrollX    = snap.scrollX;
  timeLeft   = snap.timeLeft;
  score      = snap.score;
  collected  = snap.collected;
  pollution  = snap.pollution;
  pitProb    = snap.pitProb;

  board.innerHTML = '';
  makeGround();
  drops = []; pits = [];
  mountPlayer();
  player.y = snap.player.y; player.vy = snap.player.vy; player.onGround = snap.player.onGround;

  snap.drops.forEach(d=>{
    const el = document.createElement('div');
    el.className = 'static-drop';
    el.style.bottom = `${GROUND_Y + d.y}px`;
    el.innerHTML = `<div class="drop"></div>`;
    if(d.type==='dirty') el.firstChild.style.background = '#6b7280';
    board.appendChild(el);
    drops.push({ ...d, taken:false, el });
  });
  snap.pits.forEach(p=>{
    const pel = document.createElement('div');
    pel.className = 'pit';
    pel.style.bottom = `${GROUND_Y}px`;
    pel.style.width  = `${p.w}px`;
    board.appendChild(pel);
    pits.push({ ...p, el: pel });
  });

  maxSpawnX = Math.max(0, ...drops.map(d=>d.x), ...pits.map(p=>p.x + p.w));

  // HUD 恢复
  hudLevelEl.textContent = String(levelIdx);
  scoreEl.textContent = String(score);
  pollEl.textContent  = String(pollution);
  const m = Math.floor(timeLeft/60), s = String(timeLeft%60).padStart(2,'0');
  timerEl.textContent = `${m}:${s}`;
  document.querySelectorAll('[data-hslot]').forEach((dd,i)=> dd.classList.toggle('filled', i < (collected % 8)));
  updatePct();

  running = true;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  clearTimeout(timerId);
  tickTimer();
  bindControls();              // 复活后一定重新绑定

  runnerSnapshot = null;
}

function failStage(reason){
  snapshotRunner();
  stopRunner();
  sfx.play('fail');
  initSort();
  alert(`Failed (${reason}). Clear the Water Sort to revive.`);
  goto('challenge');
}

/* =========================================================================
   Challenge – Water Sort（只做复活）
   ========================================================================= */
const sortBoard = document.getElementById('sort-board');
const undoBtn = document.getElementById('undo');
let bottles = [], selected = null, history = [];

function initSort(){
  bottles = [
    ["A","B",null,null],
    ["B","A",null,null],
    [null,null,null,null]
  ];
  selected = null; history = [];
  renderSort();
}
function renderSort(){
  sortBoard.innerHTML = '';
  bottles.forEach((stack, idx)=>{
    const b = document.createElement('div');
    b.className = 'bottle'; b.tabIndex = 0;
    if(selected === idx) b.classList.add('selected');
    b.addEventListener('click', ()=> selectBottle(idx));
    for(let i=0;i<4;i++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      const val = stack[i];
      if(val){ cell.classList.add(colorClass(val)); cell.setAttribute('aria-label', val); }
      b.appendChild(cell);
    }
    sortBoard.appendChild(b);
  });
  checkSolved();
}
function colorClass(v){ return v==="A"?'color-a':v==="B"?'color-b':'color-c'; }
function topSegment(index){
  const s = bottles[index];
  let top = s.findIndex(v => v !== null);
  if(top === -1) return {color:null, count:0, start:4};
  const color = s[top]; let count = 1;
  for(let i=top+1;i<4;i++){ if(s[i]===color) count++; else break; }
  return {color, count, start: top};
}
function firstFree(index){
  const s = bottles[index]; let free = -1;
  for(let i=3;i>=0;i--){ if(s[i]===null) free = i; }
  return free;
}
function canPour(from,to){
  if(from===to) return false;
  const seg = topSegment(from); if(seg.count===0) return false;
  const destTop = topSegment(to); const destFree = firstFree(to);
  if(destFree === -1) return false;
  if(destTop.count===0) return true;
  return destTop.color === seg.color;
}
function pour(from,to){
  if(!canPour(from,to)) return;
  history.push(JSON.parse(JSON.stringify(bottles)));
  const seg = topSegment(from);
  for(let i=seg.start;i<seg.start+seg.count;i++){
    const destFree = firstFree(to);
    bottles[to][destFree] = seg.color;
    bottles[from][i] = null;
  }
  renderSort();
}
function selectBottle(i){
  if(selected === null){ selected = i; renderSort(); return; }
  if(selected === i){ selected = null; renderSort(); return; }
  if(canPour(selected, i)){ pour(selected, i); selected = null; } else { selected = i; renderSort(); }
}
undoBtn?.addEventListener('click', ()=>{
  const prev = history.pop();
  if(prev){ bottles = prev; selected = null; renderSort(); }
});
function checkSolved(){
  const solved = bottles.every(stack => {
    const vals = stack.filter(v=>v!==null);
    return vals.length===0 || vals.every(v=>v===vals[0]);
  });
  if(solved){
    alert("Penalty cleared! Resuming level.");
    goto('level1');
    resumeRunnerFromSnapshot(); // 复活
  }
}

/* =========================================================================
   Stage 6 – placeholder
   ========================================================================= */
function startStage6Placeholder(){
  stopRunner();
  board.innerHTML = `
    <div class="ground" style="bottom:100px"></div>
    <div style="
      position:absolute; left:50%; transform:translateX(-50%);
      bottom:110px; width:260px; height:300px;
      border:16px solid #a35d35; border-top-width:28px; border-bottom-width:18px; border-radius:10px;
      background:linear-gradient(180deg,#ffffff 0%, #f3f7fb 100%);
    "></div>
    <p style="position:absolute; top:16px; left:50%; transform:translateX(-50%); font-weight:900;">
      Stage 6 – Barrel Merge (prototype)
    </p>
  `;
  document.getElementById('hud-level').textContent = '6';
  document.getElementById('timer').textContent = '∞';
  document.getElementById('score').textContent = '0';
  document.getElementById('poll').textContent = '0';
  const pct = document.getElementById('progressPercent'); if(pct) pct.textContent = '0%';
}

/* =========================================================================
   SFX (start / win / fail)
   ========================================================================= */
const sfx = (() => {
  const cache = {
    start: new Audio('audio/game-start.mp3'),
    win:   new Audio('audio/winner-game-sound.mp3'),
    fail:  new Audio('audio/game-over.mp3'),
  };
  cache.start.volume = 0.85;
  cache.win.volume   = 0.9;
  cache.fail.volume  = 0.9;
  Object.values(cache).forEach(a => { a.preload='auto'; });

  let muted = false;
  const muteBtn = document.getElementById('muteBtn');
  muteBtn?.addEventListener('click', (e)=>{
    muted = !muted;
    e.currentTarget.setAttribute('aria-pressed', String(muted));
    e.currentTarget.textContent = muted ? '🔇' : '🔊';
  });

  // unlock on first gesture
  window.addEventListener('pointerdown', ()=>{
    Object.values(cache).forEach(a => a.play().then(()=>a.pause()).catch(()=>{}));
  }, { once:true });

  function play(name){
    const a = cache[name]; if(!a || muted) return;
    a.currentTime = 0;
    a.play().catch(()=>{});
  }
  return { play };
})();

/* =========================================================================
   Boot
   ========================================================================= */
function init(){
  injectLoginButton();
  renderGlobalProgress();
  renderStageGrid();
  renderAchievements();
  initSort();
  toggleLevelUI(false);
}
init();
