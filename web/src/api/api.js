const BASE = import.meta.env.DEV ? '' : '';

/** Detect reverse-proxy / gateway prefix such as /app/sshterm */
export function apiBase() {
  if (import.meta.env.DEV) return '';
  const path = (location.pathname || '/').replace(/\/+$/, '');
  const m = path.match(/^(\/app\/sshterm)(?:\/|$)/);
  return m ? m[1] : '';
}

function request(url, options = {}) {
  return fetch(BASE + apiBase() + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(async (res) => {
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const message = (data && data.message) || res.statusText || '请求失败';
      throw new Error(message);
    }
    return data;
  });
}

export function fetchProfiles() {
  return request('/api/profiles');
}

export function saveProfile(data) {
  return request('/api/profiles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteProfile(id) {
  return request(`/api/profiles/${id}`, { method: 'DELETE' });
}

export function fetchSelf() {
  return request('/api/self');
}

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.host || 'localhost:1070';
  return `${proto}://${host}${apiBase()}/ws/ssh`;
}
