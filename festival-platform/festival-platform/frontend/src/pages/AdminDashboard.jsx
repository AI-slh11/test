import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TEAMS } from '../teams.js';
import TeamBadge from '../TeamBadge.jsx';
import PasswordChange from '../PasswordChange.jsx';
import OrganizerResults from './OrganizerResults.jsx';
import ScheduleAdmin from './ScheduleAdmin.jsx';
import QRCode from 'qrcode';
import { downloadAdminCsv, parseCsv } from '../adminCsv.js';

const TABS = ['Overview', 'Programs', 'Judges', 'Registrations', 'Results', 'Schedule', 'Check-in', 'Activity'];

export default function AdminDashboard({ initialTab = 'Overview' }) {
  const [tab, setTab] = useState(initialTab);
  const [stats, setStats] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [judges, setJudges] = useState([]);
  const [regs, setRegs] = useState([]);
  const [regProgram, setRegProgram] = useState('');
  const [editing, setEditing] = useState(null); // { kind, id, values }
  const [error, setError] = useState('');
  const [activity, setActivity] = useState([]);
  const [qrRegistration, setQrRegistration] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const initialParticipant = new URLSearchParams(window.location.search).get('participant') || '';

  const loadAll = () => {
    api.adminStats().then(setStats).catch(e => setError(e.message));
    api.listPrograms().then(setPrograms).catch(() => {});
    api.listJudges().then(setJudges).catch(() => {});
    api.listRegistrations(regProgram || undefined).then(setRegs).catch(() => {});
  };
  useEffect(loadAll, [regProgram]);
  useEffect(() => { if (initialTab !== 'Overview') setTab(initialTab); }, [initialTab]);
  useEffect(() => {
    if (tab !== 'Overview') return undefined;
    const timer = window.setInterval(() => api.adminStats().then(setStats).catch(() => {}), 15000);
    return () => window.clearInterval(timer);
  }, [tab]);
  useEffect(() => { if (tab === 'Activity') api.auditLog().then(setActivity).catch(e => setError(e.message)); }, [tab]);

  const run = async (fn) => {
    setError('');
    try { await fn(); setEditing(null); loadAll(); } catch (e) { setError(e.message); }
  };
  const startEdit = (kind, row, fields) => {
    const values = {};
    fields.forEach(f => { values[f] = row[f] ?? ''; });
    setEditing({ kind, id: row.id, values });
  };
  const setVal = (k, v) => setEditing(e => ({ ...e, values: { ...e.values, [k]: v } }));
  const isEditing = (kind, id) => editing && editing.kind === kind && editing.id === id;
  const cell = (kind, id, field, type = 'text', width) =>
    <input type={type} style={{ width }} value={editing.values[field]} onChange={e => setVal(field, e.target.value)} />;

  const t = stats?.totals;

  return (
    <div>
      <h2>Admin Dashboard</h2>
      <div className="tabs">
        {TABS.map(name => (
          <button key={name} className={`tab ${tab === name ? 'active' : ''}`} onClick={() => { setTab(name); setEditing(null); }}>{name}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}

      {tab === 'Overview' && t && (
        <>
          <div className="stat-grid">
            {[
              ['Programs', t.programs], ['Registrations', t.registrations], ['Unique students', t.unique_students],
              ['Online', t.online], ['On-site', t.onsite], ['Judges', t.judges],
              ['Scores submitted', t.scores_submitted], ['Fully judged', t.fully_judged],
              ['Aliora entries', t.by_team.Aliora], ['Nexiora entries', t.by_team.Nexiora], ['Results published', t.published_programs]
            ].map(([label, value]) => (
              <div className="stat-card" key={label}><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
            ))}
          </div>

          <div className="card">
            <h3>Per program</h3>
            <table>
              <thead><tr><th>Program</th><th>Registered</th><th>Quota</th><th>Spots left</th><th>Judges</th><th>Scores in</th><th>Fully judged</th><th>Results</th></tr></thead>
              <tbody>
                {stats.programs.map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td>{p.registered}</td><td>{p.quota ?? '∞'}</td><td>{p.spots_left ?? '—'}</td>
                    <td>{p.judges}</td><td>{p.scores_submitted}/{p.scores_expected}</td><td>{p.fully_judged}/{p.registered}</td><td>{p.published ? '✓ Published' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Judge progress</h3>
            <table>
              <thead><tr><th>Judge</th><th>Code</th><th>Programs</th><th>Scored</th></tr></thead>
              <tbody>
                {stats.judges.map(j => (
                  <tr key={j.id}><td>{j.name}</td><td>{j.code}</td><td>{j.programs_assigned}</td><td>{j.scores_submitted}/{j.scores_expected}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card"><h3>Schedule conflict watch</h3>
            {stats.schedule_conflicts?.length ? <ul>{stats.schedule_conflicts.map((item, index) => <li key={`${item.judge_id}-${item.time_slot}-${index}`} className="error">{item.judge_name} has overlapping assignments at {item.time_slot}: {item.programs}</li>)}</ul>
              : <p className="success">No judge time-slot conflicts found.</p>}
          </div>
        </>
      )}

      {tab === 'Programs' && (
        <div className="card">
          <h3>Programs — edit anything, set a quota (blank = unlimited)</h3>
          <table>
            <thead><tr><th>Name</th><th>Code</th><th>Type</th><th>Time slot</th><th>Quota</th><th></th></tr></thead>
            <tbody>
              {programs.map(p => isEditing('program', p.id) ? (
                <tr key={p.id}>
                  <td>{cell('program', p.id, 'name')}</td>
                  <td>{cell('program', p.id, 'code', 'text', 70)}</td>
                  <td>
                    <select value={editing.values.type} onChange={e => setVal('type', e.target.value)}>
                      <option value="stage">stage</option><option value="writing">writing</option>
                    </select>
                  </td>
                  <td>{cell('program', p.id, 'time_slot')}</td>
                  <td>{cell('program', p.id, 'quota', 'number', 80)}</td>
                  <td>
                    <button onClick={() => run(() => api.updateProgram(p.id, editing.values))}>Save</button>
                    <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{p.code}</td><td>{p.type}</td><td>{p.time_slot || '—'}</td><td>{p.quota ?? '∞'}</td>
                  <td>
                    <button onClick={() => startEdit('program', p, ['name', 'code', 'type', 'time_slot', 'quota'])}>Edit</button>
                    <button className="secondary" onClick={() => run(() => api.setPublished(p.id, !p.results_published))}>{p.results_published ? 'Unpublish' : 'Publish'}</button>
                    <button className="danger" onClick={() => window.confirm(`Delete "${p.name}" and all its registrations and scores?`) && run(() => api.deleteProgram(p.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Judges' && (
        <div className="card">
          <h3>Judges (a panel is 2–3 per program — assign them in the Green Room)</h3>
          <table>
            <thead><tr><th>Name</th><th>Login code</th><th>Password</th><th></th></tr></thead>
            <tbody>
              {judges.map(j => isEditing('judge', j.id) ? (
                <tr key={j.id}>
                  <td>{cell('judge', j.id, 'name')}</td>
                  <td>{cell('judge', j.id, 'code')}</td>
                  <td>{cell('judge', j.id, 'password')}</td>
                  <td>
                    <button onClick={() => run(() => api.updateJudge(j.id, editing.values))}>Save</button>
                    <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={j.id}>
                  <td>{j.name}</td><td>{j.code}</td><td className="muted">••••••••</td>
                  <td>
                    <button onClick={() => setEditing({ kind: 'judge', id: j.id, values: { name: j.name, code: j.code, password: '' } })}>Edit</button>
                    <button className="danger" onClick={() => window.confirm(`Delete judge ${j.name}? This also removes their program assignments and submitted scores, which can change judging progress and results. Published programs must be unpublished first.`) && run(() => api.deleteJudge(j.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Leave the password blank when editing to keep the current one.</p>
          <NewJudge onCreate={(v) => run(() => api.createJudge(v))} />
        </div>
      )}

      {tab === 'Registrations' && (
        <div className="card">
          <h3>Registrations</h3>
          <div className="row-actions">
            <button className="secondary" onClick={async () => {
              try { await downloadAdminCsv(api.registrationsCsvUrl()); }
              catch (err) { setError(err.message); }
            }}>Export CSV</button>
            <label className="button secondary">Import team roster CSV
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (!file) return;
                try {
                  const rows = parseCsv(await file.text());
                  const report = await api.bulkRegister(rows.map(row => ({ ...row, is_team: ['1','true','yes'].includes(String(row.is_team).toLowerCase()) })));
                  setImportReport(report);
                  loadAll();
                } catch (err) { setError(err.message); }
              }} />
            </label>
          </div>
          {importReport && <div className="card"><strong>CSV import: {importReport.created} registrations added</strong>
            {importReport.results.filter(row => row.error).map(row => <p className="error" key={row.row}>Row {row.row}: {row.error}</p>)}
            {!importReport.results.some(row => row.error) && <p className="success">All rows imported.</p>}
          </div>}
          <select value={regProgram} onChange={e => setRegProgram(e.target.value)}>
            <option value="">All programs</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <table>
            <thead><tr><th>Code</th><th>Participant ID</th><th>Name</th><th>Student ID</th><th>Team</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {regs.map(r => isEditing('reg', r.id) ? (
                <tr key={r.id}>
                  <td>{r.code_letter}</td><td>{r.participant_id}</td>
                  <td>{cell('reg', r.id, 'student_name')}</td>
                  <td>{cell('reg', r.id, 'student_id', 'text', 130)}</td>
                  <td>
                    <select value={editing.values.team_name} onChange={e => setVal('team_name', e.target.value)}>
                      <option value="">—</option>
                      {TEAMS.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
                    </select>
                  </td>
                  <td>{r.source}</td>
                  <td>
                    <button onClick={() => run(() => api.updateRegistration(r.id, editing.values))}>Save</button>
                    <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>{r.code_letter}</td><td>{r.participant_id}</td><td>{r.student_name}</td><td>{r.student_id}</td><td><TeamBadge name={r.team_name} /></td><td>{r.source}</td>
                  <td>
                    <button className="secondary" onClick={() => setQrRegistration(r)}>QR</button>
                    <button onClick={() => startEdit('reg', r, ['student_name', 'student_id', 'team_name'])}>Edit</button>
                    <button className="danger" onClick={() => window.confirm(`Delete registration ${r.participant_id}?`) && run(() => api.deleteRegistration(r.id))}>Delete</button>
                  </td>
                </tr>
              ))}
              {regs.length === 0 && <tr><td colSpan={7} className="muted">No registrations.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'Check-in' && <CheckInPanel initialId={initialParticipant} />}
      {tab === 'Activity' && <div className="card"><h3>Recent organizer activity</h3><p className="muted">Latest 300 saved changes and actions.</p>
        <div className="results-admin-table-wrap"><table><thead><tr><th>Time</th><th>Organizer</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>
          {activity.map(item => <tr key={item.id}><td>{item.created_at}</td><td>{item.actor}</td><td>{item.action}</td><td>{item.entity} {item.entity_id}</td><td><code>{JSON.stringify(item.details)}</code></td></tr>)}
          {!activity.length && <tr><td colSpan={5} className="muted">No activity recorded yet.</td></tr>}
        </tbody></table></div></div>}
      {qrRegistration && <RegistrationQr registration={qrRegistration} onClose={() => setQrRegistration(null)} />}
      {tab === 'Results' && <OrganizerResults programs={programs} />}
      {tab === 'Schedule' && <ScheduleAdmin />}
      <PasswordChange />
    </div>
  );
}

function CheckInPanel({ initialId = '' }) {
  const [participantId, setParticipantId] = useState(initialId);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!initialId) return;
    api.lookupCheckin(initialId).then(setResult).catch(e => setError(e.message));
  }, [initialId]);
  const lookup = async (event) => {
    event?.preventDefault(); setError(''); setResult(null);
    try { setResult(await api.lookupCheckin(participantId.trim())); } catch (e) { setError(e.message); }
  };
  const checkIn = async () => {
    try { await api.checkin(result.registration.participant_id); await lookup(); } catch (e) { setError(e.message); }
  };
  return <div className="card narrow"><h3>QR / participant check-in</h3><p className="muted">Scan a participant QR code to open this page with their ID, or enter the participant ID below.</p>
    <form onSubmit={lookup}><label>Participant ID</label><input value={participantId} onChange={e => setParticipantId(e.target.value)} placeholder="FEST-..." required />
      <button>Find participant</button></form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <div className="success-box"><strong>{result.registration.student_name}</strong><p>{result.registration.program} · {result.registration.participant_id}</p>
      {result.registration.team_members && <p>{result.registration.team_members}</p>}
      {result.checked_in ? <><p>Checked in at {result.registration.checked_in_at}</p><button className="secondary" onClick={async () => { await api.undoCheckin(result.registration.participant_id); setResult(await api.lookupCheckin(result.registration.participant_id)); }}>Undo check-in</button></> : <button onClick={checkIn}>Confirm check-in</button>}
    </div>}
  </div>;
}

function RegistrationQr({ registration, onClose }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/check-in?participant=${encodeURIComponent(registration.participant_id)}`, { width: 280, margin: 2 })
      .then(setImage).catch(() => setImage(''));
  }, [registration]);
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="card narrow" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
    <button className="secondary" onClick={onClose}>Close</button><h3>Check-in QR</h3><p>{registration.student_name} · {registration.participant_id}</p>
    {image ? <img src={image} alt={`Check-in QR code for ${registration.participant_id}`} style={{ width: 280, maxWidth: '100%' }} /> : <p>Generating QR…</p>}
    <p className="muted small">Scanning opens the organizer check-in page. The organizer must sign in to confirm arrival.</p>
  </div></div>;
}

function NewJudge({ onCreate }) {
  const [v, setV] = useState({ name: '', code: '', password: '' });
  return (
    <div style={{ marginTop: 16 }}>
      <h4>Add a judge</h4>
      <div className="grid-2">
        <input placeholder="Name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />
        <input placeholder="Login code (e.g. JUDGE-2024-004)" value={v.code} onChange={e => setV({ ...v, code: e.target.value })} />
        <input placeholder="Password" value={v.password} onChange={e => setV({ ...v, password: e.target.value })} />
      </div>
      <button onClick={() => { onCreate(v); setV({ name: '', code: '', password: '' }); }}>Add judge</button>
    </div>
  );
}
