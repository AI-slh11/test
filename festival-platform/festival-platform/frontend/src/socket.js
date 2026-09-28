import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SOCKET_URL || undefined; // undefined = same-origin (works behind dev proxy in prod build)

export const socket = io(URL, { autoConnect: true });
