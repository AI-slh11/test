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
  const [form, setForm] = useState({ student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: '', judge_ids: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadPrograms = () => api.listPrograms().then(setPrograms).catch(() => {});
  useEffect(() => { loadPrograms(); api.listJudges().then(setJudges).catch(() => {}); }, []);

  const loadRegistrations = (programId) => {
    if (!programId) return;
    api.listRegistrations(programId).then(setRegistrations).catch(err => setError(err.message));
    api.results(programId).then(setResults).catch(() => {});
  };

  useEffect(() => { loadRegistrations(activeProgram); }, [activeProgram]);

  const program = programs.find(p => String(p.id) === String(activeProgram));
  const assignmentConflicts = program ? form.judge_ids.flatMap(judgeId => {
    const judge = judges.find(item => String(item.id) === String(judgeId));
    if (!judge || !program.time_slot?.trim()) return [];
    const conflictingProgram = programs.find(item => String(item.id) !== String(program.id)
      && item.time_slot?.trim().toLowerCase() === program.time_slot.trim().toLowerCase()
      && item.judges.some(assigned => String(assigned.id) === String(judgeId)));
    return conflictingProgram ? [`${judge.name} is already assigned to ${programLabel(conflictingProgram)} at ${program.time_slot}.`] : [];
  }) : [];

  const onsiteRegister = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (assignmentConflicts.length) {
      setError(assignmentConflicts.join(' '));
      return;
    }
    try {
      await api.register({ ...form, program_id: activeProgram, source: 'onsite' });
      setForm({ student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: '', judge_ids: [] });
      loadRegistrations(activeProgram);
      loadPrograms();
      setNotice('Student registered.');
    } catch (err) {
      setError(err.message);
    }
  };

  const saveRegistration = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.updateRegistration(editing.id, editing.values);
      setEditing(null);
      loadRegistrations(activeProgram);
      setNotice('Registration updated.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const removeRegistration = async (registration) => {
    if (!window.confirm(`Remove ${registration.student_name} (${registration.participant_id})? This permanently deletes the registration and its scorecards. Unpublish the program before removing a registration.`)) return;
    setError('');
    setNotice('');
    try {
      await api.deleteRegistration(registration.id);
      loadRegistrations(activeProgram);
      loadPrograms();
      setNotice('Registration removed. Its scorecards were also deleted.');
    } catch (err) { setError(err.message); }
  };

  const changeStatus = async (registrationId, status) => {
    setError('');
    setNotice('');
    try {
      await api.setStatus(registrationId, status);
      loadRegistrations(activeProgram);
      setNotice('Registration status updated.');
    } catch (err) { setError(err.message); }
  };

  const toggleJudge = async (judgeId, alreadyAssigned) => {
    setError('');
    setNotice('');
    try {
      if (alreadyAssigned) await api.unassignJudge(activeProgram, judgeId);
      else await api.assignJudge(activeProgram, judgeId);
      loadPrograms();
    } catch (err) { setError(err.message); }
  };

  const toggleRegistrationJudge = (judgeId) => setForm(current => ({
    ...current,
    judge_ids: current.judge_ids.includes(judgeId)
      ? current.judge_ids.filter(id => id !== judgeId)
      : [...current.judge_ids, judgeId]
  }));

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
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="success" role="status">{notice}</p>}
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
                <fieldset className="card" style={{ margin: '12px 0' }}>
                  <legend>Assign judges with this registration</legend>
                  <p className="muted small">Selected judges will be assigned to this program as the student is registered. Same-time-slot conflicts are blocked with an alert.</p>
                  {judges.map(judge => (
                    <label key={judge.id} className="checkbox">
                      <input type="checkbox" checked={form.judge_ids.includes(judge.id)}
                        onChange={() => toggleRegistrationJudge(judge.id)} disabled={program.results_published} />
                      {judge.name}{program.judges.some(assigned => assigned.id === judge.id) ? ' · already assigned' : ''}
                    </label>
                  ))}
                  {assignmentConflicts.map(conflict => <p className="error" role="alert" key={conflict}>{conflict}</p>)}
                </fieldset>
                {error && <p className="error">{error}</p>}
                <button type="submit" disabled={saving || !!program.results_published || assignmentConflicts.length > 0}>Register (instantly syncs to judges)</button>
              </form>
            </div>

            <div className="card">
              <h3>Assign Judges</h3>
              {judges.map(j => {
                const assigned = program.judges.some(pj => pj.id === j.id);
                return (
                  <label key={j.id} className="checkbox">
                    <input type="checkbox" checked={assigned} disabled={program.results_published} onChange={() => toggleJudge(j.id, assigned)} />
                    {j.name} ({j.code})
                  </label>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3>All Registrations for {programLabel(program)}</h3>
            {program.results_published && <p className="muted">Unpublish this program from Results before editing or removing registrations.</p>}
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Student ID</th><th>Team</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {registrations.map(r => editing?.id === r.id ? (
                  <tr key={r.id}>
                    <td>{r.code_letter}</td>
                    <td><input aria-label="Student name" value={editing.values.student_name} onChange={e => setEditing(current => ({ ...current, values: { ...current.values, student_name: e.target.value } }))} required /></td>
                    <td><input aria-label="Student ID" value={editing.values.student_id} onChange={e => setEditing(current => ({ ...current, values: { ...current.values, student_id: e.target.value } }))} required /></td>
                    <td>
                      <select value={editing.values.team_name} onChange={e => setEditing(current => ({ ...current, values: { ...current.values, team_name: e.target.value } }))} required>
                        {TEAMS.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                      </select>
                      <label className="checkbox">
                        <input type="checkbox" checked={editing.values.is_team} onChange={e => setEditing(current => ({ ...current, values: { ...current.values, is_team: e.target.checked } }))} />
                        Group entry
                      </label>
                      {editing.values.is_team && <input aria-label="Group members" placeholder="Team members" value={editing.values.team_members}
                        onChange={e => setEditing(current => ({ ...current, values: { ...current.values, team_members: e.target.value } }))} />}
                    </td>
                    <td>{r.source}</td>
                    <td>{r.status}</td>
                    <td>
                      <button disabled={saving} onClick={saveRegistration}>{saving ? 'Saving…' : 'Save'}</button>
                      <button className="secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td>{r.code_letter}</td>
                    <td>{r.student_name}</td>
                    <td>{r.student_id}</td>
                    <td><TeamBadge name={r.team_name} /></td>
                    <td>{r.source}</td>
                    <td>
                      <select aria-label={`Status for ${r.participant_id}`} value={r.status} disabled={program.results_published}
                        onChange={e => changeStatus(r.id, e.target.value)}>
                        {['registered', 'submission_received', 'slot_assigned', 'judged', 'results_announced'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td>
                      <button disabled={program.results_published} onClick={() => setEditing({ id: r.id, values: {
                        student_name: r.student_name, student_id: r.student_id, team_name: r.team_name || TEAMS[0].key,
                        is_team: !!r.is_team, team_members: r.team_members || '', language: r.language || ''
                      } })}>Edit</button>
                      <button className="danger" disabled={program.results_published} onClick={() => removeRegistration(r)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {registrations.length === 0 && <tr><td colSpan={7} className="muted">No registrations for this program yet.</td></tr>}
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

