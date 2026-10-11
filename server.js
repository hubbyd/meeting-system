/**
 * 校团委社会实践部 · 新生见面会系统
 * 零重依赖 HTTP 服务：静态资源 + 签到 API + SSE 实时推送 + CSV 导出 + 二维码
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
// 公网访问地址解析顺序（部署后自动识别，无需手动配置）：
//   1) 手动指定 PUBLIC_URL / BASE_URL
//   2) 云平台自动注入的环境变量（Render / Railway / Vercel / Fly 等）
// 解析到后二维码将优先指向该公网 HTTPS 地址，任意网络的手机微信均可扫码签到
const PUBLIC_URL = (
  process.env.PUBLIC_URL ||
  process.env.BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '') ||
  (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '') ||
  (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : '')
).replace(/\/+$/, '');
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

/* ---------------------------------- 状态 ---------------------------------- */

const defaultState = () => ({
  meta: {
    title: '校团委社会实践部 · 新生见面会',
    subtitle: '以青春之名，赴一场热爱之约',
    createdAt: Date.now(),
  },
  participants: [], // 签到名单
  records: [], // 抽奖 / 盲盒 / 惩罚 / 游戏 记录
  danmu: [], // 弹幕留言（实时滚动）
  blindbox: { opened: {} }, // 盲盒已开启的格子
  settings: {
    prizes: [
      { tier: '特等奖', name: '定制蓝牙音箱', count: 1 },
      { tier: '一等奖', name: '文创保温杯', count: 2 },
      { tier: '二等奖', name: '精美笔记本套装', count: 5 },
      { tier: '三等奖', name: '部门限定帆布包', count: 8 },
      { tier: '幸运奖', name: '随机盲盒小礼品', count: 20 },
    ],
    penalties: [
      '表演一段才艺',
      '做10个深蹲',
      '用方言自我介绍',
      '唱一句歌的高潮部分',
      '模仿一位在场学长学姐',
      '回答一个快问快答',
      '给旁边同学一个真诚的夸奖',
      '分享一件你高考后最开心的事',
    ],
    blindboxRewards: [
      { type: 'prize', text: '部门限定钥匙扣 ×1' },
      { type: 'prize', text: '饮料一瓶' },
      { type: 'penalty', text: '做5个开合跳' },
      { type: 'penalty', text: '说三个和“社”有关的成语' },
      { type: 'task', text: '邀请一位新同学合影' },
      { type: 'task', text: '记住三位同学的名字' },
      { type: 'prize', text: '神秘小零食' },
      { type: 'empty', text: '谢谢参与，摸摸头' },
      { type: 'prize', text: '免一次部门值日' },
      { type: 'penalty', text: '用三种语气说“我来了”' },
      { type: 'task', text: '向全场喊一句部门口号' },
      { type: 'prize', text: '定制贴纸一张' },
    ],
    quiz: [
      { q: '社会实践部的全称所属层级是？', a: '校团委（共青团委员会）' },
      { q: '中国共青团成立于哪一年？', a: '1922年' },
      { q: '“三下乡”指的是什么？', a: '文化、科技、卫生下乡' },
      { q: '志愿者精神是哪八个字？', a: '奉献、友爱、互助、进步' },
      { q: '五四青年节是每年的几月几日？', a: '5月4日' },
    ],
    words: [
      '打篮球', '弹钢琴', '刷牙', '开汽车', '唱歌', '跳舞', '做饭', '打游戏',
      '自拍', '跑步', '睡觉', '看书', '下雨', '游泳', '跳绳', '骑自行车',
      '化妆', '洗头', '吃火锅', '打喷嚏', '蜘蛛侠', '孙悟空', '圣诞老人', '章鱼',
      '蜗牛', '大象', '长颈鹿', '放风筝', '钓鱼', '写作业', '打电话', '喝奶茶',
      '撸猫', '拍照', '打羽毛球', '下棋', '包饺子', '照镜子',
    ],
  },
});

let state = defaultState();

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state = Object.assign(defaultState(), raw);
      state.settings = Object.assign(defaultState().settings, raw.settings || {});
      state.blindbox = raw.blindbox || { opened: {} };
    }
  } catch (e) {
    console.error('读取存档失败，使用初始状态：', e.message);
  }
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error('写入存档失败：', e.message);
    }
  }, 150);
}

/* --------------------------------- SSE 推送 -------------------------------- */

const clients = new Set();

function broadcast(obj) {
  const payload = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (_) {
      clients.delete(res);
    }
  }
}

function pushState() {
  broadcast({ t: 'state', state });
}

/* --------------------------------- 工具函数 -------------------------------- */

const uid = () => crypto.randomBytes(8).toString('hex');

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2e6) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* --------------------------------- 路由处理 -------------------------------- */

async function handleApi(req, res, url) {
  const { pathname } = url;

  // SSE 事件流
  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify({ t: 'state', state })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {}
    }, 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return true;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    sendJSON(res, 200, state);
    return true;
  }

  // 局域网 / 公网访问地址（供生成签到、弹幕二维码）
  if (pathname === '/api/net' && req.method === 'GET') {
    const ips = lanIPs();
    const hosts = ips.length ? ips : ['localhost'];
    const bases = [
      ...(PUBLIC_URL ? [PUBLIC_URL] : []),
      ...hosts.map((ip) => `http://${ip}:${PORT}`),
    ];
    sendJSON(res, 200, {
      port: PORT,
      publicUrl: PUBLIC_URL || null,
      hosts,
      urls: bases.map((b) => `${b}/checkin`),
      danmu: bases.map((b) => `${b}/danmu`),
    });
    return true;
  }

  // 二维码
  if (pathname === '/api/qr' && req.method === 'GET') {
    const text = url.searchParams.get('text') || 'https://example.com';
    try {
      const svg = await QRCode.toString(text, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b0b0f', light: '#ffffff' },
      });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(svg);
    } catch (e) {
      sendJSON(res, 500, { error: e.message });
    }
    return true;
  }

  // CSV 导出
  if (pathname === '/api/export.csv' && req.method === 'GET') {
    const cols = ['序号', '姓名', '部门/学院', '联系电话', '座位号', '备注', '签到时间', '获奖记录', '积分'];
    const rows = [cols.join(',')];
    const sorted = [...state.participants].sort((a, b) => a.no - b.no);
    for (const p of sorted) {
      const prizes = (p.prizes || []).map((x) => x.name).join(' / ');
      rows.push(
        [
          p.no,
          p.name,
          p.dept,
          p.phone || '',
          p.seat || '',
          p.note || '',
          new Date(p.checkinAt).toLocaleString('zh-CN'),
          prizes,
          p.score || 0,
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    const bom = '\ufeff';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="meetup-checkin.csv"',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(bom + rows.join('\r\n'));
    return true;
  }

  if (pathname === '/api/checkin' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const dept = String(body.dept || '').trim();
    if (!name) return sendJSON(res, 400, { error: '请填写姓名' });
    const exist = state.participants.find((p) => p.name === name && p.dept === dept);
    if (exist) {
      return sendJSON(res, 200, { ok: true, duplicate: true, participant: exist });
    }
    const p = {
      id: uid(),
      no: state.participants.length + 1,
      name,
      dept: dept || '未填写',
      phone: String(body.phone || '').trim(),
      seat: String(body.seat || '').trim(),
      note: String(body.note || '').trim(),
      checkinAt: Date.now(),
      prizes: [],
      score: 0,
    };
    state.participants.push(p);
    persist();
    broadcast({ t: 'checkin', p });
    pushState();
    return sendJSON(res, 200, { ok: true, participant: p });
  }

  // 手动 / 批量添加
  if (pathname === '/api/participants' && req.method === 'POST') {
    const body = await readBody(req);
    const list = Array.isArray(body) ? body : [body];
    const added = [];
    for (const item of list) {
      const name = String(item.name || '').trim();
      if (!name) continue;
      const p = {
        id: uid(),
        no: state.participants.length + 1,
        name,
        dept: String(item.dept || '未填写').trim(),
        phone: String(item.phone || '').trim(),
        seat: String(item.seat || '').trim(),
        note: String(item.note || '').trim(),
        checkinAt: Date.now(),
        prizes: [],
        score: 0,
      };
      state.participants.push(p);
      added.push(p);
    }
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true, added });
  }

  // 更新（发奖 / 加分）
  const patchMatch = pathname.match(/^\/api\/participants\/([^/]+)$/);
  if (patchMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const id = patchMatch[1];
    const p = state.participants.find((x) => x.id === id);
    if (!p) return sendJSON(res, 404, { error: '未找到该参与者' });
    if (req.method === 'DELETE') {
      state.participants = state.participants.filter((x) => x.id !== id);
      state.participants.forEach((x, i) => (x.no = i + 1));
      persist();
      pushState();
      return sendJSON(res, 200, { ok: true });
    }
    const body = await readBody(req);
    if (body.prize) {
      p.prizes = p.prizes || [];
      p.prizes.push({ name: body.prize.name, tier: body.prize.tier, at: Date.now() });
    }
    if (typeof body.scoreDelta === 'number') p.score = (p.score || 0) + body.scoreDelta;
    if (body.name) p.name = body.name;
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true, participant: p });
  }

  // 记录（抽奖 / 盲盒 / 惩罚 / 游戏）
  if (pathname === '/api/records' && req.method === 'POST') {
    const body = await readBody(req);
    const rec = {
      id: uid(),
      type: body.type || 'misc',
      payload: body.payload || {},
      at: Date.now(),
    };
    state.records.push(rec);
    if (state.records.length > 500) state.records = state.records.slice(-500);
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true, record: rec });
  }

  if (pathname === '/api/records' && req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    state.records = id ? state.records.filter((r) => r.id !== id) : [];
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true });
  }

  // 弹幕留言：高频、轻量，仅推送单条事件（不推送完整 state）
  if (pathname === '/api/danmu' && req.method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').trim().slice(0, 60);
    if (!text) return sendJSON(res, 400, { error: '弹幕内容不能为空' });
    const d = {
      id: uid(),
      name: String(body.name || '').trim().slice(0, 12) || '匿名同学',
      text,
      color: String(body.color || '').slice(0, 20),
      at: Date.now(),
    };
    state.danmu.push(d);
    if (state.danmu.length > 300) state.danmu = state.danmu.slice(-300);
    persist();
    broadcast({ t: 'danmu', d });
    return sendJSON(res, 200, { ok: true, danmu: d });
  }
  if (pathname === '/api/danmu' && req.method === 'DELETE') {
    state.danmu = [];
    persist();
    broadcast({ t: 'danmu-clear' });
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // 盲盒开启状态
  if (pathname === '/api/blindbox' && req.method === 'POST') {
    const body = await readBody(req);
    state.blindbox.opened[body.index] = { by: body.by || '匿名', reward: body.reward, at: Date.now() };
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true });
  }
  if (pathname === '/api/blindbox' && req.method === 'DELETE') {
    state.blindbox = { opened: {} };
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true });
  }

  // 设置
  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    state.settings = Object.assign(state.settings, body);
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/meta' && req.method === 'POST') {
    const body = await readBody(req);
    state.meta = Object.assign(state.meta, body);
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true });
  }

  // 重置
  if (pathname === '/api/reset' && req.method === 'POST') {
    const body = await readBody(req);
    const scope = body.scope || 'all';
    if (scope === 'all' || scope === 'participants') state.participants = [];
    if (scope === 'all' || scope === 'records') state.records = [];
    if (scope === 'all' || scope === 'blindbox') state.blindbox = { opened: {} };
    persist();
    pushState();
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 404, { error: '未知接口' });
  return true;
}

/* --------------------------------- 静态资源 -------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/checkin' || pathname === '/checkin/') pathname = '/checkin.html';
  // 无扩展名的路径自动补 .html（支持 /checkin、/admin 等友好链接）
  if (!path.extname(pathname)) pathname += '.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1 style="font-family:sans-serif">404 未找到页面</h1>');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/* ---------------------------------- 启动 ---------------------------------- */

function lanIPs() {
  const found = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) found.push({ name, address: net.address });
    }
  }
  const isPrivate = (ip) =>
    /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  // 虚拟网卡（WSL / VirtualBox / VMware / Docker 等）排名靠后，避免二维码指向手机连不上的地址
  const isVirtual = (name) =>
    /virtual|vmware|vbox|virtualbox|hyper-?v|wsl|docker|vethernet|tap|tun|bluetooth|zerotier|tailscale|radmin|loopback/i.test(name);
  const score = (x) => (isPrivate(x.address) ? 0 : 2) + (isVirtual(x.name) ? 1 : 0);
  found.sort((a, b) => score(a) - score(b));
  return found.map((x) => x.address);
}

loadState();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      console.error(e);
      sendJSON(res, 500, { error: e.message });
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   校团委社会实践部 · 新生见面会系统 已启动 🎉      ║');
  console.log('  ╚══════════════════════════════════════════════════╝\n');
  console.log(`  大屏管理端 :  http://localhost:${PORT}/`);
  if (PUBLIC_URL) {
    console.log(`  公网签到页 :  ${PUBLIC_URL}/checkin   (二维码默认地址 ✅)`);
    console.log(`  公网弹幕页 :  ${PUBLIC_URL}/danmu`);
  }
  ips.forEach((ip) => console.log(`  内网签到页 :  http://${ip}:${PORT}/checkin   (需同一 WiFi)`));
  if (!ips.length) console.log(`  手机签到页 :  http://localhost:${PORT}/checkin`);
  if (!PUBLIC_URL) console.log(`  ⚠️  未设置 PUBLIC_URL，二维码仅同一 WiFi 可扫；跨网/微信建议用内网穿透后设置`);
  console.log(`  数据导出   :  http://localhost:${PORT}/api/export.csv\n`);
});