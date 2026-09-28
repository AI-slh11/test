import React, { useEffect, useState } from 'react';
import { programLabel } from '../categories.js';
import { api } from '../api.js';
import { socket } from '../socket.js';
import { useAuth } from '../App.jsx';
import PasswordChange from '../PasswordChange.jsx';

const STATUS_LABEL = {
  registered: '🆕 NEW', submission_received: '⏳ PENDING',
  slot_assigned: '🔄 IN PROGRESS', judged: '✓ JUDGED', results_announced: '✓ JUDGED'
};

export default function JudgePortal() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState('');
  const [list, setList] = useState([]);
  const [myScores, setMyScores] = useState({});
  const [selected, setSelected] = useState(null);
  const [scoreForm, setScoreForm] = useState({ score: '', grade: 'A', remarks: '' });
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    api.programsForJudge(user.id).then(ps => {
      setPrograms(ps);
    }).catch(() => {});
    api.scoresByJudge(user.id).then(rows => {
      const map = {};
      rows.forEach(r => { map[r.registration_id] = r; });
      setMyScores(map);
    }).catch(() => {});
  }, [user.id]);

  useEffect(() => {
    if (!activeProgram) return;
    api.judgeView(activeProgram).then(setList).catch(() => {});
    socket.emit('join_program', activeProgram);

    const onNew = (payload) => {
      if (String(payload.program_id) !== String(activeProgram)) return;
      setList(prev => [...prev, payload]);
    };
    const onScore = () => {
      api.judgeView(activeProgram).then(setList).catch(() => {});
      api.scoresByJudge(user.id).then(rows => {
        const map = {};
        rows.forEach(row => { map[row.registration_id] = row; });
        setMyScores(map);
      }).catch(() => {});
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('registration:new', onNew);
    socket.on('score:submitted', onScore);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.emit('leave_program', activeProgram);
      socket.off('registration:new', onNew);
      socket.off('score:submitted', onScore);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [activeProgram]);

  const submitScore = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.submitScore({
        registration_id: selected.id, judge_id: user.id,
        score: Number(scoreForm.score), grade: scoreForm.grade, remarks: scoreForm.remarks
      });
      setMyScores(prev => ({ ...prev, [selected.id]: scoreForm }));
      setSelected(null);
      setScoreForm({ score: '', grade: 'A', remarks: '' });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Judge Portal <span className={`conn-dot ${connected ? 'ok' : 'bad'}`} title={connected ? 'Connected' : 'Disconnected'} /></h2>
      <div className="card">
        <label>Program</label>
        <select value={activeProgram} onChange={e => { setActiveProgram(e.target.value); setSelected(null); }}>
          <option value="">Select an assigned program...</option>
          {programs.map(p => <option key={p.id} value={p.id}>{programLabel(p)}</option>)}
        </select>
      </div>

      {activeProgram && (
        <div className="grid-2">
          <div className="card">
            <h3>Participants (anonymized — code letter only)</h3>
            <table>
              <thead><tr><th>Code</th><th>Status</th><th>Your Score</th><th></th></tr></thead>
              <tbody>
                {list.map(r => {
                  const mine = myScores[r.id];
                  return (
                    <tr key={r.id} className={r.status === 'registered' ? 'row-new' : ''}>
                      <td>{r.code_letter}{r.is_team ? ' (team)' : ''}</td>
                      <td>{STATUS_LABEL[r.status] || r.status}</td>
                      <td>{mine ? `${mine.score} (${mine.grade})` : '—'}</td>
                      <td>
                        {!mine && <button onClick={() => setSelected(r)}>Judge</button>}
                      </td>
                    </tr>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={4} className="muted">No participants registered yet for this program.</td></tr>}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="card">
              <h3>Score Participant {selected.code_letter}</h3>
              <form onSubmit={submitScore}>
                <label>Numerical Score (0-100)</label>
                <input type="number" min="0" max="100" step="0.5" value={scoreForm.score}
                  onChange={e => setScoreForm({ ...scoreForm, score: e.target.value })} required />
                <label>Grade</label>
                <select value={scoreForm.grade} onChange={e => setScoreForm({ ...scoreForm, grade: e.target.value })}>
                  {['A', 'B', 'C', 'D', 'F'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <label>Remarks (max 500 chars)</label>
                <textarea maxLength={500} value={scoreForm.remarks}
                  onChange={e => setScoreForm({ ...scoreForm, remarks: e.target.value })} rows={4} />
                {error && <p className="error">{error}</p>}
                <p className="muted small">Scores are final once submitted — there is no revision or appeal.</p>
                <button type="submit">Submit Final Score</button>
                <button type="button" className="secondary" onClick={() => setSelected(null)}>Cancel</button>
              </form>
            </div>
          )}
        </div>
      )}
      <PasswordChange />
    </div>
  );
}
