/* =========================================================================
   Every Drop Matters – App Script (route-gated board + vertical menu)
   ========================================================================= */

/* ---------- DOM shortcuts ---------- */
const routes = ["home","stage","achievements","level1","challenge"];
const sections = Object.fromEntries(routes.map(r => [r, document.getElementById(r)]));
const navButtons = document.querySelectorAll('[data-route]');
const menuToggle = document.getElementById('menu-toggle');
const drawer = document.getElementById('main-menu');

/* Game containers & controls (we will toggle these on/off per route) */
const boardWrap = document.querySelector('.board-wrap');      // outer container
const board = document.getElementById('board');               // inner canvas area
const hudEl = document.querySelector('#level1 .hud');
const levelButtonsRow = document.querySelector('#level1 .row');
const pauseBtn = document.getElementById('btn-pause');
const exitBtn = document.getElementById('btn-exit1');
const resetBtn = document.getElementById('btn-reset-level');

/* =========================================================================
   Progressive enhancement: ensure optional UI exists (difficulty, mute, toast, footer)
   ========================================================================= */
(function ensureOptionalUI(){
  // Difficulty selector
  if (hudEl && !document.getElementById('difficultySelect')) {
    const label = document.createElement('label');
    label.className = 'diff';
    label.innerHTML = `Mode:
      <select id="difficultySelect" aria-label="Difficulty">
        <option>Easy</option>
        <option selected>Normal</option>
        <option>Hard</option>
      </select>`;
    hudEl.appendChild(label);
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
   User + Storage (multi-profile via localStorage)
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
   Router + Hard Gate for Level UI
   ========================================================================= */
function toggleLevelUI(show){
  // Show/hide EVERYTHING related to the playable level
  if(boardWrap) boardWrap.style.display = show ? 'block' : 'none';
  if(hudEl) hudEl.style.display = show ? 'grid' : 'none';
  if(levelButtonsRow) levelButtonsRow.style.display = show ? 'flex' : 'none';

  if(!show){
    // Make sure nothing keeps running or remains on screen
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

  // Gate the game area strictly to Level screen
  toggleLevelUI(route === 'level1');

  if(route === 'home') renderGlobalProgress();
  if(route === 'stage') renderStageGrid();
  if(route === 'achievements') renderAchievements();
  if(route === 'challenge') initSort();          // fresh penalty each time
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

/* Reset current user's progress */
document.getElementById('btn-reset-all')?.addEventListener('click', ()=>{
  if(!confirm(`Reset all progress for "${currentUser}"? This will clear achievements.`)) return;
  store.clear();
  save = { completed: 0, unlocked: 1, achievements: {} };
  renderGlobalProgress(); renderStageGrid(); renderAchievements();
  goto('home');
});

/* =========================================================================
   Home: global progress (exactly 6 drops)
   ========================================================================= */
const TOTAL_STAGES = 6;
function renderGlobalProgress(){
  const slots = Array.from(document.querySelectorAll('[data-slot]')).slice(0, TOTAL_STAGES);
  slots.forEach((el,i)=> el.classList.toggle('filled', i < Math.min(TOTAL_STAGES, save.completed||0)));
}

/* =========================================================================
   Stage select – the ONLY entry to gameplay
   ========================================================================= */
function renderStageGrid(){
  const grid = document.getElementById('stage-grid');
  grid.innerHTML = '';
  for(let i=1;i<=TOTAL_STAGES;i++){
    const card = document.createElement('button');
    card.className = 'stage-card';
    card.innerHTML = `<div>STAGE ${i}</div>`;
    if(i>save.unlocked){
      card.classList.add('locked'); card.disabled = true;
      card.insertAdjacentHTML('beforeend', '<span class="badge">Locked</span>');
    }else{
      const hasS = !!save.achievements[`L${i}-S`];
      const hasH = !!save.achievements[`L${i}-H`];
      const label = [hasS?'✓ Simple':'', hasH?'★ Hard':''].filter(Boolean).join(' ');
      if(label) card.insertAdjacentHTML('beforeend', `<span class="badge">${label}</span>`);
    }
    card.addEventListener('click', ()=>{
      goto('level1');                        // show level UI
      if(i === 6) startStage6Placeholder();  // Stage 6 uses its own mode for now
      else startRunner(i);                   // Stages 1–5 runner
    });
    grid.appendChild(card);
  }
}

/* =========================================================================
   Achievements (tab filter + two columns)
   ========================================================================= */
let achTab = 'simple';
const achList = document.getElementById('ach-list');
const achP = document.getElementById('ach-p');

function achievementMeta(level, tab){
  return (tab === 'simple')
    ? { ach:`Complete Stage ${level}`, reward:`+1 drop toward village progress` }
    : { ach:`Clear penalty for Stage ${level}`, reward:`Revive and mark Hard` };
}
function renderAchievements(){
  let html = `
    <div class="ach-row ach-head">
      <div>Achievement</div><div>Reward</div>
    </div>`;
  let unlocked = 0;
  for(let i=1;i<=TOTAL_STAGES;i++){
    const key = `L${i}-${achTab==='simple'?'S':'H'}`;
    const on = !!save.achievements[key];
    if(on) unlocked++;
    const meta = achievementMeta(i, achTab);
    html += `
      <div class="ach-row">
        <div class="ach-left">
          <span class="ach-title">${meta.ach}</span>
          <span class="status ${on?'ok':''}">${on?'Unlocked':'Locked'}</span>
        </div>
        <div class="ach-right">${meta.reward}</div>
      </div>`;
  }
  achList.innerHTML = html;
  achP.textContent = `${unlocked}/${TOTAL_STAGES}`;
  document.querySelectorAll('#achievements .tab').forEach(btn=>{
    const on = btn.dataset.tab === achTab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true':'false');
  });
}
document.querySelectorAll('#achievements .tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{ achTab = btn.dataset.tab; renderAchievements(); });
});

/* =========================================================================
   Runner (Stages 1–5)
   ========================================================================= */
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const pollEl = document.getElementById('poll');
const hudLevelEl = document.getElementById('hud-level');

const GROUND_Y = 100;
const LANES = [8, 58, 108];
const PIT_MIN_GAP = 320;
const DROP_SPACING = 140;

let raf = 0, running = false;
let viewW = 0, scrollX = 0, maxSpawnX = 0;
let speed = 3.2, pitProb = 0.16, lastPitX = -Infinity;
let timeLeft = 180, score = 0, collected = 0, pollution = 0;
let player = { x: 80, y: 0, vy: 0, onGround: true };
let levelIdx = 1;
let drops = [];   // {x,y,type,taken,el}
let pits = [];    // {x,w,el}
let timerId = 0;
let runnerSnapshot = null;

/* ---------- NEW: Difficulty overlay ---------- */
const DIFFICULTY = {
  Easy:   { timeMult: 1.15, goalAdd: -5, pitProbAdd: -0.02 },
  Normal: { timeMult: 1.00, goalAdd:  0, pitProbAdd:  0.00 },
  Hard:   { timeMult: 0.85, goalAdd:  5, pitProbAdd:  0.03 },
};
let currentDifficulty = 'Normal';
const diffSelect = document.getElementById('difficultySelect');
diffSelect?.addEventListener('change', (e)=>{
  currentDifficulty = e.target.value;
  if (!sections['level1'].hidden) { stopRunner(); startRunner(levelIdx); }
});

const STAGES = {
  1: { time:180, goal:20, pollution:false },
  2: { time:180, goal:25, pollution:false },
  3: { time:180, goal:25, pollution:true  },
  4: { time:180, goal:30, pollution:true  },
  5: { time:300, goal:40, pollution:true  }
};

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
    const drop = { x:maxSpawnX+180, y:lane, type:(stage.pollution && Math.random()<0.25)?'dirty':'clean', taken:false };
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
  el.style.bottom = `${GROUND_Y + 8}px`;
  board.appendChild(el);
  player.el = el; player.y = 0; player.vy = 0; player.onGround = true;
  renderPlayer();
}
function renderPlayer(){ player.el.style.transform = `translateY(${-player.y}px)`; }

/* ---------- NEW: Milestones ---------- */
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

function startRunner(level){
  levelIdx = level;
  const base = STAGES[levelIdx];
  const diff = DIFFICULTY[currentDifficulty] || DIFFICULTY.Normal;

  hudLevelEl.textContent = String(levelIdx);
  timeLeft = Math.round((base.time || 180) * diff.timeMult);
  score = 0; collected = 0; pollution = 0;
  speed = 3.2;
  pitProb = (levelIdx>=4?0.20:(levelIdx>=3?0.18:0.16)) + (diff.pitProbAdd||0);
  pitProb = Math.max(0, Math.min(0.35, pitProb));

  scoreEl.textContent = '0'; pollEl.textContent = String(pollution);
  document.querySelectorAll('[data-hslot]').forEach(d=>d.classList.remove('filled'));

  viewW = board.clientWidth || 640; scrollX = 0; maxSpawnX = 0;
  makeGround(); spawnStatics(); mountPlayer();

  // 🔊 play game start sound
  sfx.play('start');

  running = true; cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
  if(timeLeft>0){ clearTimeout(timerId); tickTimer(); }
  bindControls();

  runnerSnapshot = null; // start fresh
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
function togglePause(){ running = !running; if(pauseBtn) pauseBtn.textContent = running ? 'Pause' : 'Resume'; if(running){ raf = requestAnimationFrame(loop); tickTimer(); } }
pauseBtn?.addEventListener('click', togglePause);
// 🔊 Exit uses the fail sound
exitBtn?.addEventListener('click', ()=>{ sfx.play('fail'); goto('stage'); });
resetBtn?.addEventListener('click', ()=>{ stopRunner(); startRunner(levelIdx); });

/* Loop */
function loop(){
  if(!running) return;

  scrollX += 3.2; // base speed; "speed" can be eased in if you prefer
  if(!player.onGround){
    if(jumpHeld && jumpBoost > 0){ player.vy += 0.5; jumpBoost--; }
    player.vy -= 0.7; player.y += player.vy;
    if(player.y <= 0){ player.y = 0; player.vy = 0; player.onGround = true; }
  }

  spawnAhead();

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

  const footX = 80 + 16;
  const hitPit = pits.find(p => footX >= (p.x - scrollX) && footX <= (p.x - scrollX + p.w));
  if(hitPit && player.y <= 0){ failStage('pit'); return; }

  drops.forEach(d=>{
    if(d.taken) return;
    const sx = d.x - scrollX;
    const dx = Math.abs(sx - 80);
    const dy = Math.abs(d.y - player.y);
    if(dx < 22 && dy < 24){
      d.taken = true;

      if(d.type==='dirty'){
        // No small penalty sound (you only have start/win/fail)
        d.el.remove();
        pollution = Math.min(100, pollution + 25); pollEl.textContent = String(pollution);
        if(pollution>=100){ failStage('pollution'); return; }
      }else{
        // No collect sound (you only have start/win/fail)
        d.el.classList.add('pop');
        setTimeout(()=> d.el.remove(), 120);

        score++; collected++; scoreEl.textContent = String(score);
        const filled = collected % 8;
        document.querySelectorAll('[data-hslot]').forEach((dd,i)=> dd.classList.toggle('filled', i < filled));

        const base = STAGES[levelIdx];
        const diff = DIFFICULTY[currentDifficulty] || DIFFICULTY.Normal;
        const stageGoal = Math.max(1, (base.goal || 20) + (diff.goalAdd || 0));

        maybeShowMilestone(score);
        if(score >= stageGoal){ winStage(); return; }
      }
    }
  });

  // Optional difficulty ramp / pollution heal can be added back if you want
  renderPlayer();
  raf = requestAnimationFrame(loop);
}

/* Timer */
function tickTimer(){
  if(!running || timeLeft<=0) return;
  timeLeft--;
  const m = Math.floor(timeLeft/60), s = String(timeLeft%60).padStart(2,'0');
  document.getElementById('timer').textContent = `${m}:${s}`;
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
  save.achievements[`L${levelIdx}-S`] = true;
  save.unlocked = Math.max(save.unlocked, levelIdx+1);
  save.completed = Math.max(save.completed||0, Math.min(levelIdx, TOTAL_STAGES));
  store.save(save);

  confettiBurst();
  // 🔊 play success sound
  sfx.play('win');

  setTimeout(()=> alert(`Level ${levelIdx} complete! Simple achievement unlocked.`), 50);
  goto('stage');
}
function snapshotRunner(){
  // Keep this if you still want penalty→resume later
  runnerSnapshot = {
    levelIdx, scrollX, timeLeft, score, collected, pollution,
    player: { y: player.y, vy: player.vy, onGround: player.onGround },
    drops: drops.filter(d=>!d.taken).map(d => ({ x: d.x, y: d.y, type: d.type })),
    pits: pits.map(p => ({ x: p.x, w: p.w }))
  };
}
function resumeRunnerFromSnapshot(){ /* … keep if you use penalty → resume … */ }
function failStage(reason){
  // Optional: snapshotRunner();
  stopRunner();
  // 🔊 play fail sound
  sfx.play('fail');
  initSort();
  alert(`Failed (${reason}). Clear the Water Sort to revive.`);
  goto('challenge');
}

/* =========================================================================
   Challenge – Water Sort (unchanged from your last working build)
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
    save.achievements[`L${levelIdx}-H`] = true; store.save(save);
    alert("Penalty cleared! Resuming level.");
    goto('level1');
    // You can call resumeRunnerFromSnapshot() here if you use snapshots.
  }
}

/* =========================================================================
   Stage 6 – placeholder renderer (kept minimal)
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
}

/* =========================================================================
   Simple SFX manager (start / win / fail only)
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

  // unlock audio on first user gesture (mobile)
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
  toggleLevelUI(false); // start with all level UI hidden
}
init();
