import React, { useState } from 'react';
import { api } from './api.js';

export default function PasswordChange() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setMessage(''); setError('');
    try {
      await api.changePassword(current, next);
      setCurrent(''); setNext('');
      setMessage('Password updated.');
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="card narrow">
      <h3>Change your password</h3>
      <form onSubmit={submit}>
        <label>Current password</label>
        <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required />
        <label>New password (at least 12 characters)</label>
        <input type="password" autoComplete="new-password" minLength={12} value={next} onChange={e => setNext(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <button type="submit">Update password</button>
      </form>
    </div>
  );
}
