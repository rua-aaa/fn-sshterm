const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');

const PORT = Number(process.env.PORT || process.env.TRIM_SERVICE_PORT || 1070);
const ROOT = path.join(__dirname, '..');
const GATEWAY_PREFIX = (process.env.GATEWAY_PREFIX || '/app/sshterm').replace(/\/+$/, '');

function resolveDataDir() {
  const candidates = [
    process.env.SSHTERM_DATA,
    process.env.TRIM_PKGVAR,
    process.env.DATA_DIR,
    path.join(ROOT, 'data'),
    path.join(__dirname, 'data'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      /* try next */
    }
  }
  return path.join(ROOT, 'data');
}

function resolveWebDist() {
  const candidates = [
    process.env.SSHTERM_WEB,
    path.join(__dirname, 'web', 'dist'),
    path.join(ROOT, 'web', 'dist'),
    path.join(__dirname, 'dist'),
    '/app/web/dist',
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return candidates.find((c) => fs.existsSync(c)) || path.join(__dirname, 'web', 'dist');
}

const DATA_DIR = resolveDataDir();
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const WEB_DIST = resolveWebDist();
const SOCKET_PATH =
  process.env.SOCKET_PATH ||
  process.env.SSHTERM_SOCKET ||
  (process.env.TRIM_APPDEST ? path.join(process.env.TRIM_APPDEST, 'app.sock') : '');

function readProfiles() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')) || [];
  } catch {
    return [];
  }
}

function writeProfiles(list) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[sshterm] write profiles failed:', e.message);
  }
}

function sendJson(res, data, status = 200) {
  res.status(status).json(data);
}

function ensureIframeHeaders(res) {
  try {
    res.removeHeader('X-Frame-Options');
  } catch {}
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
}

function probePort(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (open, error) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {}
      resolve({ host, port, open: !!open, error: error || null });
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false, 'timeout'));
    sock.once('error', (e) => finish(false, e.code || e.message));
    try {
      sock.connect(port, host);
    } catch (e) {
      finish(false, e.message);
    }
  });
}

function collectAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces || {})) {
    for (const item of ifaces[name] || []) {
      if (item && item.family === 'IPv4' && !item.internal) {
        out.push({ name, address: item.address, internal: !!item.internal });
      }
    }
  }
  return out;
}

function detectRuntime() {
  const hints = [];
  if (fs.existsSync('/.dockerenv')) {
    hints.push('/.dockerenv exists');
    return { runtime: 'docker', hints };
  }
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    if (/docker|containerd|kubepods|lxc/i.test(cgroup)) {
      hints.push('cgroup indicates container');
      return { runtime: 'docker', hints };
    }
  } catch {
    /* not linux or no cgroup */
  }
  if (process.env.SSHTERM_DATA || process.env.TRIM_PKGVAR || process.env.TRIM_APPDEST) {
    hints.push('FNOS TRIM_* env present');
  }
  if (process.platform === 'win32') {
    return { runtime: 'windows-dev', hints: ['win32'] };
  }
  return { runtime: 'native-or-unknown', hints };
}

function defaultGateway() {
  try {
    const route = fs.readFileSync('/proc/net/route', 'utf8');
    const lines = route.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts[1] === '00000000' && parts[2] && parts[2] !== '00000000') {
        const gw = parts[2];
        const b = [
          parseInt(gw.slice(6, 8), 16),
          parseInt(gw.slice(4, 6), 16),
          parseInt(gw.slice(2, 4), 16),
          parseInt(gw.slice(0, 2), 16),
        ];
        return { iface: parts[0], gateway: b.join('.') };
      }
    }
  } catch {}
  return null;
}

function parseHostsFile() {
  const extra = [];
  try {
    const text = fs.readFileSync('/etc/hosts', 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([\d.]+)\s+(.+)$/);
      if (!m) continue;
      const ip = m[1];
      const names = m[2].split(/\s+/).filter(Boolean);
      for (const n of names) {
        if (n === 'localhost' || n === 'ip6-localhost') continue;
        extra.push({ host: ip, name: n });
      }
    }
  } catch {}
  return extra;
}

function findShellBins() {
  if (process.platform === 'win32') {
    const win = [
      process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      'C:\\Windows\\System32\\cmd.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'powershell.exe',
      'cmd.exe',
    ];
    return win.filter((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
  }
  const candidates = ['/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/sh'];
  return candidates.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

function canNsenter() {
  if (process.platform === 'win32') return false;
  const bins = ['/usr/bin/nsenter', '/bin/nsenter'];
  return bins.find((p) => fs.existsSync(p)) || null;
}

async function selfHandler(_req, res) {
  const hostname = os.hostname();
  const lan = collectAddresses();
  const rt = detectRuntime();
  const gw = defaultGateway();
  const hostsExtra = parseHostsFile();
  const shells = findShellBins();
  const nsenter = canNsenter();

  const candidates = [
    { label: '本机回环 127.0.0.1', host: '127.0.0.1', port: 22 },
    { label: `主机名 ${hostname}`, host: hostname, port: 22 },
    { label: 'Docker host.docker.internal', host: 'host.docker.internal', port: 22 },
  ];
  if (gw && gw.gateway) {
    candidates.push({ label: `默认网关 ${gw.gateway}`, host: gw.gateway, port: 22 });
  }
  // docker0 common bridge gateway
  candidates.push({ label: 'Docker bridge 172.17.0.1', host: '172.17.0.1', port: 22 });
  for (const item of lan) {
    candidates.push({ label: `网卡 ${item.name}`, host: item.address, port: 22 });
  }
  for (const h of hostsExtra.slice(0, 4)) {
    candidates.push({ label: `hosts ${h.name}`, host: h.host, port: 22 });
  }

  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = `${c.host}:${c.port}`;
    if (seen.has(key) || !c.host) continue;
    seen.add(key);
    unique.push(c);
  }

  const probed = [];
  for (const c of unique.slice(0, 10)) {
    const r = await probePort(c.host, c.port, 900);
    probed.push({ ...c, open: r.open, error: r.error });
  }

  const recommended =
    probed.find((c) => c.open && c.host === '127.0.0.1') ||
    probed.find((c) => c.open && String(c.host).startsWith('192.168.')) ||
    probed.find((c) => c.open) ||
    probed.find((c) => c.host === '127.0.0.1') ||
    probed[0] || { host: '127.0.0.1', port: 22, open: false };

  sendJson(res, {
    ok: true,
    version: '1.0.4',
    hostname,
    platform: `${process.platform} ${os.arch()}`,
    node: process.version,
    runtime: rt.runtime,
    runtimeHints: rt.hints,
    inDocker: rt.runtime === 'docker',
    cwd: process.cwd(),
    dataDir: DATA_DIR,
    webDist: WEB_DIST,
    env: {
      TRIM_APPDEST: process.env.TRIM_APPDEST || null,
      TRIM_PKGVAR: process.env.TRIM_PKGVAR || null,
      TRIM_SERVICE_PORT: process.env.TRIM_SERVICE_PORT || null,
      PORT: process.env.PORT || null,
      SSHTERM_DATA: process.env.SSHTERM_DATA || null,
      networkModeHint: rt.runtime === 'docker' ? '若 network_mode=host，则 127.0.0.1 指向 NAS 宿主机' : '进程直接跑在系统上，127.0.0.1 即本机',
    },
    addresses: lan,
    gateway: gw,
    hostsExtra: hostsExtra.slice(0, 8),
    shell: {
      bins: shells,
      preferred: shells[0] || null,
      localShellAvailable: shells.length > 0,
      nsenter,
      hostShellAvailable: !!nsenter && rt.runtime === 'docker',
    },
    ssh: {
      candidates: probed,
      recommended,
      anyOpen: probed.some((c) => c.open),
    },
    advice:
      rt.runtime === 'docker'
        ? '当前在容器内运行。优先点「本机 Shell」验证服务；SSH 请用探测到的开放地址，或到 fnOS 开启 SSH 后再连 127.0.0.1/LAN IP。'
        : '当前进程不在容器内。可点「本机 Shell」或 SSH 到 127.0.0.1（需系统已开启 SSH）。',
  });
}

function indexHandler(_req, res) {
  const indexFile = path.join(WEB_DIST, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  res.status(200).type('html').send(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>sshterm</title>
<style>body{font-family:system-ui,sans-serif;background:#f1f4f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#333}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;max-width:640px}
h1{color:#2c6dee;margin:0 0 12px}code{background:#f1f4f9;padding:2px 6px;border-radius:4px}</style></head>
<body><div class="card">
<h1>sshterm 已启动（NAS 适配）</h1>
<p>端口：${PORT} · 网关：<code>${GATEWAY_PREFIX}</code></p>
<p>数据：<code>${DATA_DIR}</code></p>
<p>API：<code>/api/self</code> 可查看 Docker/网络探测结果</p>
<p>WebSocket：<code>/ws/ssh</code>（SSH / 本机 Shell）</p>
</div></body></html>`);
}

function spaHandler(req, res, next) {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  const indexFile = path.join(WEB_DIST, 'index.html');
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  next();
}

function profilesList(_req, res) {
  sendJson(res, readProfiles());
}

function profilesSave(req, res) {
  const body = req.body || {};
  const list = readProfiles();
  const now = Date.now();
  const item = {
    id: body.id || `p_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: (body.name || '未命名').trim(),
    host: (body.host || '').trim(),
    port: Number(body.port || 22),
    username: (body.username || '').trim(),
    password: body.password || '',
    privateKey: body.privateKey || '',
    passphrase: body.passphrase || '',
    auth: body.auth === 'key' ? 'key' : 'password',
    remark: body.remark || '',
    updatedAt: now,
    createdAt: body.createdAt || now,
  };
  if (!item.host || !item.username) {
    return sendJson(res, { ok: false, message: '主机与用户名不能为空' }, 400);
  }
  const idx = list.findIndex((c) => c.id === item.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...item };
  else list.unshift(item);
  writeProfiles(list);
  sendJson(res, { ok: true, data: item });
}

function profilesDelete(req, res) {
  const list = readProfiles().filter((c) => c.id !== req.params.id);
  writeProfiles(list);
  sendJson(res, { ok: true });
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  ensureIframeHeaders(res);
  next();
});

function healthHandler(_req, res) {
  const rt = detectRuntime();
  sendJson(res, {
    ok: true,
    name: 'sshterm',
    version: '1.0.4',
    time: Date.now(),
    port: PORT,
    runtime: rt.runtime,
    gatewayPrefix: GATEWAY_PREFIX,
    dataDir: DATA_DIR,
    webDist: WEB_DIST,
    webReady: fs.existsSync(path.join(WEB_DIST, 'index.html')),
    socket: SOCKET_PATH || null,
  });
}

app.get('/api/health', healthHandler);
app.get('/api/self', selfHandler);
app.get('/api/profiles', profilesList);
app.post('/api/profiles', profilesSave);
app.delete('/api/profiles/:id', profilesDelete);

const gwRouter = express.Router();
gwRouter.use(express.json({ limit: '2mb' }));
gwRouter.use((req, res, next) => {
  ensureIframeHeaders(res);
  next();
});
gwRouter.get('/api/health', healthHandler);
gwRouter.get('/api/self', selfHandler);
gwRouter.get('/api/profiles', profilesList);
gwRouter.post('/api/profiles', profilesSave);
gwRouter.delete('/api/profiles/:id', profilesDelete);
if (fs.existsSync(WEB_DIST)) {
  gwRouter.use(express.static(WEB_DIST, { index: false, cacheControl: false }));
}
gwRouter.get('/', indexHandler);
gwRouter.get('*', spaHandler);
app.use(GATEWAY_PREFIX, gwRouter);
app.use('/app/sshterm', gwRouter);

app.get('/', indexHandler);
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, cacheControl: false }));
}
app.get('*', spaHandler);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const sessions = new Map();

function send(ws, type, data) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, data }));
  } catch {
    /* ignore */
  }
}

function attachLocalShell(ws, sessionId, mode, cols, rows) {
  const shells = findShellBins();
  const bin = shells[0];
  console.log(`[sshterm] attachLocalShell mode=${mode} bin=${bin || 'NONE'} cols=${cols} rows=${rows}`);
  if (!bin) {
    send(ws, 'status', { state: 'error', message: '未找到可用 shell（bash/sh）' });
    return;
  }

  // ACK immediately so frontend never sticks on "连接中"
  send(ws, 'status', {
    state: 'connecting',
    message: `本机 Shell 启动中… bin=${bin}`,
    sessionId,
  });

  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLUMNS: String(cols || 80),
    LINES: String(rows || 24),
    HOME: process.env.HOME || process.env.TRIM_PKGHOME || process.env.SSHTERM_DATA || '/tmp',
  };

  let child = null;
  let kind = 'local';
  const entry = { child: null, ws, kind, bin };

  const spawnPlain = (command, args, options) => spawn(command, args, options);

  try {
    if (mode === 'host' && canNsenter() && process.platform !== 'win32') {
      kind = 'host';
      entry.kind = 'host';
      child = spawnPlain(canNsenter(), ['-t', '1', '-m', '-u', '-i', '-n', '-p', '--', bin, '-l'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      send(ws, 'status', {
        state: 'connecting',
        message: '尝试进入 NAS 宿主机命名空间（nsenter）…',
      });
    } else if (process.platform !== 'win32' && fs.existsSync('/usr/bin/script')) {
      kind = 'local-pty';
      entry.kind = kind;
      child = spawnPlain('/usr/bin/script', ['-qfc', `${bin} -l`, '/dev/null'], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else if (process.platform !== 'win32' && fs.existsSync('/usr/bin/python3')) {
      kind = 'local-pty';
      entry.kind = kind;
      child = spawnPlain(
        '/usr/bin/python3',
        ['-c', `import pty,sys; pty.spawn([${JSON.stringify(bin)}, "-l"])`],
        { env, stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } else {
      kind = process.platform === 'win32' ? 'local-cmd' : 'local';
      entry.kind = kind;
      const args = process.platform === 'win32' ? [] : ['-l'];
      child = spawnPlain(bin, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    }
  } catch (e) {
    send(ws, 'status', { state: 'error', message: `启动 shell 失败: ${e.message}` });
    return;
  }

  if (!child) {
    send(ws, 'status', { state: 'error', message: 'shell 进程未能创建' });
    return;
  }

  entry.child = child;
  sessions.set(sessionId, entry);

  const banner =
    kind === 'host'
      ? '\r\n\x1b[32m[sshterm]\x1b[0m host shell via nsenter (NAS 宿主机)\r\n'
      : `\r\n\x1b[32m[sshterm]\x1b[0m local shell (${kind}) runtime=${detectRuntime().runtime}\r\n`;

  child.stdout.on('data', (buf) => send(ws, 'data', buf.toString('utf8')));
  child.stderr.on('data', (buf) => send(ws, 'data', buf.toString('utf8')));
  child.on('error', (err) => {
    send(ws, 'status', { state: 'error', message: `shell 错误: ${err.message}` });
  });
  child.on('exit', (code, signal) => {
    send(ws, 'status', {
      state: 'closed',
      message: `shell 已退出 code=${code} signal=${signal || '-'}`,
    });
    if (sessions.get(sessionId) === entry) sessions.delete(sessionId);
  });

  send(ws, 'status', { state: 'connected', message: `本机 Shell (${kind}) @ ${bin}`, sessionId, mode: 'shell' });
  send(ws, 'data', banner);

  // show identity; if root, note no sudo needed
  try {
    const probe =
      process.platform === 'win32'
        ? 'echo [sshterm] user=%USERNAME%\r\n'
        : 'echo "[sshterm] uid=$(id -u) user=$(id -un) host=$(hostname)"; id\r\n';
    child.stdin.write(probe);
  } catch {}
}

function attachSsh(ws, sessionId, data) {
  const host = String(data.host || '').trim();
  const port = Number(data.port || 22);
  const username = String(data.username || '').trim();
  const password = data.password || '';
  const privateKey = data.privateKey || '';
  const passphrase = data.passphrase || '';
  const auth = data.auth === 'key' || privateKey ? 'key' : 'password';
  const cols = Number(data.cols || 80);
  const rows = Number(data.rows || 24);

  if (!host || !username) {
    send(ws, 'status', { state: 'error', message: '主机与用户名不能为空' });
    return;
  }
  if (auth === 'key' && !privateKey) {
    send(ws, 'status', { state: 'error', message: '请选择私钥认证并填写私钥内容' });
    return;
  }

  send(ws, 'status', { state: 'connecting', message: `正在 SSH 连接 ${username}@${host}:${port}` });
  const conn = new Client();
  const entry = { conn, stream: null, ws, cols, rows, kind: 'ssh' };
  sessions.set(sessionId, entry);

  conn.on('ready', () => {
    conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
      if (err) {
        send(ws, 'status', { state: 'error', message: `打开 shell 失败: ${err.message}` });
        try {
          conn.end();
        } catch {}
        sessions.delete(sessionId);
        return;
      }
      entry.stream = stream;
      send(ws, 'status', { state: 'connected', message: `已连接 ${username}@${host}`, sessionId, mode: 'ssh' });
      send(ws, 'data', `\r\n\x1b[32m[sshterm]\x1b[0m SSH connected ${username}@${host}:${port}\r\n`);
      stream.on('data', (chunk) => send(ws, 'data', chunk.toString('utf8')));
      stream.stderr.on('data', (chunk) => send(ws, 'data', chunk.toString('utf8')));
      stream.on('close', () => {
        send(ws, 'status', { state: 'closed', message: '远程 shell 已退出' });
        try {
          conn.end();
        } catch {}
        if (sessions.get(sessionId) === entry) sessions.delete(sessionId);
      });
    });
  });
  conn.on('error', (err) => {
    const rt = detectRuntime().runtime;
    let msg = err.message || 'SSH 连接失败';
    if (/ECONNREFUSED|refused/i.test(msg)) {
      msg += ` | 目标 ${host}:${port} 拒绝连接。runtime=${rt}。若这是 NAS，请确认 SSH 已开启，并尝试网关/LAN IP；也可先用「本机 Shell」验证服务。`;
    }
    send(ws, 'status', { state: 'error', message: msg });
    try {
      conn.end();
    } catch {}
    if (sessions.get(sessionId) === entry) sessions.delete(sessionId);
  });
  conn.on('close', () => {
    if (sessions.get(sessionId) === entry) {
      send(ws, 'status', { state: 'closed', message: 'SSH 连接已关闭' });
      sessions.delete(sessionId);
    }
  });
  conn.on('keyboard-interactive', (n, i, l, prompts, finish) => {
    finish(password ? prompts.map(() => password) : []);
  });

  const connectCfg = { host, port, username, keepaliveInterval: 15000, readyTimeout: 20000 };
  if (auth === 'key') {
    connectCfg.privateKey = privateKey;
    if (passphrase) connectCfg.passphrase = passphrase;
  } else {
    connectCfg.password = password;
  }
  try {
    conn.connect(connectCfg);
  } catch (e) {
    send(ws, 'status', { state: 'error', message: e.message || 'SSH 连接失败' });
    sessions.delete(sessionId);
  }
}

function handleSocket(ws) {
  let sessionId = null;

  const cleanup = (message) => {
    const s = sessionId ? sessions.get(sessionId) : null;
    if (s) {
      try {
        if (s.stream) s.stream.end();
      } catch {}
      try {
        if (s.conn) s.conn.end();
      } catch {}
      try {
        if (s.child) s.child.kill('SIGTERM');
      } catch {}
      sessions.delete(sessionId);
    }
    if (message != null) {
      send(ws, 'status', { state: 'closed', message: message || '会话已关闭' });
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const type = msg.type;
    const data = msg.data || {};

    if (type === 'connect') {
      console.log(`[sshterm] ws connect type=${data.mode || data.host || 'ssh'} sid=${data.sessionId || '-'}`);
      if (sessionId && sessions.has(sessionId)) cleanup('重新连接中');
      else if (sessionId) cleanup(null);
      sessionId = data.sessionId || `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const mode = data.mode || (data.host === 'local' || data.host === 'shell' ? 'local' : 'ssh');
      if (mode === 'local' || mode === 'shell' || mode === 'host') {
        attachLocalShell(ws, sessionId, mode, data.cols, data.rows);
      } else {
        attachSsh(ws, sessionId, data);
      }
      return;
    }

    if (type === 'data') {
      const s = sessions.get(sessionId);
      if (!s) return;
      const payload = typeof data === 'string' ? data : String(data);
      if (s.stream) s.stream.write(payload);
      else if (s.child && s.child.stdin) s.child.stdin.write(payload);
      return;
    }

    if (type === 'resize') {
      const s = sessions.get(sessionId);
      const cols = Number(data.cols || 80);
      const rows = Number(data.rows || 24);
      if (!s) return;
      s.cols = cols;
      s.rows = rows;
      if (s.stream) {
        try {
          s.stream.setWindow(rows, cols, 0, 0);
        } catch {}
      }
      if (s.child && s.child.stdin) {
        try {
          s.child.stdin.write(`export COLUMNS=${cols} LINES=${rows}\n`);
        } catch {}
      }
      return;
    }

    if (type === 'disconnect') {
      cleanup('已断开连接');
      sessionId = null;
    }
  });

  ws.on('close', () => cleanup('页面断开，会话结束'));
  ws.on('error', () => cleanup('WebSocket 异常'));
}

const WS_PATHS = new Set(['/ws/ssh', `${GATEWAY_PREFIX}/ws/ssh`, '/app/sshterm/ws/ssh']);

function upgradeHandler(req, socket, head) {
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    pathname = req.url || '/';
  }
  console.log(`[sshterm] ws upgrade ${pathname}`);
  if (!WS_PATHS.has(pathname)) {
    console.log(`[sshterm] ws upgrade rejected path=${pathname}`);
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => handleSocket(ws));
}

server.on('upgrade', upgradeHandler);

function startListen() {
  const rt = detectRuntime();
  const onReady = (where) => {
    console.log(`[sshterm] listening ${where}`);
    console.log(`[sshterm] runtime=${rt.runtime} node=${process.version} platform=${process.platform}`);
    console.log(`[sshterm] port=${PORT} gateway=${GATEWAY_PREFIX}`);
    console.log(`[sshterm] data=${DATA_DIR}`);
    console.log(`[sshterm] web=${WEB_DIST}`);
    if (SOCKET_PATH) console.log(`[sshterm] socket=${SOCKET_PATH}`);
  };

  server.once('error', (err) => {
    console.error('[sshterm] listen error:', err.message);
    if (!SOCKET_PATH) process.exit(1);
  });
  server.listen(PORT, '0.0.0.0', () => onReady(`tcp://0.0.0.0:${PORT}`));
}

function startUnixSecondary() {
  if (!SOCKET_PATH) return;
  try {
    fs.mkdirSync(path.dirname(SOCKET_PATH), { recursive: true });
    fs.rmSync(SOCKET_PATH, { force: true });
  } catch {}
  const unixServer = http.createServer(app);
  unixServer.on('upgrade', upgradeHandler);
  unixServer.once('error', (err) => console.error('[sshterm] unix listen error:', err.message));
  unixServer.listen(SOCKET_PATH, () => {
    try {
      fs.chmodSync(SOCKET_PATH, 0o666);
    } catch {}
    console.log(`[sshterm] also listening unix ${SOCKET_PATH}`);
  });
}

startListen();
startUnixSecondary();

process.on('uncaughtException', (err) => console.error('[sshterm] uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('[sshterm] unhandledRejection:', err));
