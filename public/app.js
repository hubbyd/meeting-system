/* ============================================================
   校团委社会实践部 · 新生见面会系统  |  大屏管理端逻辑
   Designed & Built by 张和浩 · 信息学院软件2402
   ============================================================ */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S = { meta: {}, participants: [], records: [], blindbox: { opened: {} }, settings: { prizes: [], penalties: [], blindboxRewards: [], quiz: [] } };

async function api(method, url, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const res = await fetch(url, opt);
  return res.json().catch(() => ({}));
}

function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = msg;
  $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('fade'); setTimeout(() => t.remove(), 420); }, ms);
}

/* ---------------------------- 头像颜色 / 工具 ---------------------------- */
function hue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}
function avatarBg(name) {
  const h = hue(name);
  return `linear-gradient(140deg, hsl(${h} 85% 58%), hsl(${(h + 45) % 360} 80% 42%))`;
}
function initials(name) { return name ? name.slice(-2) : '?'; }
function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ------------------------------- 彩带特效 ------------------------------- */
const cv = $('confetti'), cx = cv.getContext('2d');
let parts = [], raf = null;
function sizeCv() { cv.width = innerWidth; cv.height = innerHeight; }
sizeCv(); addEventListener('resize', sizeCv);
function confettiBurst(x, y, n = 150) {
  const colors = ['#ff2d4b', '#ff7a18', '#ffcf3f', '#22d3ee', '#a855f7', '#34d399', '#ffffff'];
  x = x == null ? innerWidth / 2 : x;
  y = y == null ? innerHeight * 0.4 : y;
  for (let i = 0; i < n; i++) {
    parts.push({
      x, y, vx: (Math.random() - 0.5) * 18, vy: Math.random() * -16 - 3,
      s: Math.random() * 9 + 5, c: colors[(Math.random() * colors.length) | 0],
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35, life: 150,
    });
  }
  if (!raf) loopConfetti();
}
function loopConfetti() {
  cx.clearRect(0, 0, cv.width, cv.height);
  for (const p of parts) {
    p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
    cx.globalAlpha = Math.max(0, p.life / 150); cx.fillStyle = p.c;
    cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62); cx.restore();
  }
  parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 50);
  if (parts.length) raf = requestAnimationFrame(loopConfetti);
  else { raf = null; cx.clearRect(0, 0, cv.width, cv.height); }
}

/* ------------------------------- 标签切换 ------------------------------- */
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + btn.dataset.view));
});

/* -------------------------------- 时钟 -------------------------------- */
setInterval(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}, 1000);

/* ================================ 渲染 ================================ */

function renderMeta() {
  if (S.meta.title) { $('appTitle').textContent = S.meta.title; document.title = S.meta.title + ' · 大屏端'; }
  if (S.meta.subtitle) $('appSubtitle').textContent = S.meta.subtitle;
}

/* 签到墙 */
let prevWallIds = new Set();
function renderWall() {
  const grid = $('wallGrid');
  const ps = S.participants;
  $('wallCountBadge').textContent = ps.length + ' 人已签到';
  if (!ps.length) {
    grid.innerHTML = '<div class="empty"><span class="big">🎈</span>还没有同学签到，快展示签到二维码吧</div>';
    prevWallIds = new Set();
    return;
  }
  const frag = document.createDocumentFragment();
  for (const p of ps) {
    const el = document.createElement('div');
    el.className = prevWallIds.size && !prevWallIds.has(p.id) ? 'pcard new' : 'pcard';
    el.innerHTML = `
      <div class="no">#${String(p.no).padStart(3, '0')}</div>
      ${p.prizes && p.prizes.length ? '<div class="crown">🏆</div>' : ''}
      <div class="ava" style="background:${avatarBg(p.name)}">${esc(initials(p.name))}</div>
      <div class="nm">${esc(p.name)}</div>
      <div class="dp">${esc(p.dept)}</div>`;
    frag.appendChild(el);
  }
  grid.innerHTML = '';
  grid.appendChild(frag);
  prevWallIds = new Set(ps.map((p) => p.id));
  if (grid.scrollHeight <= grid.clientHeight) grid.scrollTop = 0;
}

/* 最新动态 */
function renderFeed() {
  const feed = $('feed');
  const items = [];
  for (const p of S.participants) items.push({ at: p.checkinAt, icon: '✅', html: `<b>${esc(p.name)}</b> 签到成功` });
  for (const r of S.records) {
    if (r.type === 'lottery') items.push({ at: r.at, icon: '🎁', html: `<b>${esc(r.payload.name)}</b> 抽中 ${esc(r.payload.tier)}·${esc(r.payload.prize)}` });
    else if (r.type === 'blindbox') items.push({ at: r.at, icon: '📦', html: `<b>${esc(r.payload.by || '匿名')}</b> 开盲盒：${esc(r.payload.reward ? r.payload.reward.text : '')}` });
    else if (r.type === 'punishment') items.push({ at: r.at, icon: '🎯', html: `惩罚转盘：<b>${esc(r.payload.text)}</b>` });
    else if (r.type === 'bomb') items.push({ at: r.at, icon: '💣', html: `数字炸弹被 <b>${esc(r.payload.name || '')}</b> 猜中（${r.payload.n}）` });
  }
  items.sort((a, b) => b.at - a.at);
  if (!items.length) { feed.innerHTML = '<div class="empty">暂无动态</div>'; return; }
  feed.innerHTML = items.slice(0, 30).map((it) => `
    <div class="feed-item"><span>${it.icon}</span><span>${it.html}</span><span class="t">${fmtTime(it.at)}</span></div>`).join('');
}

/* 顶部统计 */
function renderTopStats() {
  const ps = S.participants;
  $('sTotal').textContent = ps.length;
  $('sDept').textContent = new Set(ps.map((p) => p.dept)).size;
  $('sWin').textContent = ps.reduce((a, p) => a + (p.prizes ? p.prizes.length : 0), 0);
  $('sPlay').textContent = S.records.length;
}

/* 名单表格 */
function renderTable() {
  const q = ($('search').value || '').trim().toLowerCase();
  const rows = S.participants.filter((p) => !q ||
    p.name.toLowerCase().includes(q) || (p.dept || '').toLowerCase().includes(q) || (p.phone || '').includes(q));
  $('pplBody').innerHTML = rows.map((p) => `
    <tr>
      <td>${String(p.no).padStart(3, '0')}</td>
      <td><span class="mini-ava" style="background:${avatarBg(p.name)}">${esc(initials(p.name))}</span>${esc(p.name)}</td>
      <td>${esc(p.dept)}</td>
      <td>${esc(p.phone) || '—'}</td>
      <td>${esc(p.seat) || '—'}</td>
      <td>${fmtTime(p.checkinAt)}</td>
      <td>${p.prizes && p.prizes.length ? p.prizes.map((x) => `<span class="badge gold">${esc(x.tier)}</span>`).join(' ') : '—'}</td>
      <td><button class="btn btn-sm btn-danger" data-del="${p.id}">删除</button></td>
    </tr>`).join('') || '<tr><td colspan="8"><div class="empty">暂无数据</div></td></tr>';

  // 姓名下拉（供盲盒使用）
  $('pplList').innerHTML = S.participants.map((p) => `<option value="${esc(p.name)}"></option>`).join('');
}

/* 抽奖：奖项筹码 */
let selectedTierIdx = 0;
function wonCount(tier) {
  return S.participants.reduce((a, p) => a + (p.prizes || []).filter((x) => x.tier === tier).length, 0);
}
function renderLotTiers() {
  const wrap = $('lotTiers');
  const prizes = S.settings.prizes || [];
  if (!prizes.length) { wrap.innerHTML = '<div style="color:var(--dim);font-size:13px">请先在设置中添加奖项</div>'; return; }
  if (selectedTierIdx >= prizes.length) selectedTierIdx = 0;
  wrap.innerHTML = prizes.map((p, i) => {
    const left = Math.max(0, p.count - wonCount(p.tier));
    return `<div class="chip ${i === selectedTierIdx ? 'on' : ''} ${left === 0 ? 'off' : ''}" data-tier="${i}"
      style="${left === 0 ? 'opacity:.4;text-decoration:line-through' : ''}">${esc(p.tier)} · ${esc(p.name)} <span style="opacity:.7">(剩${left})</span></div>`;
  }).join('');
  // 参与范围
  const depts = [...new Set(S.participants.map((p) => p.dept))].sort();
  const cur = $('lotScope').value;
  $('lotScope').innerHTML = '<option value="all">全部已签到同学</option>' +
    depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
  if ([...$('lotScope').options].some((o) => o.value === cur)) $('lotScope').value = cur;
}
$('lotTiers').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  const i = Number(c.dataset.tier);
  const p = (S.settings.prizes || [])[i];
  if (p && p.count - wonCount(p.tier) <= 0) return toast(`「${p.tier}」已抽完，请选择其他奖项`);
  selectedTierIdx = i;
  renderLotTiers();
});

/* 中奖名单 */
function renderWinList() {
  const recs = S.records.filter((r) => r.type === 'lottery').slice().reverse();
  $('winList').innerHTML = recs.length ? recs.map((r) => `
    <div class="win-item"><span style="font-size:18px">🎁</span>
      <div><div style="font-weight:700">${esc(r.payload.name)}</div>
      <div style="font-size:12px;color:var(--muted)">${esc(r.payload.tier)} · ${esc(r.payload.prize)}</div></div>
      <span class="t" style="margin-left:auto;color:var(--dim);font-size:11px">${fmtTime(r.at)}</span></div>`).join('')
    : '<div class="empty">还没有中奖记录</div>';
}

/* 盲盒 */
function currentBoxCount() { return Number($('boxCountSel').value) || 12; }
function renderBoxes() {
  const grid = $('boxGrid');
  const n = currentBoxCount();
  const opened = S.blindbox.opened || {};
  const icons = { prize: '🎁', penalty: '😈', task: '🎯', empty: '🫥' };
  let openInRange = 0;
  const html = [];
  for (let i = 0; i < n; i++) {
    const o = opened[i];
    if (o) openInRange++;
    const flipped = !!o;
    const icon = o ? icons[o.reward.type] || '🎁' : '?';
    const txt = o ? esc(o.reward.text) : '';
    const by = o && o.by ? `<div style="font-size:11px;color:var(--gold);margin-top:4px">${esc(o.by)}</div>` : '';
    html.push(`
      <div class="box ${flipped ? 'flipped used' : ''}" data-idx="${i}">
        <div class="box-inner">
          <div class="box-face box-front"><div><div class="q">?</div><div class="lbl">MYSTERY</div></div></div>
          <div class="box-face box-back"><div class="icon">${icon}</div><div class="txt">${txt}</div>${by}</div>
        </div>
      </div>`);
  }
  grid.innerHTML = html.join('');
  $('boxLeft').textContent = `剩余 ${n - openInRange} / ${n}`;
}

/* 惩罚转盘 */
let wheelRot = 0, spinning = false;
function buildWheel() {
  const items = S.settings.penalties || [];
  const wheel = $('wheel');
  if (!items.length) { wheel.style.background = '#222'; wheel.innerHTML = ''; return; }
  const n = items.length, seg = 360 / n, R = 100, C = 100;
  const colors = ['#ff2d4b', '#1b1b25', '#ff7a18', '#241521', '#a855f7', '#1b1b25', '#22d3ee', '#2a1420'];
  let svg = `<svg viewBox="0 0 200 200" style="width:100%;height:100%;display:block">`;
  for (let i = 0; i < n; i++) {
    const start = -90 + i * seg - seg / 2;
    const end = start + seg;
    const p1 = [C + R * Math.cos((start * Math.PI) / 180), C + R * Math.sin((start * Math.PI) / 180)];
    const p2 = [C + R * Math.cos((end * Math.PI) / 180), C + R * Math.sin((end * Math.PI) / 180)];
    const large = seg > 180 ? 1 : 0;
    svg += `<path d="M${C} ${C} L${p1[0].toFixed(2)} ${p1[1].toFixed(2)} A${R} ${R} 0 ${large} 1 ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} Z" fill="${colors[i % colors.length]}" stroke="rgba(0,0,0,.4)" stroke-width="0.5"/>`;
    const mid = -90 + i * seg;
    const tx = C + R * 0.62 * Math.cos((mid * Math.PI) / 180);
    const ty = C + R * 0.62 * Math.sin((mid * Math.PI) / 180);
    const label = items[i].length > 6 ? items[i].slice(0, 6) : items[i];
    svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#fff" font-size="7.5" font-weight="700"
      text-anchor="middle" dominant-baseline="middle" transform="rotate(${mid + 90} ${tx.toFixed(1)} ${ty.toFixed(1)})">${esc(label)}</text>`;
  }
  svg += `</svg>`;
  wheel.innerHTML = svg;
  wheel.style.transform = `rotate(${wheelRot}deg)`;
}
function renderPunishList() {
  $('punishList').innerHTML = (S.settings.penalties || []).map((p) => `<span class="chip">${esc(p)}</span>`).join('')
    || '<span style="color:var(--dim);font-size:13px">请在设置中添加惩罚项目</span>';
}
function renderPunishHistory() {
  const recs = S.records.filter((r) => r.type === 'punishment').slice().reverse();
  $('punishHistory').innerHTML = recs.length ? recs.map((r) => `
    <div class="win-item" style="border-color:rgba(255,45,75,.3);background:linear-gradient(90deg,rgba(255,45,75,.12),transparent)">
      <span>🎯</span><div style="font-weight:700">${esc(r.payload.text)}</div>
      <span class="t" style="margin-left:auto;color:var(--dim);font-size:11px">${fmtTime(r.at)}</span></div>`).join('')
    : '<div class="empty">暂无转动记录</div>';
}

/* 统计 */
function renderStats() {
  const ps = S.participants;
  $('stTotal').textContent = ps.length;
  $('stDept').textContent = new Set(ps.map((p) => p.dept)).size;
  $('stWin').textContent = ps.reduce((a, p) => a + (p.prizes ? p.prizes.length : 0), 0);
  $('stBox').textContent = Object.keys(S.blindbox.opened || {}).length;

  const map = {};
  ps.forEach((p) => (map[p.dept] = (map[p.dept] || 0) + 1));
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...arr.map((x) => x[1]));
  $('deptChart').innerHTML = arr.length ? arr.map(([d, c]) => `
    <div class="bar-row"><div class="name" title="${esc(d)}">${esc(d)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c / max) * 100}%">${c}</div></div>
      <div class="num">${c}</div></div>`).join('') : '<div class="empty">暂无数据</div>';

  const pz = {};
  ps.forEach((p) => (p.prizes || []).forEach((x) => (pz[x.tier + ' · ' + x.name] = (pz[x.tier + ' · ' + x.name] || 0) + 1)));
  const parr = Object.entries(pz).sort((a, b) => b[1] - a[1]);
  const pmax = Math.max(1, ...parr.map((x) => x[1]));
  $('prizeChart').innerHTML = parr.length ? parr.map(([d, c]) => `
    <div class="bar-row"><div class="name" title="${esc(d)}">${esc(d)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c / pmax) * 100}%;background:linear-gradient(90deg,#ffcf3f,#ff7a18)">${c}</div></div>
      <div class="num">${c}</div></div>`).join('') : '<div class="empty">暂无中奖数据</div>';
}

function renderAll() {
  renderMeta(); renderWall(); renderFeed(); renderTopStats(); renderTable();
  renderLotTiers(); renderWinList(); renderBoxes(); buildWheel(); renderPunishList(); renderPunishHistory();
  renderRankList();
  danmuTotal = (S.danmu || []).length;
  updateDanmuCount();
  if ($('view-stats').classList.contains('active')) renderStats();
  else pendingStats = true;
  snapshotLocal(S);
}
let pendingStats = false;

/* ================================ 抽奖逻辑 ================================ */
let drawing = false;
$('lotStart').onclick = async () => {
  if (drawing) return;
  const prizes = S.settings.prizes || [];
  let prize = prizes[selectedTierIdx];
  if (!prize) return toast('请先添加奖项');
  let remaining = Math.max(0, prize.count - wonCount(prize.tier));
  if (remaining <= 0) {
    const nx = prizes.findIndex((p) => p.count - wonCount(p.tier) > 0);
    if (nx < 0) return toast('🎊 所有奖项均已抽完');
    const oldTier = prize.tier;
    selectedTierIdx = nx; renderLotTiers(); prize = prizes[nx];
    remaining = Math.max(0, prize.count - wonCount(prize.tier));
    toast(`「${oldTier}」已抽完，自动切换到「${prize.tier}」`);
  }
  const pool = S.participants.filter((p) => {
    if ($('lotScope').value !== 'all' && p.dept !== $('lotScope').value) return false;
    if ($('lotUnique').checked && p.prizes && p.prizes.length) return false;
    return true;
  });
  if (!pool.length) return toast('没有可参与抽奖的同学 🙈');
  const n = Math.min(Number($('lotCount').value) || 1, pool.length, remaining);

  drawing = true;
  $('lotStart').disabled = true;
  $('lotTierLabel').textContent = prize.tier;
  $('lotPrizeLabel').textContent = prize.name;
  $('lotReel').classList.remove('win');

  const names = pool.map((p) => p.name);
  const iv = setInterval(() => { $('lotReel').textContent = names[(Math.random() * names.length) | 0]; }, 55);
  await sleep(2200);
  clearInterval(iv);

  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, n);
  for (const w of winners) {
    const reel = $('lotReel');
    reel.textContent = w.name;
    reel.classList.remove('win'); void reel.offsetWidth; reel.classList.add('win');
    confettiBurst();
    await api('POST', '/api/records', { type: 'lottery', payload: { name: w.name, dept: w.dept, tier: prize.tier, prize: prize.name } });
    await api('PATCH', '/api/participants/' + w.id, { prize: { name: prize.name, tier: prize.tier } });
    await sleep(1100);
  }
  drawing = false;
  $('lotStart').disabled = false;
  // 该奖项抽完后自动切换下一个有剩余的奖项
  if (wonCount(prize.tier) >= prize.count) {
    const nx = (S.settings.prizes || []).findIndex((p) => p.count - wonCount(p.tier) > 0);
    if (nx >= 0) { selectedTierIdx = nx; renderLotTiers(); }
  }
  toast(`🎉 ${prize.tier} 抽取完成：${winners.map((w) => w.name).join('、')}`, 4000);
};
$('lotClear').onclick = async () => {
  const recs = S.records.filter((r) => r.type === 'lottery');
  for (const r of recs) await api('DELETE', '/api/records?id=' + r.id);
  toast('已清空中奖记录');
};

/* ================================ 盲盒逻辑 ================================ */
$('boxGrid').addEventListener('click', async (e) => {
  const box = e.target.closest('.box');
  if (!box || box.classList.contains('used')) return;
  const idx = box.dataset.idx;
  const pool = S.settings.blindboxRewards || [];
  const reward = pool.length ? pool[(Math.random() * pool.length) | 0] : { type: 'prize', text: '谢谢参与' };
  const by = ($('boxPlayer').value || '').trim();
  box.classList.add('flipped', 'used');
  const icons = { prize: '🎁', penalty: '😈', task: '🎯', empty: '🫥' };
  box.querySelector('.box-back').innerHTML = `
    <div class="icon">${icons[reward.type] || '🎁'}</div>
    <div class="txt">${esc(reward.text)}</div>
    ${by ? `<div style="font-size:11px;color:var(--gold);margin-top:4px">${esc(by)}</div>` : ''}`;
  if (reward.type === 'prize') confettiBurst();
  await api('POST', '/api/blindbox', { index: Number(idx), by: by || '匿名', reward });
  await api('POST', '/api/records', { type: 'blindbox', payload: { by: by || '匿名', reward } });
});
$('boxReset').onclick = async () => { await api('DELETE', '/api/blindbox'); toast('盲盒已重置'); };
$('boxCountSel').onchange = renderBoxes;

/* ================================ 惩罚转盘 ================================ */
$('wheelHub').onclick = () => spinWheel();
async function spinWheel() {
  if (spinning) return;
  const items = S.settings.penalties || [];
  if (!items.length) return toast('请先在设置中添加惩罚项目');
  spinning = true;
  const n = items.length, seg = 360 / n;
  const i = (Math.random() * n) | 0;
  const targetMod = (((-i * seg) % 360) + 360) % 360;
  const currentMod = ((wheelRot % 360) + 360) % 360;
  let delta = targetMod - currentMod; if (delta < 0) delta += 360;
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  wheelRot += 360 * 6 + delta + jitter;
  $('wheel').style.transform = `rotate(${wheelRot}deg)`;
  $('punishResult').textContent = '转 动 中…';
  await sleep(4700);
  $('punishResult').textContent = items[i];
  $('punishResult').classList.remove('win'); void $('punishResult').offsetWidth; $('punishResult').classList.add('win');
  confettiBurst();
  await api('POST', '/api/records', { type: 'punishment', payload: { text: items[i] } });
  spinning = false;
}
$('punishClear').onclick = async () => {
  const recs = S.records.filter((r) => r.type === 'punishment');
  for (const r of recs) await api('DELETE', '/api/records?id=' + r.id);
  toast('已清空转动记录');
};

/* ================================ 游戏逻辑 ================================ */
let bomb = { lo: 1, hi: 100, secret: null, guesses: [] };
function renderBomb() {
  $('bombRange').textContent = bomb.secret === 0 ? '💥 BOOM 💥' : `${bomb.lo} ~ ${bomb.hi}`;
  $('bombGuesses').innerHTML = bomb.guesses.map((g) => `<span class="bomb-guess ${g.hit ? 'hit' : ''}">${g.n}${g.hit ? ' 💥' : ''}</span>`).join('');
}
$('bombNew').onclick = () => {
  bomb = { lo: 1, hi: 100, secret: (Math.random() * 100 | 0) + 1, guesses: [] };
  $('bombHint').textContent = '炸弹已埋好（1~100），开始猜测吧！';
  renderBomb();
};
$('bombGuess').onclick = async () => {
  const x = Number($('bombInput').value);
  if (!bomb.secret) return toast('请先点击“开始新一局”');
  if (!x || x < bomb.lo || x > bomb.hi) return toast(`请输入 ${bomb.lo} ~ ${bomb.hi} 之间的数字`);
  $('bombInput').value = '';
  if (x === bomb.secret) {
    const bombVal = bomb.secret;
    bomb.lo = x; bomb.hi = x;
    bomb.guesses.push({ n: x, hit: true });
    bomb.secret = 0; // 标记已爆炸
    renderBomb();
    $('bombHint').textContent = `💥 BOOM！${bombVal} 就是炸弹！`;
    confettiBurst();
    await api('POST', '/api/records', { type: 'bomb', payload: { n: x } });
    return;
  }
  if (x < bomb.secret) { bomb.lo = Math.max(bomb.lo, x + 1); $('bombHint').textContent = `${x} → 小了，往上猜`; }
  else { bomb.hi = Math.min(bomb.hi, x - 1); $('bombHint').textContent = `${x} → 大了，往下猜`; }
  bomb.guesses.push({ n: x, hit: false });
  renderBomb();
};
$('bombInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('bombGuess').click(); });

let lastQuiz = -1;
$('quizNext').onclick = () => {
  const bank = S.settings.quiz || [];
  if (!bank.length) return toast('题库为空，请在设置中添加');
  let i = (Math.random() * bank.length) | 0;
  if (bank.length > 1) { while (i === lastQuiz) i = (Math.random() * bank.length) | 0; }
  lastQuiz = i;
  $('quizQ').textContent = bank[i].q;
  $('quizA').textContent = bank[i].a;
  $('quizA').classList.add('hidden');
};
$('quizReveal').onclick = () => $('quizA').classList.toggle('hidden');

$('pickBtn').onclick = async () => {
  if (!S.participants.length) return toast('还没有同学签到');
  const el = $('pickResult');
  const names = S.participants.map((p) => p.name);
  const iv = setInterval(() => { el.textContent = names[(Math.random() * names.length) | 0]; }, 55);
  await sleep(1800);
  clearInterval(iv);
  const p = S.participants[(Math.random() * S.participants.length) | 0];
  el.textContent = p.name;
  el.classList.remove('win'); void el.offsetWidth; el.classList.add('win');
  confettiBurst();
};

/* ================================ 管理操作 ================================ */
$('search').addEventListener('input', renderTable);
$('pplBody').addEventListener('click', async (e) => {
  const id = e.target.dataset.del;
  if (!id) return;
  if (!confirm('确定删除该签到记录？')) return;
  await api('DELETE', '/api/participants/' + id);
});
$('exportBtn').onclick = () => { window.location.href = '/api/export.csv'; };
$('statsExport').onclick = () => { window.location.href = '/api/export.csv'; };
$('clearPplBtn').onclick = async () => {
  if (!confirm('确定清空全部签到名单？此操作不可恢复！')) return;
  await api('POST', '/api/reset', { scope: 'participants' });
  toast('已清空签到名单');
};

/* 手动添加 */
$('addBtn').onclick = () => $('addMask').classList.add('show');
$('addClose').onclick = () => $('addMask').classList.remove('show');
$('addMask').onclick = (e) => { if (e.target === $('addMask')) $('addMask').classList.remove('show'); };
$('addSubmit').onclick = async () => {
  const name = $('addName').value.trim();
  if (!name) return toast('请填写姓名');
  await api('POST', '/api/participants', {
    name, dept: $('addDept').value.trim() || '未填写', phone: $('addPhone').value.trim(), seat: $('addSeat').value.trim(),
  });
  $('addName').value = $('addDept').value = $('addPhone').value = $('addSeat').value = '';
  $('addMask').classList.remove('show');
  toast('已添加：' + name);
};

/* ================================ 设置弹窗 ================================ */
$('settingsBtn').onclick = () => {
  $('setTitle').value = S.meta.title || '';
  $('setSubtitle').value = S.meta.subtitle || '';
  $('setPrizes').value = (S.settings.prizes || []).map((p) => `${p.tier} | ${p.name} | ${p.count}`).join('\n');
  $('setPenalties').value = (S.settings.penalties || []).join('\n');
  $('setBox').value = (S.settings.blindboxRewards || []).map((r) => `${r.type} | ${r.text}`).join('\n');
  $('setQuiz').value = (S.settings.quiz || []).map((q) => `${q.q} | ${q.a}`).join('\n');
  $('setWords').value = (S.settings.words || []).join('\n');
  $('setMask').classList.add('show');
};
$('setClose').onclick = () => $('setMask').classList.remove('show');
$('setMask').onclick = (e) => { if (e.target === $('setMask')) $('setMask').classList.remove('show'); };
$('setSave').onclick = async () => {
  const prizes = $('setPrizes').value.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0])
    .map((a) => ({ tier: a[0], name: a[1] || a[0], count: Number(a[2]) || 1 }));
  const penalties = $('setPenalties').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const blindboxRewards = $('setBox').value.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0])
    .map((a) => ({ type: ['prize', 'penalty', 'task', 'empty'].includes(a[0]) ? a[0] : 'prize', text: a[1] || a[0] }));
  const quiz = $('setQuiz').value.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0])
    .map((a) => ({ q: a[0], a: a[1] || '' }));
  const words = $('setWords').value.split('\n').map((s) => s.trim()).filter(Boolean);
  await api('POST', '/api/settings', { prizes, penalties, blindboxRewards, quiz, words });
  await api('POST', '/api/meta', { title: $('setTitle').value.trim(), subtitle: $('setSubtitle').value.trim() });
  $('setMask').classList.remove('show');
  toast('设置已保存 ✅');
};
$('resetAll').onclick = async () => {
  if (!confirm('⚠️ 将清空全部签到与互动数据，确定继续？')) return;
  await api('POST', '/api/reset', { scope: 'all' });
  $('setMask').classList.remove('show');
  toast('已重置全部数据');
};

/* ================================ 二维码 ================================ */
async function loadQR() {
  try {
    const net = await api('GET', '/api/net');
    const u = net.urls && net.urls.length ? net.urls : [location.origin + '/checkin'];
    const d = net.danmu && net.danmu.length ? net.danmu : [location.origin + '/danmu'];
    $('qrUrlSelect').innerHTML = u.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    applyQR(u[0]);
    $('qrUrlSelect').onchange = () => applyQR($('qrUrlSelect').value);
    $('danmuUrlSelect').innerHTML = d.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    applyDanmuQR(d[0]);
    $('danmuUrlSelect').onchange = () => applyDanmuQR($('danmuUrlSelect').value);
  } catch (_) {
    applyQR(location.origin + '/checkin');
    applyDanmuQR(location.origin + '/danmu');
  }
}
function applyQR(url) {
  $('qrUrl').textContent = url;
  const src = '/api/qr?text=' + encodeURIComponent(url);
  $('manageQr').src = src;
  $('wallQr').src = src;
}
function applyDanmuQR(url) {
  $('danmuUrl').textContent = url;
  $('danmuQr').src = '/api/qr?text=' + encodeURIComponent(url);
}
$('copyUrlBtn').onclick = async () => {
  try { await navigator.clipboard.writeText($('qrUrl').textContent); toast('签到链接已复制'); }
  catch (_) { toast('复制失败，请手动复制'); }
};

/* ================================ 积分排行榜 ================================ */
function renderRankList() {
  const list = [...S.participants].filter((p) => (p.score || 0) !== 0).sort((a, b) => b.score - a.score).slice(0, 12);
  $('rankList').innerHTML = list.length ? list.map((p, i) => `
    <div class="rank-item">
      <div class="rank-no ${i === 0 ? 'g1' : i === 1 ? 'g2' : i === 2 ? 'g3' : ''}">${i + 1}</div>
      <div><div style="font-weight:700">${esc(p.name)}</div>
        <div style="color:var(--muted);font-size:12px">${esc(p.dept)}</div></div>
      <div class="rank-score">${p.score}</div>
    </div>`).join('') : '<div class="empty">还没有同学得分，抢答后给 TA 加分吧</div>';
}
async function addScore(name, delta) {
  name = (name || '').trim();
  if (!name) return toast('请先输入或选择同学姓名');
  const p = S.participants.find((x) => x.name === name);
  if (!p) return toast('名单中没有「' + esc(name) + '」');
  await api('PATCH', '/api/participants/' + p.id, { scoreDelta: delta });
  toast(`${delta > 0 ? '👏' : '😅'} <b>${esc(p.name)}</b> ${delta > 0 ? '+' : ''}${delta} 分`);
}
$('scoreAdd').onclick = () => { addScore($('scoreName').value, 1); };
$('scoreName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addScore($('scoreName').value, 1); });
document.querySelectorAll('#view-games .chip[data-sd]').forEach((c) => {
  c.onclick = () => addScore($('scoreName').value, Number(c.dataset.sd));
});
$('scoreReset').onclick = async () => {
  const list = S.participants.filter((p) => (p.score || 0) !== 0);
  if (!list.length) return toast('当前没有积分');
  if (!confirm('确定将所有同学积分清零？')) return;
  for (const p of list) await api('PATCH', '/api/participants/' + p.id, { scoreDelta: -p.score });
  toast('积分已清零');
};

/* ================================ 你演我猜 ================================ */
const char = { running: false, time: 60, total: 60, timer: null, hit: 0, skip: 0 };
function charWord() {
  const ws = S.settings.words || [];
  return ws.length ? ws[(Math.random() * ws.length) | 0] : '——';
}
function charScoreUI() { $('charScore').textContent = `得分 ${char.hit} · 跳过 ${char.skip}`; }
function charNext() { $('charWord').textContent = charWord(); }
$('charStart').onclick = () => {
  if (char.running) { // 再次点击 = 提前结束
    charFinish(); return;
  }
  char.running = true; char.time = char.total; char.hit = 0; char.skip = 0;
  charScoreUI(); charNext();
  $('charTimer').style.width = '100%';
  $('charStart').textContent = '⏹ 结束';
  $('charHint').textContent = '表演中… 猜对点「✅」，卡住点「⏭」';
  char.timer = setInterval(() => {
    char.time--;
    $('charTimer').style.width = Math.max(0, (char.time / char.total) * 100) + '%';
    if (char.time <= 0) charFinish();
  }, 1000);
};
function charFinish() {
  clearInterval(char.timer); char.running = false;
  $('charStart').textContent = '▶ 开始（60s）';
  $('charHint').textContent = `时间到！本轮猜对 ${char.hit} 个 🎉`;
  if (char.hit > 0) confettiBurst();
}
$('charHit').onclick = () => { if (!char.running) return toast('先点「开始」'); char.hit++; charScoreUI(); confettiBurst(innerWidth / 2, innerHeight / 2, 45); charNext(); };
$('charSkip').onclick = () => { if (!char.running) return toast('先点「开始」'); char.skip++; charScoreUI(); charNext(); };

/* ================================ 随机分组器 ================================ */
$('teamSplit').onclick = () => {
  const ps = [...S.participants].sort(() => Math.random() - 0.5);
  if (!ps.length) return toast('还没有同学签到');
  const n = Number($('teamCount').value) || 4;
  const teams = Array.from({ length: n }, () => []);
  ps.forEach((p, i) => teams[i % n].push(p));
  const colors = ['#ff2d4b', '#ff7a18', '#ffcf3f', '#34d399', '#22d3ee', '#a855f7'];
  $('teamResult').innerHTML = '<div class="group-grid">' + teams.map((t, i) => `
    <div class="group-col">
      <h4 style="background:linear-gradient(135deg,${colors[i % colors.length]},${colors[(i + 1) % colors.length]})">第 ${i + 1} 组 · ${t.length} 人</h4>
      <div class="members">${t.map((p) => esc(p.name)).join('<br>') || '—'}</div>
    </div>`).join('') + '</div>';
  confettiBurst(innerWidth / 2, innerHeight / 2, 60);
};

/* ================================ 涂鸦板 ================================ */
const board = $('board'), bctx = board.getContext('2d');
let bDrawing = false, bColor = '#ff2d4b', bSize = 8, bErase = false, bLast = null, bW = 0, bH = 0;
function fitBoard() {
  const r = board.getBoundingClientRect();
  if (r.width < 10) return;
  const dpr = window.devicePixelRatio || 1;
  bW = r.width; bH = r.height;
  board.width = bW * dpr; board.height = bH * dpr;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bctx.lineCap = 'round'; bctx.lineJoin = 'round';
}
function boardPoint(e) {
  const r = board.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function boardStroke(a, b) {
  bctx.strokeStyle = bErase ? '#f4f4f8' : bColor;
  bctx.lineWidth = bErase ? bSize * 3 : bSize;
  bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.lineTo(b.x, b.y); bctx.stroke();
}
board.addEventListener('pointerdown', (e) => {
  board.setPointerCapture(e.pointerId);
  bDrawing = true; bLast = boardPoint(e);
  boardStroke(bLast, { x: bLast.x + 0.1, y: bLast.y + 0.1 });
});
board.addEventListener('pointermove', (e) => { if (!bDrawing) return; const p = boardPoint(e); boardStroke(bLast, p); bLast = p; });
board.addEventListener('pointerup', () => { bDrawing = false; });
board.addEventListener('pointercancel', () => { bDrawing = false; });
(function buildBoardTools() {
  const tools = $('boardTools');
  const palette = ['#ff2d4b', '#ff7a18', '#ffcf3f', '#34d399', '#22d3ee', '#a855f7', '#111111', '#ffffff'];
  palette.forEach((c, i) => {
    const s = document.createElement('span');
    s.className = 'swatch' + (i === 0 ? ' on' : '');
    s.style.background = c;
    s.onclick = () => { bColor = c; bErase = false; $('boardEraser').classList.remove('btn-primary');
      [...tools.querySelectorAll('.swatch')].forEach((x) => x.classList.toggle('on', x === s)); };
    tools.appendChild(s);
  });
  const sz = document.createElement('select');
  sz.style.cssText = 'width:74px;padding:7px 10px';
  sz.innerHTML = '<option value="4">细</option><option value="8" selected>中</option><option value="16">粗</option>';
  sz.onchange = () => (bSize = Number(sz.value));
  tools.appendChild(sz);
  const er = document.createElement('button');
  er.className = 'btn btn-sm'; er.id = 'boardEraser'; er.textContent = '🧽 橡皮';
  er.onclick = () => { bErase = !bErase; er.classList.toggle('btn-primary', bErase); };
  tools.appendChild(er);
  const cl = document.createElement('button');
  cl.className = 'btn btn-sm btn-danger'; cl.textContent = '🗑 清空';
  cl.onclick = () => { bctx.save(); bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, board.width, board.height); bctx.restore(); };
  tools.appendChild(cl);
})();
let boardFitTimer = null;
addEventListener('resize', () => { clearTimeout(boardFitTimer); boardFitTimer = setTimeout(fitBoard, 200); });

/* ================================ 弹幕墙 ================================ */
let danmuTotal = 0;
const DANMU_COLORS = ['#ff5c74', '#ff9a3d', '#ffd93f', '#5ee6a8', '#4fd6f0', '#c88cff', '#ffffff'];
function updateDanmuCount() { $('danmuCount').textContent = '已收 ' + danmuTotal + ' 条'; }
function spawnDanmu(d) {
  const box = $('danmuCanvas');
  if (!box) return;
  const empty = $('danmuEmpty'); if (empty) empty.style.display = 'none';
  const el = document.createElement('div');
  el.className = 'danmu-item';
  el.style.color = d.color || DANMU_COLORS[(Math.random() * DANMU_COLORS.length) | 0];
  el.innerHTML = `<span class="who">${esc(d.name)}</span>${esc(d.text)}`;
  const W = box.clientWidth || window.innerWidth;
  const H = box.clientHeight || 400;
  const laneH = 58;
  const lanes = Math.max(1, Math.floor((H - 16) / laneH));
  el.style.top = Math.floor(Math.random() * lanes) * laneH + 8 + 'px';
  el.style.transform = `translateX(${W}px)`;
  box.appendChild(el);
  const w = el.offsetWidth || 200;
  const speed = Number($('danmuSpeed').value) || 200;
  const dur = Math.max(2500, ((W + w) / speed) * 1000);
  const anim = el.animate(
    [{ transform: `translateX(${W}px)` }, { transform: `translateX(-${w}px)` }],
    { duration: dur, easing: 'linear', fill: 'forwards' }
  );
  anim.onfinish = () => el.remove();
}
function clearDanmuStage() {
  const box = $('danmuCanvas');
  box.querySelectorAll('.danmu-item').forEach((x) => x.remove());
  if ($('danmuEmpty')) $('danmuEmpty').style.display = '';
  danmuTotal = 0; updateDanmuCount();
}
// 切入弹幕墙时回放最近的历史弹幕，避免空屏
function replayDanmu() {
  const box = $('danmuCanvas');
  if (!box || box.querySelector('.danmu-item')) return;
  (S.danmu || []).slice(-8).forEach((d, i) => setTimeout(() => spawnDanmu(d), i * 260));
}
$('danmuSend').onclick = async () => {
  const text = $('danmuTest').value.trim();
  if (!text) return toast('请输入弹幕内容');
  await api('POST', '/api/danmu', { text, name: '主持人' });
  $('danmuTest').value = '';
};
$('danmuTest').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('danmuSend').click(); });
$('danmuClear').onclick = async () => { await api('DELETE', '/api/danmu'); toast('弹幕已清屏'); };
document.querySelector('[data-view="danmu"]').addEventListener('click', () => setTimeout(() => { fitBoard(); replayDanmu(); }, 30));

/* ================================ 数据备份 ================================ */
const SNAP_KEY = 'meetup_backup';
let lastSnapAt = 0;

function fmtDateTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 把最新状态镜像到浏览器本地，服务器重启后可一键恢复 */
function snapshotLocal(s) {
  const now = Date.now();
  if (now - lastSnapAt < 5000) return;
  lastSnapAt = now;
  try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: now, state: s })); } catch (_) {}
  const el = $('bkLocal');
  if (el) el.textContent = fmtDateTime(now);
}

async function updateBkTime() {
  try {
    const r = await api('GET', '/api/backups');
    const b = (r.backups || [])[0];
    const el = $('bkServer');
    if (el) el.textContent = b ? fmtDateTime(b.at) : '--';
  } catch (_) {}
}

$('bkNow').onclick = async () => {
  const r = await api('POST', '/api/backup');
  toast(r.ok ? `💾 已备份到服务器<br><span style="font-size:12px">${esc(r.name || '')}</span>` : '备份失败');
  updateBkTime();
};

$('bkDownload').onclick = () => { window.location.href = '/api/backup'; };

$('bkRestoreLocal').onclick = async () => {
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch (_) {}
  if (!snap || !snap.state) return toast('本机暂无快照');
  const n = (snap.state.participants || []).length;
  if (!confirm(`确认用本机快照（${fmtDateTime(snap.at)}，${n} 人签到）覆盖当前数据？`)) return;
  const r = await api('POST', '/api/restore', snap.state);
  toast(r.ok ? `♻️ 已从本机恢复 ${r.participants} 人` : '恢复失败');
  updateBkTime();
};

$('bkFile').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const n = ((data.state || data).participants || []).length;
    if (!confirm(`确认用「${f.name}」（${n} 人签到）覆盖当前数据？`)) return;
    const r = await api('POST', '/api/restore', data);
    toast(r.ok ? `♻️ 已导入恢复 ${r.participants} 人` : '恢复失败');
    updateBkTime();
  } catch (_) {
    toast('文件解析失败，请选择导出的备份 JSON');
  }
};

/* ================================ 实时连接 ================================ */
function connectSSE() {
  const es = new EventSource('/api/stream');
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'state') {
        S = msg.state;
        renderAll();
        if (pendingStats && $('view-stats').classList.contains('active')) { renderStats(); pendingStats = false; }
      } else if (msg.t === 'checkin') {
        toast(`🎉 <b>${esc(msg.p.name)}</b> 签到成功（第 ${msg.p.no} 位）`);
        confettiBurst(innerWidth / 2, innerHeight / 2, 90);
      } else if (msg.t === 'danmu') {
        danmuTotal++; updateDanmuCount();
        spawnDanmu(msg.d);
      } else if (msg.t === 'danmu-clear') {
        clearDanmuStage();
      }
    } catch (_) {}
  };
  es.onerror = () => { /* 自动重连 */ };
}

/* 切到统计时刷新 */
document.querySelector('[data-view="stats"]').addEventListener('click', () => setTimeout(renderStats, 30));

/* 启动 */
(async function init() {
  try { S = await api('GET', '/api/state'); } catch (_) {}
  renderAll();
  loadQR();
  connectSSE();
  setTimeout(fitBoard, 60);
  updateBkTime();
  try {
    const snap = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    if (snap && snap.at) $('bkLocal').textContent = fmtDateTime(snap.at);
  } catch (_) {}
})();

/* ------------------------------ 一点小彩蛋 ------------------------------ */
console.log('%c✦ 校团委社会实践部 · 新生见面会系统', 'color:#ff2d4b;font-size:14px;font-weight:700');
console.log('%cDesigned & Built by 张和浩 · 信息学院软件2402', 'color:#ffcf3f;font-size:12px');

/* 连点左上角 logo 5 次有惊喜 */
let logoTap = 0, logoTapTimer = null;
const logoEl = document.querySelector('.brand .logo');
if (logoEl) {
  logoEl.style.cursor = 'pointer';
  logoEl.addEventListener('click', () => {
    logoTap++;
    clearTimeout(logoTapTimer);
    logoTapTimer = setTimeout(() => { logoTap = 0; }, 1500);
    if (logoTap >= 5) {
      logoTap = 0;
      confettiBurst();
      toast('✨ 本系统由 <b>张和浩</b> 独立设计开发<br><span style="font-size:12px">信息学院 软件2402</span>', 4000);
    }
  });
}