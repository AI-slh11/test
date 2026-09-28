// Client for the hidden admin API (/api/control/*). Token lives in sessionStorage only,
// so closing the tab signs the admin out.
const BASE = import.meta.env.VITE_API_BASE || '/api';
export const ADMIN_PATH = import.meta.env.VITE_ADMIN_PATH || '/control-room';
const KEY = 'festival_admin_token';

export const getToken = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setToken = (t) => { try { sessionStorage.setItem(KEY, t); } catch {} };
export const clearToken = () => { try { sessionStorage.removeItem(KEY); } catch {} };

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}/control${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...options
  });
  let data;
  try { data = await res.json(); }
  catch { const e = new Error("Can't reach the festival server (got an unexpected response). Check VITE_API_BASE."); e.status = res.status; throw e; }
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}
const send = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const adminApi = {
  login: (code, password) => request('/login', send('POST', { code, password })),
  session: () => request('/session'),
  logout: () => request('/logout', send('POST', {})),
  changePassword: (current, next) => request('/password', send('POST', { current, next })),

  stats: () => request('/admin/stats'),

  listPrograms: () => request('/programs'),
  createProgram: (p) => request('/programs', send('POST', p)),
  updateProgram: (id, p) => request(`/programs/${id}`, send('PATCH', p)),
  deleteProgram: (id) => request(`/programs/${id}`, send('DELETE')),
  assignJudge: (pid, jid) => request(`/programs/${pid}/judges`, send('POST', { judge_id: jid })),
  unassignJudge: (pid, jid) => request(`/programs/${pid}/judges/${jid}`, send('DELETE')),
  setPublished: (pid, published) => request(`/programs/${pid}/published`, send('PATCH', { published })),

  listJudges: () => request('/auth/judges'),
  createJudge: (j) => request('/auth/judges', send('POST', j)),
  updateJudge: (id, j) => request(`/auth/judges/${id}`, send('PATCH', j)),
  deleteJudge: (id) => request(`/auth/judges/${id}`, send('DELETE')),

  listRegistrations: (pid) => request(`/registrations${pid ? `?program_id=${pid}` : ''}`),
  updateRegistration: (id, r) => request(`/registrations/${id}`, send('PATCH', r)),
  deleteRegistration: (id) => request(`/registrations/${id}`, send('DELETE'))
};
