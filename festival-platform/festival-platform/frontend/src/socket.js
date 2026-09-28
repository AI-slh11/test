import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? '/api' : 'https://test-t24x.onrender.com/api');
const inferredSocketUrl = /^https?:\/\//i.test(API_BASE) ? API_BASE.replace(/\/api\/?$/i, '') : undefined;
const URL = import.meta.env.VITE_SOCKET_URL || inferredSocketUrl;

export const socket = io(URL, {
  autoConnect: true,
  auth: (callback) => {
    let token = '';
    try { token = localStorage.getItem('festival_auth_token') || ''; } catch {}
    callback({ token });
  }
});

