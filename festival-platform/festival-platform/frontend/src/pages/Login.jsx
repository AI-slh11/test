import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { user, token } = await api.login(code.trim().toUpperCase(), password);
      login(user, token);
      navigate(user.role === 'organizer' ? '/green-room' : '/judge');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card narrow">
      <h2>Organizer / Judge Login</h2>
      <form onSubmit={submit}>
        <label>Login Code</label>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="ORG-001 or JUDGE-2024-001" autoComplete="username" autoCapitalize="characters" autoCorrect="off" spellCheck={false} required />
        <label>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit">Log in</button>
      </form>
    </div>
  );
}

