// Keep deployed builds functional even when the hosting dashboard has no
// VITE_API_BASE setting. Explicit environment configuration still takes priority.
const BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? '/api' : 'https://test-t24x.onrender.com/api');
const TOKEN_KEY = 'festival_auth_token';
let sessionExpiredNotified = false;

export const getAuthToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const setAuthToken = (token) => { sessionExpiredNotified = false; try { localStorage.setItem(TOKEN_KEY, token); } catch {} };
export const clearAuthToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

async function request(path, options = {}) {
  if (!BASE) throw new Error('Set VITE_API_BASE to the deployed backend URL before building this frontend.');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(options.headers || {})
    }
  });
  let data;
  try { data = await res.json(); }
  catch { throw new Error("Can't reach the festival server (got an unexpected response). Check VITE_API_BASE."); }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      clearAuthToken();
      try { localStorage.removeItem('festival_user'); } catch {}
      if (!sessionExpiredNotified) {
        sessionExpiredNotified = true;
        window.dispatchEvent(new Event('festival:session-expired'));
      }
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  login: (code, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ code, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (current, next) => request('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  listJudges: () => request('/auth/judges'),
  createJudge: (payload) => request('/auth/judges', { method: 'POST', body: JSON.stringify(payload) }),

  listPrograms: () => request('/programs'),
  programsForJudge: (judgeId) => request(`/programs/for-judge/${judgeId}`),
  createProgram: (payload) => request('/programs', { method: 'POST', body: JSON.stringify(payload) }),
  assignJudge: (programId, judgeId) => request(`/programs/${programId}/judges`, { method: 'POST', body: JSON.stringify({ judge_id: judgeId }) }),
  unassignJudge: (programId, judgeId) => request(`/programs/${programId}/judges/${judgeId}`, { method: 'DELETE' }),

  register: (payload) => request('/registrations', { method: 'POST', body: JSON.stringify(payload) }),
  listRegistrations: (programId) => request(`/registrations${programId ? `?program_id=${programId}` : ''}`),
  judgeView: (programId) => request(`/registrations/judge-view?program_id=${programId}`),
  setStatus: (id, status) => request(`/registrations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  submitScore: (payload) => request('/scores', { method: 'POST', body: JSON.stringify(payload) }),
  updateScore: (id, payload) => request(`/scores/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  scoresByJudge: (judgeId) => request(`/scores/by-judge/${judgeId}`),

  adminStats: () => request('/admin/stats'),
  updateProgram: (id, payload) => request(`/programs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteProgram: (id) => request(`/programs/${id}`, { method: 'DELETE' }),
  updateJudge: (id, payload) => request(`/auth/judges/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteJudge: (id) => request(`/auth/judges/${id}`, { method: 'DELETE' }),
  updateRegistration: (id, payload) => request(`/registrations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteRegistration: (id) => request(`/registrations/${id}`, { method: 'DELETE' }),

  publicFeed: () => request('/results/public/feed'),
  studentRegistrations: (studentId) => request('/results/student-lookup', {
    method: 'POST', body: JSON.stringify({ student_id: studentId.trim().toUpperCase() })
  }),
  setPublished: (programId, published) => request(`/programs/${programId}/published`, { method: 'PATCH', body: JSON.stringify({ published }) }),

  reviewResults: (programId) => request(`/results/${programId}/review`),
  setResultPlaces: (programId, placements) => request(`/results/${programId}/placements`, { method: 'PUT', body: JSON.stringify({ placements }) }),
  results: (programId) => request(`/results/${programId}`),
  certificateUrl: (programId, registrationId) => `${BASE}/results/${programId}/certificate/${registrationId}`
};


