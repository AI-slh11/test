import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, getToken, setToken, clearToken } from '../adminApi.js';
import { CATEGORIES, categoryLabel, programLabel } from '../categories.js';
import { TEAMS } from '../teams.js';
import TeamBadge from '../TeamBadge.jsx';

const TABS = ['Overview', 'Programs', 'Judges', 'Registrations', 'Account'];
const LANGUAGES = ['Malayalam', 'English', 'Arabic', 'Urdu'];

// Hidden admin console. Not linked from anywhere; reachable only by typing its URL,
// and every request it makes is checked against an admin token on the server.
export default function ControlRoom() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(!!getToken());

  // keep this page out of search engines
  useEffect(() => {
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex,nofollow';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    adminApi.session().then(() => setAuthed(true)).catch(() => clearToken()).finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="cr-shell"><p className="cr-loading">Checking session…</p></div>;
  if (!authed) return <AdminLogin onDone={() => setAuthed(true)} />;
  return <Console onSignOut={() => { adminApi.logout().catch(() => {}); clearToken(); setAuthed(false); }} onExpired={() => { clearToken(); setAuthed(false); }} />;
}

function AdminLogin({ onDone }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { const r = await adminApi.login(code, password); setToken(r.token); onDone(); }
    catch (err) { setError(err.message); }
  };
  return (
    <div className="cr-shell cr-center">
      <form className="cr-login" onSubmit={submit}>
        <h2>Restricted</h2>
        <p className="muted small">Administrator sign-in</p>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Admin code" autoComplete="username" required />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}

function Console({ onSignOut, onExpired }) {
  const [tab, setTab] = useState('Overview');
  const [stats, setStats] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [judges, setJudges] = useState([]);
  const [regs, setRegs] = useState([]);
  const [regProgram, setRegProgram] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fail = (e) => { if (e.status === 401) onExpired(); else setError(e.message); };
  const loadAll = () => {
    adminApi.stats().then(setStats).catch(fail);
    adminApi.listPrograms().then(setPrograms).catch(fail);
    adminApi.listJudges().then(setJudges).catch(fail);
    adminApi.listRegistrations(regProgram || undefined).then(setRegs).catch(fail);
  };
  useEffect(loadAll, [regProgram]);

  const run = async (fn, msg) => {
    setError(''); setNotice('');
    try { await fn(); setEditing(null); if (msg) setNotice(msg); loadAll(); } catch (e) { fail(e); }
  };
  const setVal = (k, v) => setEditing(e => ({ ...e, values: { ...e.values, [k]: v } }));
  const isEditing = (kind, id) => editing && editing.kind === kind && editing.id === id;
  const field = (name, type = 'text', width) =>
    <input type={type} style={{ width }} value={editing.values[name] ?? ''} onChange={e => setVal(name, e.target.value)} />;

  return (
    <div className="cr-shell">
      <header className="cr-head">
        <div><h2>Control Room</h2><span className="muted small">Rendezvous’26 · administrator</span></div>
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </header>
      <div className="tabs">
        {TABS.map(n => <button key={n} className={`tab ${tab === n ? 'active' : ''}`} onClick={() => { setTab(n); setEditing(null); setError(''); setNotice(''); }}>{n}</button>)}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {tab === 'Overview' && stats && <Overview stats={stats} />}
      {tab === 'Programs' && (
        <ProgramsTab programs={programs} judges={judges} run={run} editing={editing} setEditing={setEditing}
          isEditing={isEditing} field={field} setVal={setVal} />
      )}
      {tab === 'Judges' && <JudgesTab judges={judges} run={run} editing={editing} setEditing={setEditing} isEditing={isEditing} field={field} />}
      {tab === 'Registrations' && (
        <RegistrationsTab regs={regs} programs={programs} regProgram={regProgram} setRegProgram={setRegProgram}
          run={run} setEditing={setEditing} isEditing={isEditing} field={field} editing={editing} setVal={setVal} />
      )}
      {tab === 'Account' && <AccountTab run={run} />}
    </div>
  );
}

function Overview({ stats }) {
  const t = stats.totals;
  const cards = [
    ['Programs', t.programs], ['Premier programs', t.programs_by_category.premier], ['Junior programs', t.programs_by_category.junior],
    ['Registrations', t.registrations], ['Premier entries', t.by_category.premier], ['Junior entries', t.by_category.junior],
    ['Unique students', t.unique_students], ['Online', t.online], ['On-site', t.onsite],
    ['Aliora entries', t.by_team.Aliora], ['Nexiora entries', t.by_team.Nexiora], ['Judges', t.judges],
    ['Scores submitted', t.scores_submitted], ['Fully judged', t.fully_judged], ['Results published', t.published_programs]
  ];
  return (
    <>
      <div className="stat-grid">
        {cards.map(([label, value]) => <div className="stat-card" key={label}><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>)}
      </div>
      <div className="card">
        <h3>Per program</h3>
        <div className="cr-scroll">
          <table>
            <thead><tr><th>#</th><th>Program</th><th>Cat.</th><th>Registered</th><th>Quota</th><th>Judges</th><th>Scores in</th><th>Judged</th><th>Results</th></tr></thead>
            <tbody>
              {stats.programs.map(p => (
                <tr key={p.id}>
                  <td>{p.number ?? '—'}</td><td>{p.name}</td><td>{categoryLabel(p.category) || '—'}</td><td>{p.registered}</td>
                  <td>{p.quota ?? '∞'}</td><td>{p.judges}</td><td>{p.scores_submitted}/{p.scores_expected}</td>
                  <td>{p.fully_judged}/{p.registered}</td><td>{p.published ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Judge progress</h3>
        <table>
          <thead><tr><th>Judge</th><th>Code</th><th>Programs</th><th>Scored</th></tr></thead>
          <tbody>{stats.judges.map(j => <tr key={j.id}><td>{j.name}</td><td>{j.code}</td><td>{j.programs_assigned}</td><td>{j.scores_submitted}/{j.scores_expected}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

const BLANK_PROGRAM = { category: 'premier', number: '', name: '', code: '', type: 'writing', language: '', time_slot: '', quota: '', judge_ids: [] };

function ProgramsTab({ programs, judges, run, editing, setEditing, isEditing, field, setVal }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(BLANK_PROGRAM);

  const shown = useMemo(() => programs.filter(p =>
    (filter === 'all' || (filter === 'none' ? !p.category : p.category === filter)) &&
    (!search || `${p.name} ${p.number} ${p.code}`.toLowerCase().includes(search.toLowerCase()))
  ), [programs, filter, search]);
  const uncategorized = programs.filter(p => !p.category).length;

  const toggleJudge = (id) => setForm(f => ({ ...f, judge_ids: f.judge_ids.includes(id) ? f.judge_ids.filter(x => x !== id) : [...f.judge_ids, id] }));
  const create = (e) => {
    e.preventDefault();
    run(async () => { await adminApi.createProgram(form); setForm({ ...BLANK_PROGRAM, category: form.category }); }, 'Program created');
  };

  return (
    <>
      <div className="card">
        <h3>Create a program</h3>
        <form onSubmit={create}>
          <div className="grid-2">
            <div><label>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select></div>
            <div><label>Program number (blank = next free)</label>
              <input type="number" min="1" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></div>
            <div><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label>Short code (blank = auto)</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
            <div><label>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="writing">Writing / submission</option><option value="stage">Stage / live</option>
              </select></div>
            <div><label>Language</label>
              <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
                <option value="">— none / student chooses —</option>
                {LANGUAGES.map(l => <option key={l}>{l}</option>)}
              </select></div>
            <div><label>Time slot</label><input value={form.time_slot} onChange={e => setForm({ ...form, time_slot: e.target.value })} placeholder="e.g. Day 1, 10:00–11:00" /></div>
            <div><label>Quota (blank = unlimited)</label><input type="number" min="1" value={form.quota} onChange={e => setForm({ ...form, quota: e.target.value })} /></div>
          </div>
          <label>Judges (2–3)</label>
          <div className="cr-chips">
            {judges.map(j => (
              <label key={j.id} className={`cr-chip ${form.judge_ids.includes(j.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={form.judge_ids.includes(j.id)} onChange={() => toggleJudge(j.id)} /> {j.name}
              </label>
            ))}
            {judges.length === 0 && <span className="muted small">Add judges in the Judges tab first.</span>}
          </div>
          <button type="submit">Create program</button>
        </form>
      </div>

      <div className="card">
        <div className="cr-toolbar">
          <div className="tabs" style={{ margin: 0 }}>
            {[['all', `All (${programs.length})`], ...CATEGORIES.map(c => [c.key, `${c.label} (${programs.filter(p => p.category === c.key).length})`]),
              ...(uncategorized ? [['none', `Uncategorized (${uncategorized})`]] : [])].map(([k, l]) => (
              <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <input className="cr-search" placeholder="Search name, number, code…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="cr-scroll">
          <table>
            <thead><tr><th>#</th><th>Cat.</th><th>Name</th><th>Code</th><th>Type</th><th>Slot</th><th>Quota</th><th>Reg.</th><th>Judges</th><th></th></tr></thead>
            <tbody>
              {shown.map(p => isEditing('program', p.id) ? (
                <tr key={p.id}>
                  <td>{field('number', 'number', 70)}</td>
                  <td><select value={editing.values.category ?? ''} onChange={e => setVal('category', e.target.value)}>
                    <option value="">—</option>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></td>
                  <td>{field('name')}</td><td>{field('code', 'text', 70)}</td>
                  <td><select value={editing.values.type} onChange={e => setVal('type', e.target.value)}><option value="writing">writing</option><option value="stage">stage</option></select></td>
                  <td>{field('time_slot')}</td><td>{field('quota', 'number', 70)}</td><td>{p.registration_count}</td><td />
                  <td>
                    <button onClick={() => run(() => adminApi.updateProgram(p.id, editing.values), 'Saved')}>Save</button>
                    <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{p.number ?? '—'}</td><td>{categoryLabel(p.category) || '—'}</td><td>{p.name}</td><td>{p.code}</td><td>{p.type}</td>
                  <td>{p.time_slot || '—'}</td><td>{p.quota ?? '∞'}</td><td>{p.registration_count}</td>
                  <td>
                    <div className="cr-chips small">
                      {p.judges.map(j => (
                        <span key={j.id} className="cr-chip on">{j.name}
                          <button className="cr-x" title="Remove judge" onClick={() => run(() => adminApi.unassignJudge(p.id, j.id))}>×</button></span>
                      ))}
                      <select value="" onChange={e => e.target.value && run(() => adminApi.assignJudge(p.id, Number(e.target.value)))}>
                        <option value="">+ judge</option>
                        {judges.filter(j => !p.judges.some(x => x.id === j.id)).map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="cr-actions">
                    <button onClick={() => setEditing({ kind: 'program', id: p.id, values: { number: p.number ?? '', category: p.category ?? '', name: p.name, code: p.code, type: p.type, time_slot: p.time_slot ?? '', quota: p.quota ?? '' } })}>Edit</button>
                    <button className="secondary" onClick={() => run(() => adminApi.setPublished(p.id, !p.results_published))}>{p.results_published ? 'Unpublish' : 'Publish'}</button>
                    <button className="danger" onClick={() => window.confirm(`Delete "${programLabel(p)}" and all its registrations and scores?`) && run(() => adminApi.deleteProgram(p.id), 'Program deleted')}>Delete</button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={10} className="muted">No programs match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function JudgesTab({ judges, run, setEditing, isEditing, field, editing }) {
  const [v, setV] = useState({ name: '', code: '', password: '' });
  return (
    <div className="card">
      <h3>Judges</h3>
      <table>
        <thead><tr><th>Name</th><th>Login code</th><th>Password</th><th></th></tr></thead>
        <tbody>
          {judges.map(j => isEditing('judge', j.id) ? (
            <tr key={j.id}>
              <td>{field('name')}</td><td>{field('code')}</td><td>{field('password')}</td>
              <td><button onClick={() => run(() => adminApi.updateJudge(j.id, editing.values), 'Saved')}>Save</button>
                <button className="secondary" onClick={() => setEditing(null)}>Cancel</button></td>
            </tr>
          ) : (
            <tr key={j.id}>
              <td>{j.name}</td><td>{j.code}</td><td className="muted">••••••••</td>
              <td><button onClick={() => setEditing({ kind: 'judge', id: j.id, values: { name: j.name, code: j.code, password: '' } })}>Edit</button>
                <button className="danger" onClick={() => window.confirm(`Delete judge ${j.name}? This also removes their program assignments and submitted scores, which can change judging progress and results.`) && run(() => adminApi.deleteJudge(j.id))}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Leave the password blank when editing to keep the current one.</p>
      <h4>Add a judge</h4>
      <div className="grid-2">
        <input placeholder="Name" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} />
        <input placeholder="Login code" value={v.code} onChange={e => setV({ ...v, code: e.target.value })} />
        <input placeholder="Password" value={v.password} onChange={e => setV({ ...v, password: e.target.value })} />
      </div>
      <button onClick={() => run(async () => { await adminApi.createJudge(v); setV({ name: '', code: '', password: '' }); }, 'Judge added')}>Add judge</button>
    </div>
  );
}

function RegistrationsTab({ regs, programs, regProgram, setRegProgram, run, setEditing, isEditing, field, editing, setVal }) {
  return (
    <div className="card">
      <h3>Registrations</h3>
      <select value={regProgram} onChange={e => setRegProgram(e.target.value)}>
        <option value="">All programs</option>
        {CATEGORIES.map(c => (
          <optgroup key={c.key} label={c.label}>
            {programs.filter(p => p.category === c.key).map(p => <option key={p.id} value={p.id}>{p.number}. {p.name}</option>)}
          </optgroup>
        ))}
        {programs.some(p => !p.category) && (
          <optgroup label="Uncategorized">{programs.filter(p => !p.category).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        )}
      </select>
      <div className="cr-scroll">
        <table>
          <thead><tr><th>Code</th><th>Participant ID</th><th>Name</th><th>Student ID</th><th>Team</th><th>Source</th><th></th></tr></thead>
          <tbody>
            {regs.map(r => isEditing('reg', r.id) ? (
              <tr key={r.id}>
                <td>{r.code_letter}</td><td>{r.participant_id}</td><td>{field('student_name')}</td><td>{field('student_id', 'text', 130)}</td>
                <td><select value={editing.values.team_name ?? ''} onChange={e => setVal('team_name', e.target.value)}>
                  <option value="">—</option>{TEAMS.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}</select></td>
                <td>{r.source}</td>
                <td><button onClick={() => run(() => adminApi.updateRegistration(r.id, editing.values), 'Saved')}>Save</button>
                  <button className="secondary" onClick={() => setEditing(null)}>Cancel</button></td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{r.code_letter}</td><td>{r.participant_id}</td><td>{r.student_name}</td><td>{r.student_id}</td>
                <td><TeamBadge name={r.team_name} /></td><td>{r.source}</td>
                <td><button onClick={() => setEditing({ kind: 'reg', id: r.id, values: { student_name: r.student_name, student_id: r.student_id, team_name: r.team_name ?? '' } })}>Edit</button>
                  <button className="danger" onClick={() => window.confirm(`Delete registration ${r.participant_id}?`) && run(() => adminApi.deleteRegistration(r.id))}>Delete</button></td>
              </tr>
            ))}
            {regs.length === 0 && <tr><td colSpan={7} className="muted">No registrations.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountTab({ run }) {
  const [v, setV] = useState({ current: '', next: '' });
  return (
    <div className="card narrow">
      <h3>Change admin password</h3>
      <input type="password" placeholder="Current password" value={v.current} onChange={e => setV({ ...v, current: e.target.value })} autoComplete="current-password" />
      <input type="password" placeholder="New password (8+ characters)" value={v.next} onChange={e => setV({ ...v, next: e.target.value })} autoComplete="new-password" />
      <button onClick={() => run(async () => { await adminApi.changePassword(v.current, v.next); setV({ current: '', next: '' }); }, 'Password changed')}>Update password</button>
    </div>
  );
}
