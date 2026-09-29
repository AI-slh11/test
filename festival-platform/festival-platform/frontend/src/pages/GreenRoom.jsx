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
  const [form, setForm] = useState({ student_name: '', student_id: '', team_name: '', code_letter: '', is_team: false, team_members: '', language: '', judge_ids: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [downloadingCertificate, setDownloadingCertificate] = useState(null);

  const loadPrograms = () => api.listPrograms().then(setPrograms).catch(() => {});
  useEffect(() => { loadPrograms(); api.listJudges().then(setJudges).catch(() => {}); }, []);

  const loadRegistrations = (programId) => {
    if (!programId) return;
    api.listRegistrations(programId).then(setRegistrations).catch(err => setError(err.message));
    api.results(programId).then(setResults).catch(() => {});
  };

  useEffect(() => { loadRegistrations(activeProgram); }, [activeProgram]);

  const program = programs.find(p => String(p.id) === String(activeProgram));
  const takenLetters = new Set(registrations.map(registration => registration.code_letter));
  const allCodeLetters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').flatMap(first => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(second => `${first}${second}`))];
  const availableLetters = allCodeLetters.filter(letter => !takenLetters.has(letter));
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
      setForm({ student_name: '', student_id: '', team_name: '', code_letter: '', is_team: false, team_members: '', language: '', judge_ids: [] });
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

  const downloadWinnerCertificate = async (registrationId) => {
    setDownloadingCertificate(registrationId);
    setError('');
    try {
      await api.downloadCertificate(activeProgram, registrationId);
    } catch (err) {
      setError(err.message || 'Could not generate certificate.');
    } finally {
      setDownloadingCertificate(null);
    }
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
                <label>Student’s chosen performance code</label>
                <select value={form.code_letter} onChange={e => setForm({ ...form, code_letter: e.target.value })} required disabled={!availableLetters.length}>
                  <option value="">{availableLetters.length ? 'Choose an available letter…' : 'No code letters available'}</option>
                  {availableLetters.map(letter => <option key={letter} value={letter}>{letter}</option>)}
                </select>
                <p className="muted small">The student chooses this code. It determines performance order and cannot be shared within a program.</p>
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
                  <p className="muted small">Selected judges will be assigned to this student and made available in the program. Existing students keep their current panels; time-slot conflicts are blocked with an alert.</p>
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
              <thead><tr><th>Code</th><th>Name</th><th>Student ID</th><th>Team</th><th>Assigned judges</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
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
                    <td>—</td>
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
                    <td><RegistrationJudgeEditor registration={r} judges={program?.judges || []}
                      disabled={program.results_published} onSaved={() => loadRegistrations(activeProgram)} /></td>
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
                {registrations.length === 0 && <tr><td colSpan={8} className="muted">No registrations for this program yet.</td></tr>}
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
                        ? (program.results_published
                          ? <button className="secondary" disabled={downloadingCertificate != null} onClick={() => downloadWinnerCertificate(r.registration_id)}>
                              {downloadingCertificate === r.registration_id ? 'Generating…' : 'Download certificate'}
                            </button>
                          : 'Available after publication')
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

function RegistrationJudgeEditor({ registration, judges, disabled, onSaved }) {
  const assignedKey = (registration.assigned_judge_ids || []).map(Number).sort((a, b) => a - b).join(',');
  const [selected, setSelected] = useState(() => (registration.assigned_judge_ids || []).map(Number));
  const [custom, setCustom] = useState(!!registration.judge_panel_custom);
  const [savingPanel, setSavingPanel] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');

  useEffect(() => {
    setSelected((registration.assigned_judge_ids || []).map(Number));
    setCustom(!!registration.judge_panel_custom);
  }, [registration.id, assignedKey, registration.judge_panel_custom]);

  const toggle = (judgeId) => setSelected(current => current.includes(Number(judgeId))
    ? current.filter(id => id !== Number(judgeId)) : [...current, Number(judgeId)]);
  const save = async () => {
    setSavingPanel(true); setPanelError(''); setPanelMessage('');
    try {
      const result = await api.setRegistrationJudges(registration.id, selected);
      setSelected(result.assigned_judge_ids); setCustom(true); setPanelMessage('Student panel saved.'); onSaved();
    } catch (error) { setPanelError(error.message); }
    finally { setSavingPanel(false); }
  };
  const reset = async () => {
    setSavingPanel(true); setPanelError(''); setPanelMessage('');
    try {
      const result = await api.resetRegistrationJudges(registration.id);
      setSelected(result.assigned_judge_ids); setCustom(false); setPanelMessage('Using the program panel.'); onSaved();
    } catch (error) { setPanelError(error.message); }
    finally { setSavingPanel(false); }
  };

  const labels = (registration.assigned_judge_ids || []).map(id => judges.find(judge => Number(judge.id) === Number(id))?.name).filter(Boolean);
  return <details className="student-judge-editor">
    <summary>{labels.length ? labels.join(', ') : 'No judges assigned'} <small>{custom ? '· Custom' : '· Program panel'}</small></summary>
    <div className="student-judge-options">
      {judges.map(judge => <label key={judge.id} className="checkbox">
        <input type="checkbox" checked={selected.includes(Number(judge.id))} disabled={disabled || savingPanel}
          onChange={() => toggle(judge.id)} />{judge.name}
      </label>)}
      {!judges.length && <p className="muted small">Assign judges to this program first.</p>}
    </div>
    <small className="muted">Changing the panel recalculates this student’s judging progress. Removed judges’ scorecards remain in history but no longer count toward the average.</small>
    {panelError && <p className="error" role="alert">{panelError}</p>}
    {panelMessage && <p className="success" role="status">{panelMessage}</p>}
    <button type="button" disabled={disabled || savingPanel || !judges.length || !selected.length}
      onClick={save}>{savingPanel ? 'Saving…' : 'Save student panel'}</button>
    {custom && <button type="button" className="secondary" disabled={disabled || savingPanel}
      onClick={reset}>Use program panel</button>}
    {disabled && <small className="muted">Unpublish results to edit the panel.</small>}
  </details>;
}

