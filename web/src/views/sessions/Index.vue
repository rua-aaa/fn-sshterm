<template>
  <div class="sessions h-100 flex flex-nowrap">
    <!-- hosts side: collapsible -->
    <aside class="side panel" :class="{ collapsed: sideCollapsed }">
      <div class="side-head flex flex-nowrap">
        <el-button size="small" text @click="sideCollapsed = !sideCollapsed" :title="sideCollapsed ? '展开' : '收起'">
          <el-icon><Expand v-if="sideCollapsed" /><Fold v-else /></el-icon>
        </el-button>
        <template v-if="!sideCollapsed">
          <span class="title">主机</span>
          <span class="flex-1"></span>
          <el-button size="small" text type="primary" @click="loadProfiles" title="刷新">
            <el-icon><Refresh /></el-icon>
          </el-button>
          <el-button size="small" type="success" round @click="connectLocalShell">本机</el-button>
          <el-button size="small" type="primary" round @click="openQuick">快速</el-button>
        </template>
        <template v-else>
          <el-button size="small" type="success" text @click="connectLocalShell" title="本机 Shell">
            <el-icon><Monitor /></el-icon>
          </el-button>
          <el-button size="small" type="primary" text @click="openQuick" title="快速连接">
            <el-icon><Connection /></el-icon>
          </el-button>
        </template>
      </div>

      <div v-if="!sideCollapsed" class="side-body scrollbar">
        <div class="local-card" @click="connectLocalShell">
          <div class="local-title">本机 Shell</div>
          <div class="local-meta mono">{{ selfMeta }}</div>
          <div class="local-hint" :class="{ warn: selfInfo && selfInfo.ssh && selfInfo.ssh.anyOpen === false }">
            {{ selfHint }}
          </div>
          <div v-if="selfInfo" class="local-env">
            {{ selfInfo.runtime || '?' }} · Node {{ selfInfo.node || '?' }}
          </div>
        </div>
        <div
          v-for="item in profiles"
          :key="item.id"
          class="profile-item"
          :class="{ active: activeProfileId === item.id }"
          @click="selectProfile(item)"
          @dblclick="connectFromProfile(item)"
        >
          <div class="name ellipsis">{{ item.name }}</div>
          <div class="meta ellipsis mono">{{ item.username }}@{{ item.host }}:{{ item.port }}</div>
        </div>
        <el-empty v-if="!profiles.length" description="暂无配置" :image-size="56" />
      </div>
    </aside>

    <!-- terminals -->
    <section class="main flex-1 flex flex-column flex-nowrap">
      <div class="tabs-bar flex flex-nowrap">
        <el-tabs v-model="activeTab" type="card" class="session-tabs flex-1" @tab-remove="closeSession">
          <el-tab-pane
            v-for="s in sessions"
            :key="s.id"
            :name="s.id"
            :closable="sessions.length > 1"
          >
            <template #label>
              <span class="tab-label">
                <i class="dot" :class="s.status"></i>
                {{ s.title }}
              </span>
            </template>
          </el-tab-pane>
        </el-tabs>
        <el-button class="mgl-1" size="small" type="primary" round @click="openQuick">新建会话</el-button>
      </div>

      <div class="term-area flex-1 relative panel">
        <div
          v-for="s in sessions"
          v-show="s.id === activeTab"
          :key="s.id"
          class="term-wrap absolute-fill"
        >
          <div class="term-toolbar flex flex-nowrap">
            <span class="status" :class="s.status">{{ statusText(s) }}</span>
            <span class="flex-1"></span>
            <el-button size="small" text @click="clearTerm(s)">清屏</el-button>
            <el-button size="small" text @click="fitTerm(s)">适配</el-button>
            <el-button size="small" text type="danger" @click="disconnect(s)">断开</el-button>
            <el-button size="small" text type="primary" @click="reconnect(s)">重连</el-button>
          </div>
          <div class="term-body absolute-fill" style="top: 3.6rem">
            <Xterm
              :ref="(el) => setTermRef(s.id, el)"
              :dark="isDark"
              @ready="(api) => onTermReady(s, api)"
              @data="(d) => onTermData(s, d)"
              @resize="(size) => onTermResize(s, size)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- quick connect dialog -->
    <el-dialog v-model="quickShow" title="SSH 连接" width="520px" destroy-on-close>
      <el-form :model="quick" label-width="8rem">
        <el-form-item label="名称">
          <el-input v-model="quick.name" placeholder="例如：NAS / 云主机" />
        </el-form-item>
        <el-form-item label="主机">
          <el-input v-model="quick.host" placeholder="IP 或域名" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="quick.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="quick.username" placeholder="root" />
        </el-form-item>
        <el-form-item label="认证方式">
          <el-radio-group v-model="quick.auth">
            <el-radio value="password">密码</el-radio>
            <el-radio value="key">私钥</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="quick.auth === 'password'" label="密码">
          <el-input v-model="quick.password" type="password" show-password @keyup.enter="doQuickConnect" />
        </el-form-item>
        <template v-else>
          <el-form-item label="私钥">
            <el-input
              v-model="quick.privateKey"
              type="textarea"
              :rows="6"
              placeholder="粘贴 OpenSSH 私钥内容（-----BEGIN ...）"
            />
            <el-upload
              class="mgt-1"
              :auto-upload="false"
              :show-file-list="false"
              :on-change="onKeyFile"
              accept=".pem,.key,id_rsa,id_ed25519,*"
            >
              <el-button size="small">选择私钥文件</el-button>
            </el-upload>
          </el-form-item>
          <el-form-item label="密钥口令">
            <el-input v-model="quick.passphrase" type="password" show-password placeholder="无私钥口令可留空" />
          </el-form-item>
        </template>
        <el-form-item label="保存配置">
          <el-switch v-model="quick.save" />
        </el-form-item>
        <el-alert
          v-if="localAlert"
          type="warning"
          :closable="false"
          show-icon
          :title="localAlert"
          class="mgt-1"
        />
      </el-form>
      <template #footer>
        <el-button @click="quickShow = false">取消</el-button>
        <el-button type="success" plain @click="connectLocalShell">本机 Shell</el-button>
        <el-button type="primary" :loading="connecting" @click="doQuickConnect">连接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, Expand, Fold, Monitor, Connection } from '@element-plus/icons-vue';
import Xterm from '@/components/Xterm.vue';
import { deleteProfile, fetchProfiles, fetchSelf, saveProfile, wsUrl, apiBase } from '@/api/api';

const profiles = ref([]);
const sessions = ref([]);
const activeTab = ref('');
const activeProfileId = ref('');
const quickShow = ref(false);
const connecting = ref(false);
const termRefs = new Map();
const selfInfo = ref(null);
const sideCollapsed = ref(localStorage.getItem('sshterm-side') === '1');

watch(sideCollapsed, (v) => {
  localStorage.setItem('sshterm-side', v ? '1' : '0');
});

const isDark = ref(document.documentElement.classList.contains('dark'));

const selfMeta = computed(() => {
  if (!selfInfo.value) return '检测中…';
  const rt = selfInfo.value.runtime || '?';
  const rec = selfInfo.value.ssh?.recommended;
  const addrs = (selfInfo.value.addresses || []).map((a) => a.address).join(', ');
  return `${rt} · ${rec?.host || '127.0.0.1'}:${rec?.port || 22}${addrs ? ' · ' + addrs : ''}`;
});

const selfHint = computed(() => {
  const s = selfInfo.value;
  if (!s) return '正在检测 NAS 运行环境…';
  const ssh = s.ssh;
  if (s.runtime === 'docker') {
    return ssh?.anyOpen
      ? '容器内运行；可点本机 Shell，或用已探测到的 SSH 地址'
      : '容器内运行；SSH 22 可能不通 — 请优先点「本机 Shell」验证服务';
  }
  if (ssh?.anyOpen) return '检测到 SSH 可连；也可直接用本机 Shell';
  return '本机 22 未监听 — 优先点「本机 Shell」；SSH 需在 fnOS 开启';
});

const localAlert = computed(() => {
  const s = selfInfo.value;
  if (!s) return '';
  if (s.runtime === 'docker' && !(s.ssh?.anyOpen)) {
    return `当前 runtime=docker。127.0.0.1 在非 host 网络下可能不是 NAS。建议点「本机 Shell」；SSH 请试 ${ (s.addresses||[]).map(a=>a.address).join('/') || '网关/LAN IP' }，并在 fnOS 开启 SSH。`;
  }
  if (s.ssh && s.ssh.anyOpen === false) {
    return 'NAS 本机 SSH（22）当前未开放。可点「本机 Shell」，或到系统设置启用 SSH 后再连。';
  }
  return '';
});

/** 推荐：本机 Shell，不依赖 SSH/密码 */
const connectLocalShell = async () => {
  await loadSelf();
  const mode = selfInfo.value?.runtime === 'docker' && selfInfo.value?.shell?.hostShellAvailable ? 'host' : 'local';
  const session = createSession({
    name: mode === 'host' ? 'NAS Shell' : '本机 Shell',
    host: 'local',
    port: 0,
    username: 'local',
    mode,
  });
  await new Promise((r) => setTimeout(r, 120));
  try {
    const h = await fetch((apiBase() || '') + '/api/health').then((r) => r.json());
    safeWrite(
      session,
      `\x1b[36m[sshterm]\x1b[0m health ok version=${h.version} runtime=${h.runtime} port=${h.port}\r\n`
    );
  } catch (e) {
    safeWrite(session, `\x1b[33m[sshterm]\x1b[0m health probe failed: ${e.message}\r\n`);
  }
  openSocket(session);
};

/** SSH 到探测到的本机地址 */
const connectLocal = async () => {
  await loadSelf();
  const rec = selfInfo.value?.ssh?.recommended || { host: '127.0.0.1', port: 22, open: false };
  const hostname = selfInfo.value?.hostname || 'NAS';
  const lan = (selfInfo.value?.addresses || []).map((a) => a.address).find(Boolean) || '';
  const openCandidates = (selfInfo.value?.ssh?.candidates || []).filter((c) => c.open);
  const best = openCandidates[0] || rec;
  const existing =
    profiles.value.find((p) => p.remark === 'local') ||
    profiles.value.find((p) => p.host === best.host) ||
    profiles.value.find((p) => p.host === '127.0.0.1');

  openQuick({
    id: existing?.id || '',
    name: existing?.name || `SSH 本机 ${hostname}`,
    host: best.host || existing?.host || '127.0.0.1',
    port: best.port || existing?.port || 22,
    username: existing?.username || 'root',
    password: existing?.password || '',
    privateKey: existing?.privateKey || '',
    passphrase: existing?.passphrase || '',
    auth: existing?.auth || 'password',
    remark: 'local',
    save: true,
  });

  if (!(selfInfo.value?.ssh?.anyOpen)) {
    ElMessage.warning(
      lan
        ? `未探测到开放的 SSH。runtime=${selfInfo.value?.runtime}。可先点「本机 Shell」，或开启 SSH 后试 ${lan}:22`
        : `未探测到开放的 SSH。请点「本机 Shell」验证服务，或在 fnOS 开启 SSH`
    );
  }
};

const blankProfile = () => ({
  id: '',
  name: '',
  host: '',
  port: 22,
  username: 'root',
  password: '',
  privateKey: '',
  passphrase: '',
  auth: 'password',
  remark: '',
  save: true,
});

const quick = reactive(blankProfile());

const statusText = (s) =>
  ({
    idle: '未连接',
    connecting: '连接中…',
    connected: '已连接',
    error: s.message || '连接失败',
    closed: s.message || '已断开',
  }[s.status] || s.status);

const setTermRef = (id, el) => {
  if (el) termRefs.set(id, el);
  else termRefs.delete(id);
};

const loadProfiles = async () => {
  try {
    profiles.value = (await fetchProfiles()) || [];
  } catch (e) {
    ElMessage.error(e.message || '加载配置失败');
  }
};

const loadSelf = async () => {
  try {
    selfInfo.value = await fetchSelf();
  } catch {
    selfInfo.value = null;
  }
};

const ensureLocalProfile = async () => {
  const rec = selfInfo.value?.ssh?.recommended || { host: '127.0.0.1', port: 22 };
  const hostname = selfInfo.value?.hostname || 'NAS';
  const exists = profiles.value.some(
    (p) => p.host === rec.host || p.host === '127.0.0.1' || p.remark === 'local'
  );
  if (exists) return;
  try {
    await saveProfile({
      name: `本机 ${hostname}`,
      host: rec.host || '127.0.0.1',
      port: rec.port || 22,
      username: 'root',
      password: '',
      auth: 'password',
      remark: 'local',
    });
    await loadProfiles();
  } catch {
    /* ignore */
  }
};

const openQuick = (preset) => {
  Object.assign(quick, blankProfile(), typeof preset === 'object' ? preset : {});
  quickShow.value = true;
};

const selectProfile = (item) => {
  activeProfileId.value = item.id;
  openQuick({
    id: item.id,
    name: item.name,
    host: item.host,
    port: item.port,
    username: item.username,
    password: item.password,
    privateKey: item.privateKey,
    passphrase: item.passphrase,
    auth: item.auth || 'password',
    remark: item.remark,
    save: true,
  });
};

const connectFromProfile = (item) => {
  selectProfile(item);
  doQuickConnect();
};

const onKeyFile = async (file) => {
  const raw = file.raw;
  if (!raw) return;
  const text = await raw.text();
  quick.privateKey = text;
  quick.auth = 'key';
  ElMessage.success('已载入私钥内容');
};

const createSession = (cfg) => {
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const title = cfg.name || `${cfg.username}@${cfg.host}`;
  const session = reactive({
    id,
    title,
    status: 'idle',
    message: '',
    cfg: { ...cfg },
    ws: null,
    termApi: null,
  });
  sessions.value.push(session);
  activeTab.value = id;
  return session;
};

const ensureSessionForConnect = () => {
  // reuse current idle/closed session if empty list, else new
  if (!sessions.value.length) return createSession(quick);
  const cur = sessions.value.find((s) => s.id === activeTab.value);
  if (cur && (cur.status === 'idle' || cur.status === 'closed' || cur.status === 'error')) {
    cur.cfg = { ...quick };
    cur.title = quick.name || `${quick.username}@${quick.host}`;
    return cur;
  }
  return createSession(quick);
};

const safeWrite = (session, text) => {
  try {
    const t = session?.termApi;
    if (t && typeof t.write === 'function') t.write(text);
  } catch (e) {
    console.warn('[sshterm] term write failed', e);
  }
};

const openSocket = (session) => {
  if (session.ws) {
    try {
      session.ws.close();
    } catch {}
    session.ws = null;
  }
  if (session._wsTimer) {
    clearTimeout(session._wsTimer);
    session._wsTimer = null;
  }

  session.status = 'connecting';
  const mode = session.cfg.mode || (session.cfg.host === 'local' || session.cfg.host === 'shell' ? 'local' : 'ssh');
  session.message =
    mode === 'ssh'
      ? `正在连接 ${session.cfg.username}@${session.cfg.host}`
      : mode === 'host'
        ? '正在启动 NAS Shell…'
        : '正在启动本机 Shell…';

  const url = wsUrl();
  safeWrite(session, `\r\n\x1b[36m[sshterm]\x1b[0m WS ${url} mode=${mode}\r\n`);

  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    session.status = 'error';
    session.message = `WebSocket 创建失败: ${e.message}`;
    safeWrite(session, `\r\n\x1b[31m[sshterm]\x1b[0m ${session.message}\r\n`);
    return;
  }
  session.ws = ws;

  const fail = (msg) => {
    session.status = 'error';
    session.message = msg;
    safeWrite(session, `\r\n\x1b[31m[sshterm]\x1b[0m ${msg}\r\n`);
    safeWrite(
      session,
      `\x1b[33m提示\x1b[0m: 请用 Chrome 打开 http://NAS-IP:1070/ （端口直连）。网关/iframe 可能不转发 WebSocket。\r\n`
    );
    ElMessage.error(msg);
  };

  session._wsTimer = setTimeout(() => {
    if (session.status === 'connecting') {
      fail(`WebSocket 超时（${url}）。请改用 :1070 直连后重试。`);
      try {
        ws.close();
      } catch {}
    }
  }, 6000);

  const sendConnect = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const api = session.termApi;
    const size = api && typeof api.getSize === 'function' ? api.getSize() : { cols: 80, rows: 24 };
    ws.send(
      JSON.stringify({
        type: 'connect',
        data: {
          sessionId: session.id,
          mode,
          host: session.cfg.host,
          port: session.cfg.port,
          username: session.cfg.username,
          password: session.cfg.password,
          privateKey: session.cfg.privateKey,
          passphrase: session.cfg.passphrase,
          auth: session.cfg.auth,
          cols: size.cols,
          rows: size.rows,
        },
      })
    );
    safeWrite(session, `\x1b[36m[sshterm]\x1b[0m connect sent mode=${mode} ${size.cols}x${size.rows}\r\n`);
  };

  ws.onopen = () => {
    safeWrite(session, `\x1b[32m[sshterm]\x1b[0m WebSocket 已打开\r\n`);
    sendConnect();
  };

  ws.onmessage = (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }
    if (session._wsTimer && msg.type === 'status' && msg.data?.state === 'connected') {
      clearTimeout(session._wsTimer);
      session._wsTimer = null;
    }
    if (msg.type === 'status') {
      session.status = msg.data.state;
      session.message = msg.data.message || '';
      if (msg.data.state === 'connected') {
        safeWrite(session, `\x1b[32m[sshterm]\x1b[0m ${msg.data.message || '已连接'}\r\n`);
      }
      if (msg.data.state === 'error') {
        let hint = msg.data.message || '';
        if (/ECONNREFUSED|refused|timeout|Timed out/i.test(hint)) {
          hint += ' | 目标不可达：检查 SSH 是否开启/端口/防火墙。';
        }
        if (/Authentication|auth|password|All configured/i.test(hint)) {
          hint += ' | 认证失败：检查用户名/密码。';
        }
        safeWrite(session, `\r\n\x1b[31m[sshterm]\x1b[0m ${hint}\r\n`);
        ElMessage.error(msg.data.message || '连接失败');
      }
      return;
    }
    if (msg.type === 'data') {
      safeWrite(session, msg.data);
    }
  };

  ws.onerror = () => {
    fail(`WebSocket 错误：${url}`);
  };

  ws.onclose = () => {
    if (session._wsTimer) {
      clearTimeout(session._wsTimer);
      session._wsTimer = null;
    }
    if (session.ws === ws) {
      session.ws = null;
      if (session.status === 'connecting') {
        fail(`WebSocket 在连接完成前被关闭：${url}`);
      } else if (session.status === 'connected') {
        session.status = 'closed';
        session.message = session.message || '连接已关闭';
      }
    }
  };
};

const doQuickConnect = async () => {
  if (!quick.host || !quick.username) {
    ElMessage.warning('请填写主机与用户名');
    return;
  }
  if (quick.auth === 'password' && !quick.password) {
    ElMessage.warning('请填写密码，或改用私钥认证');
    return;
  }
  if (quick.auth === 'key' && !quick.privateKey) {
    ElMessage.warning('请填写或选择私钥');
    return;
  }

  connecting.value = true;
  try {
    if (quick.save) {
      await saveProfile({
        id: quick.id || undefined,
        name: quick.name || `${quick.username}@${quick.host}`,
        host: quick.host,
        port: quick.port,
        username: quick.username,
        password: quick.password,
        privateKey: quick.privateKey,
        passphrase: quick.passphrase,
        auth: quick.auth,
        remark: quick.remark,
      });
      await loadProfiles();
    }
    const session = ensureSessionForConnect();
    openSocket(session);
    quickShow.value = false;
  } catch (e) {
    ElMessage.error(e.message || '连接失败');
  } finally {
    connecting.value = false;
  }
};

const onTermReady = (session, api) => {
  session.termApi = api;
  // if connect raced ahead of xterm mount, re-send connect once socket is open
  if (session.ws && session.ws.readyState === WebSocket.OPEN && session.status === 'connecting') {
    const mode = session.cfg.mode || (session.cfg.host === 'local' ? 'local' : 'ssh');
    const size = api.getSize();
    session.ws.send(
      JSON.stringify({
        type: 'connect',
        data: {
          sessionId: session.id,
          mode,
          host: session.cfg.host,
          port: session.cfg.port,
          username: session.cfg.username,
          password: session.cfg.password,
          privateKey: session.cfg.privateKey,
          passphrase: session.cfg.passphrase,
          auth: session.cfg.auth,
          cols: size.cols,
          rows: size.rows,
        },
      })
    );
  }
};

const onTermData = (session, data) => {
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'data', data }));
  }
};

const onTermResize = (session, size) => {
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type: 'resize', data: size }));
  }
};

const clearTerm = (s) => {
  try {
    if (s.termApi && typeof s.termApi.clear === 'function') s.termApi.clear();
  } catch {}
};
const fitTerm = (s) => {
  try {
    if (s.termApi && typeof s.termApi.fit === 'function') s.termApi.fit();
  } catch {}
};

const disconnect = (s) => {
  if (s.ws && s.ws.readyState === WebSocket.OPEN) {
    s.ws.send(JSON.stringify({ type: 'disconnect' }));
  }
  try {
    s.ws && s.ws.close();
  } catch {}
  s.ws = null;
  s.status = 'closed';
  s.message = '已手动断开';
};

const reconnect = (s) => {
  if (!s.cfg || !s.cfg.host) return;
  safeWrite(s, `\x1b[36m[sshterm]\x1b[0m reconnect ${s.cfg.username || ''}@${s.cfg.host}...\r\n`);
  openSocket(s);
};

const closeSession = (id) => {
  const idx = sessions.value.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const s = sessions.value[idx];
  disconnect(s);
  sessions.value.splice(idx, 1);
  if (activeTab.value === id) {
    activeTab.value = sessions.value[Math.max(0, idx - 1)]?.id || '';
  }
};

const onThemeDom = () => {
  isDark.value = document.documentElement.classList.contains('dark');
};

onMounted(async () => {
  await loadSelf();
  await loadProfiles();
  await ensureLocalProfile();
  if (!sessions.value.length) {
    const s = createSession({ ...blankProfile(), name: '新会话', host: '', username: '' });
    s.status = 'idle';
  }
  const obs = new MutationObserver(onThemeDom);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.__sshtermThemeObs = obs;
});

onBeforeUnmount(() => {
  sessions.value.forEach((s) => disconnect(s));
  if (window.__sshtermThemeObs) window.__sshtermThemeObs.disconnect();
});
</script>

<style scoped>
.sessions {
  height: 100%;
  gap: 0.8rem;
}
.side {
  width: 22rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  border-radius: var(--radius-xl);
}
.side.collapsed {
  width: 5.2rem;
}
.side-head {
  padding: 0.6rem 0.7rem;
  border-bottom: 1px solid var(--main-border-color);
  align-items: center;
  gap: 0.3rem;
  min-height: 4rem;
}
.side-head .title {
  font-size: 1.3rem;
  font-weight: 600;
}
.side-body {
  flex: 1;
  min-height: 0;
  padding: 0.6rem;
}
.local-card {
  border: 1px solid rgba(44, 110, 238, 0.35);
  background: rgba(44, 110, 238, 0.08);
  border-radius: var(--radius-lg);
  padding: 0.85rem 0.95rem;
  margin-bottom: 0.6rem;
  cursor: pointer;
}
.local-card:hover {
  border-color: #2c6dee;
  background: rgba(44, 110, 238, 0.14);
}
.local-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #2c6dee;
}
html.dark .local-title {
  color: #6ea0ff;
}
.local-meta {
  font-size: 1.05rem;
  color: var(--text-sub);
  margin-top: 0.2rem;
  word-break: break-all;
}
.local-hint {
  font-size: 1.05rem;
  margin-top: 0.3rem;
  color: var(--text-sub);
}
.local-hint.warn {
  color: #e6a23c;
}
.local-env {
  font-size: 1.05rem;
  margin-top: 0.3rem;
  color: var(--text-sub);
}
.profile-item {
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  margin-bottom: 0.4rem;
  border: 1px solid transparent;
}
.profile-item .name {
  font-size: 1.25rem;
  font-weight: 500;
}
.profile-item .meta {
  font-size: 1.05rem;
  color: var(--text-sub);
  margin-top: 0.15rem;
}
.profile-item:hover {
  background: rgba(44, 110, 238, 0.06);
}
.profile-item.active {
  background: rgba(44, 110, 238, 0.1);
  border-color: rgba(44, 110, 238, 0.35);
}
.main {
  min-width: 0;
  flex-direction: column;
}
.tabs-bar {
  align-items: center;
  margin-bottom: 0.6rem;
}
.session-tabs {
  min-width: 0;
}
.session-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: #909399;
  display: inline-block;
}
.dot.connected { background: #67c23a; }
.dot.connecting { background: #e6a23c; }
.dot.error { background: #f56c6c; }
.term-area {
  min-height: 0;
  overflow: hidden;
  background: #0f1216;
  border-radius: var(--radius-xl);
}
html.dark .term-area {
  background: #0b0d10;
}
.term-wrap {
  background: #0f1216;
  border-radius: var(--radius-xl);
  overflow: hidden;
}
html.dark .term-wrap {
  background: #0b0d10;
}
.term-toolbar {
  height: 3.6rem;
  align-items: center;
  padding: 0 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
}
.term-toolbar .status {
  font-size: 1.2rem;
  color: #9ca3af;
}
.term-toolbar .status.connected { color: #4ade80; }
.term-toolbar .status.error { color: #f87171; }
.term-toolbar .status.connecting { color: #fbbf24; }
.term-body {
  padding-top: 0.2rem;
}
</style>
