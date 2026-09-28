import React, { useEffect, useState } from 'react';
import { programLabel } from '../categories.js';
import { api } from '../api.js';
import { TEAMS } from '../teams.js';
import TeamBadge from '../TeamBadge.jsx';

export default function GreenRoom() {
  const [programs, setPrograms] = useState([]);
  const [judges, setJudges] = useState([]);
  const [activeProgram, setActiveProgram] = useState('');
  const [registrations, setRegistrations] = useState([]);
  const [results, setResults] = useState(null);
  const [form, setForm] = useState({ student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: '' });
  const [error, setError] = useState('');

  const loadPrograms = () => api.listPrograms().then(setPrograms).catch(() => {});
  useEffect(() => { loadPrograms(); api.listJudges().then(setJudges).catch(() => {}); }, []);

  const loadRegistrations = (programId) => {
    if (!programId) return;
    api.listRegistrations(programId).then(setRegistrations).catch(() => {});
    api.results(programId).then(setResults).catch(() => {});
  };

  useEffect(() => { loadRegistrations(activeProgram); }, [activeProgram]);

  const program = programs.find(p => String(p.id) === String(activeProgram));

  const onsiteRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.register({ ...form, program_id: activeProgram, source: 'onsite' });
      setForm({ student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: '' });
      loadRegistrations(activeProgram);
      loadPrograms();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleJudge = async (judgeId, alreadyAssigned) => {
    if (alreadyAssigned) await api.unassignJudge(activeProgram, judgeId);
    else await api.assignJudge(activeProgram, judgeId);
    loadPrograms();
  };

  return (
    <div>
      <h2>Green Room — Organizer Control</h2>
      <div className="card">
        <label>Active Program</label>
        <select value={activeProgram} onChange={e => setActiveProgram(e.target.value)}>
          <option value="">Select a program...</option>
          {programs.map(p => <option key={p.id} value={p.id}>{programLabel(p)} ({p.registration_count} registered)</option>)}
        </select>
      </div>

      {program && (
        <>
          <div className="grid-2">
            <div className="card">
              <h3>Register Student On-Site</h3>
              <form onSubmit={onsiteRegister}>
                <label>Full Name</label>
                <input value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} required />
                <label>Student ID</label>
                <input value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })} required />
                <label>Team</label>
                <select value={form.team_name} onChange={e => setForm({ ...form, team_name: e.target.value })} required>
                  <option value="">Select team...</option>
                  {TEAMS.map(t => <option key={t.key} value={t.key}>{t.label} — {t.key}</option>)}
                </select>
                <label className="checkbox">
                  <input type="checkbox" checked={form.is_team} onChange={e => setForm({ ...form, is_team: e.target.checked })} />
                  Group entry
                </label>
                {form.is_team && (
                  <input placeholder="Team members, comma separated" value={form.team_members}
                    onChange={e => setForm({ ...form, team_members: e.target.value })} />
                )}
                {program.type === 'writing' && (
                  <>
                    <label>Language</label>
                    <input value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} required />
                  </>
                )}
                {error && <p className="error">{error}</p>}
                <button type="submit">Register (instantly syncs to judges)</button>
              </form>
            </div>

            <div className="card">
              <h3>Assign Judges</h3>
              {judges.map(j => {
                const assigned = program.judges.some(pj => pj.id === j.id);
                return (
                  <label key={j.id} className="checkbox">
                    <input type="checkbox" checked={assigned} onChange={() => toggleJudge(j.id, assigned)} />
                    {j.name} ({j.code})
                  </label>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3>All Registrations for {programLabel(program)}</h3>
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Student ID</th><th>Team</th><th>Source</th><th>Status</th></tr></thead>
              <tbody>
                {registrations.map(r => (
                  <tr key={r.id}>
                    <td>{r.code_letter}</td>
                    <td>{r.student_name}</td>
                    <td>{r.student_id}</td>
                    <td><TeamBadge name={r.team_name} /></td>
                    <td>{r.source}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Results preview</h3>
            <p className="muted">Review individual judge scorecards, set the podium and publish from the Results tab in the organizer dashboard.</p>
            <a href="/admin/dashboard">Open organizer dashboard</a>
            {results?.ranked?.length ? (
              <table>
                <thead><tr><th>Rank</th><th>Code</th><th>Avg Score</th><th>Judges Submitted</th><th>Certificate</th></tr></thead>
                <tbody>
                  {results.ranked.map(r => (
                    <tr key={r.registration_id}>
                      <td>{r.rank}</td>
                      <td>{r.code_letter}</td>
                      <td>{r.average_score}</td>
                      <td>{r.judges_submitted}</td>
                      <td>{r.rank <= 3
                        ? (program.results_published ? <a href={api.certificateUrl(activeProgram, r.registration_id)}>Download</a> : 'Available after publication')
                        : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">No scores submitted yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}

