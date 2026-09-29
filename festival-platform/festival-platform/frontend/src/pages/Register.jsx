import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TEAMS } from '../teams.js';
import TeamBadge from '../TeamBadge.jsx';
import { CATEGORIES } from '../categories.js';

export default function Register() {
  const [programs, setPrograms] = useState([]);
  const [category, setCategory] = useState('');
  const [form, setForm] = useState({
    program_id: '', student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: ''
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loadState, setLoadState] = useState('loading'); // loading | ok | failed
  const [teamLeaderMode, setTeamLeaderMode] = useState(false);
  const [leader, setLeader] = useState({ name: '', student_id: '' });
  const [roster, setRoster] = useState([{ student_name: '', student_id: '' }]);
  const [batchResult, setBatchResult] = useState(null);
  const [batchErrors, setBatchErrors] = useState([]);

  useEffect(() => {
    api.listPrograms().then(p => { setPrograms(p); setLoadState('ok'); }).catch(() => setLoadState('failed'));
  }, []);

  const categoryPrograms = programs.filter(p => category === 'general' ? !p.category : p.category === category);
  const selectedProgram = programs.find(p => String(p.id) === String(form.program_id));
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setResult(null); setBatchResult(null); setBatchErrors([]);
    try {
      if (teamLeaderMode) {
        const entries = roster.filter(row => row.student_name.trim() || row.student_id.trim());
        if (!entries.length) throw new Error('Add at least one student to the roster.');
        const ids = entries.map(row => row.student_id.trim().toUpperCase());
        if (new Set(ids).size !== ids.length) throw new Error('The roster has a duplicate Student ID. Correct it before submitting.');
        const completed = [];
        const failures = [];
        const failedEntries = [];
        for (const student of entries) {
          try {
            const { registration } = await api.register({ ...form, ...student, language: form.language || selectedProgram?.language || '', source: 'online', team_leader_name: leader.name, team_leader_id: leader.student_id });
            completed.push(registration);
          } catch (err) { failures.push(`${student.student_name || student.student_id}: ${err.message}`); failedEntries.push(student); }
        }
        setBatchResult(completed);
        setBatchErrors(failures);
        setRoster(failedEntries.length ? failedEntries : [{ student_name: '', student_id: '' }]);
        return;
      }
      const { registration } = await api.register({ ...form, language: form.language || selectedProgram?.language || '', source: 'online' });
      setResult(registration);
      setForm({ program_id: '', student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card narrow">
      <h2>Student Registration</h2>
      <p className="muted">Same form for stage & writing programs. Open to all campus members.</p>
      <form onSubmit={submit}>
        <label className="checkbox"><input type="checkbox" checked={teamLeaderMode} onChange={event => { setTeamLeaderMode(event.target.checked); setError(''); setBatchResult(null); }} /> I’m a team leader registering multiple students</label>
        <label>Category</label>
        <div className="team-choice">
          {CATEGORIES.map(c => (
            <label key={c.key} className={`team-option ${category === c.key ? 'selected' : ''}`}>
              <input type="radio" name="category" value={c.key} checked={category === c.key}
                onChange={() => { setCategory(c.key); setForm({ ...form, program_id: '', language: '' }); }} required />
              <strong>{c.label}</strong>
            </label>
          ))}
        </div>

        <label>Program</label>
        <select value={form.program_id} onChange={e => setForm({ ...form, program_id: e.target.value })} required disabled={!category}>
          <option value="">{category ? 'Select a program...' : 'Choose a category first'}</option>
          {categoryPrograms.map(p => (
            <option key={p.id} value={p.id}>{p.number ? `${p.number}. ` : ''}{p.name}{p.time_slot ? ` — ${p.time_slot}` : ''}</option>
          ))}
        </select>

        {selectedProgram && <p className="muted small">The organizers will assign performance codes after registration. You can check your program and results later using My Results.</p>}

        {loadState === 'failed' && <p className="error">Couldn't load programs — the server isn't reachable. Please try again in a moment.</p>}
        {loadState === 'ok' && programs.length === 0 && <p className="error">No programs have been created yet.</p>}
        {loadState === 'ok' && category && categoryPrograms.length === 0 && programs.length > 0 && (
          <p className="error">No {category} programs found. (If you just updated the site, the server may still be running an older version.)</p>
        )}

        <label>Your Team</label>
        <div className="team-choice">
          {TEAMS.map(t => (
            <label key={t.key} className={`team-option ${form.team_name === t.key ? 'selected' : ''}`} style={{ '--team': t.color }}>
              <input type="radio" name="team" value={t.key} checked={form.team_name === t.key}
                onChange={() => setForm({ ...form, team_name: t.key })} required />
              <span className="team-option-label">{t.label}</span>
              <strong>{t.key}</strong>
            </label>
          ))}
        </div>

        {teamLeaderMode && <>
          <label>Team leader name</label>
          <input value={leader.name} onChange={event => setLeader({ ...leader, name: event.target.value })} required />
          <label>Team leader Student ID</label>
          <input value={leader.student_id} onChange={event => setLeader({ ...leader, student_id: event.target.value.toUpperCase() })} pattern="\d{4}[A-Za-z]{2,3}\d{3}" placeholder="e.g. 2023CSE001" required />
          <p className="muted small">Add each student below. The organizer will assign codes and participant IDs after the roster is registered.</p>
          {roster.map((student, index) => <div className="card" key={index}>
            <h4>Student {index + 1}</h4>
            <label>Full name</label><input value={student.student_name} onChange={event => setRoster(items => items.map((item, i) => i === index ? { ...item, student_name: event.target.value } : item))} required />
            <label>Student ID</label><input value={student.student_id} onChange={event => setRoster(items => items.map((item, i) => i === index ? { ...item, student_id: event.target.value.toUpperCase() } : item))} pattern="\d{4}[A-Za-z]{2,3}\d{3}" placeholder="e.g. 2023CSE001" required />
            {roster.length > 1 && <button type="button" className="danger" onClick={() => setRoster(items => items.filter((_, i) => i !== index))}>Remove student</button>}
          </div>)}
          {roster.length < 25 && <button type="button" className="secondary" onClick={() => setRoster(items => [...items, { student_name: '', student_id: '' }])}>Add another student</button>}
        </>}

        {!teamLeaderMode && <><label>Full Name</label>
        <input value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} required />

        <label>Student ID</label>
        <input
          value={form.student_id}
          onChange={e => setForm({ ...form, student_id: e.target.value.toUpperCase() })}
          pattern="\d{4}[A-Za-z]{2,3}\d{3}"
          title="4 digits, 2-3 letters, 3 digits — e.g. 2023CSE001"
          placeholder="e.g. 2023CSE001"
          maxLength={10}
          required
        />
        <p className="muted small">Format: 4 digits, 2–3 letters, 3 digits. You're registered instantly — no approval needed.</p>

        <label className="checkbox">
          <input type="checkbox" checked={form.is_team} onChange={e => setForm({ ...form, is_team: e.target.checked })} />
          Group entry (more than one performer)
        </label>
        {form.is_team && (
          <>
            <label>Other group members (comma separated)</label>
            <input value={form.team_members} onChange={e => setForm({ ...form, team_members: e.target.value })} />
          </>
        )}
        </>}

        {selectedProgram?.type === 'writing' && !selectedProgram.language && (
          <>
            <label>Language</label>
            <input value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
              placeholder="e.g. English, Hindi, Malayalam" required />
            <p className="muted small">Writing submissions (essay/story files) are uploaded on-site or emailed to organizers ahead of the festival in this MVP.</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit">{teamLeaderMode ? 'Register student roster' : 'Register'}</button>
      </form>

      {result && (
        <div className="success-box">
          <strong>Registered!</strong>
          <p>Your Team: <TeamBadge name={result.team_name} /></p>
          <p className="muted small">Your registration is saved. An organizer will assign your performance code; use My Results to check your program and results.</p>
        </div>
      )}
      {batchResult && <div className="success-box"><strong>Roster registered: {batchResult.length} students</strong>{batchResult.map((item, index) => <p key={item.id || index}>{item.student_name} · code pending organizer assignment</p>)}<p className="muted small">Each student can use their Student ID on My Results to see this program.</p></div>}
      {batchErrors.map((message, index) => <p className="error" key={index}>{message}</p>)}
    </div>
  );
}
