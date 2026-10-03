import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TEAMS } from '../teams.js';
import { CATEGORIES, programLabel } from '../categories.js';

const isGroupProgram = program => /\b(qawwali|group\s+song|quiz|nasheeda?)\b/i.test(String(program?.name || ''));

export default function Register() {
  const [programs, setPrograms] = useState([]);
  const [category, setCategory] = useState('');
  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [form, setForm] = useState({
    program_id: '', student_name: '', student_id: '', team_name: '', is_team: false, team_members: '', language: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadState, setLoadState] = useState('loading'); // loading | ok | failed
  const [teamLeaderMode, setTeamLeaderMode] = useState(false);
  const [leader, setLeader] = useState({ name: '', student_id: '' });
  const [roster, setRoster] = useState([{ student_name: '', student_id: '' }]);
  const [submissionReport, setSubmissionReport] = useState([]);
  const [completedPairs, setCompletedPairs] = useState({});
  const [groupMembers, setGroupMembers] = useState([]);
  const [stageCount, setStageCount] = useState(null);

  useEffect(() => {
    api.listPrograms().then(p => { setPrograms(p); setLoadState('ok'); }).catch(() => setLoadState('failed'));
  }, []);

  const categoryPrograms = programs.filter(p => category === 'general' ? !p.category : p.category === category);
  const selectedPrograms = selectedProgramIds.map(id => programs.find(p => String(p.id) === String(id))).filter(Boolean);
  const requiresGroupRoster = selectedPrograms.some(isGroupProgram);
  const needsLanguage = selectedPrograms.some(program => program.type === 'writing' && !program.language);
  useEffect(() => {
    if (requiresGroupRoster && !groupMembers.length) setGroupMembers([{ student_id: '', student_name: '', lookup: '' }]);
  }, [requiresGroupRoster, groupMembers.length]);
  const lookupStageCount = async value => {
    const studentId = String(value || '').trim().toUpperCase();
    if (!/^\d{4}[A-Z]{2,3}\d{3}$/.test(studentId)) { setStageCount(null); return; }
    try { setStageCount({ studentId, ...(await api.individualStageCount(studentId)) }); }
    catch { setStageCount(null); }
  };
  const updateGroupMember = (index, changes) => setGroupMembers(current => current.map((member, i) => i === index ? { ...member, ...changes } : member));
  const lookupGroupMember = async (index) => {
    const studentId = String(groupMembers[index]?.student_id || '').trim().toUpperCase();
    if (!/^\d{4}[A-Z]{2,3}\d{3}$/.test(studentId)) return;
    updateGroupMember(index, { student_id: studentId, lookup: 'loading' });
    try {
      const student = await api.lookupStudent(studentId);
      updateGroupMember(index, { student_id: student.student_id, student_name: student.student_name, team_name: student.team_name, lookup: 'found' });
    } catch (err) {
      updateGroupMember(index, { lookup: 'missing', ...(err.message.includes('Student not found') ? {} : { lookup_error: err.message }) });
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSubmissionReport([]);
    setMessage(''); setSubmitting(true);
    try {
      if (!selectedPrograms.length) throw new Error('Choose at least one program.');
      const report = [];
      const successfulPairs = { ...completedPairs };
      if (teamLeaderMode) {
        if (requiresGroupRoster) throw new Error('Qawwali, Group Song, Quiz, and Nasheeda are group programs. Turn off team leader roster mode and register the performers together as one group entry.');
        const entries = roster.filter(row => row.student_name.trim() || row.student_id.trim());
        if (!entries.length) throw new Error('Add at least one student to the roster.');
        const ids = entries.map(row => row.student_id.trim().toUpperCase());
        if (new Set(ids).size !== ids.length) throw new Error('The roster has a duplicate Student ID. Correct it before submitting.');
        for (const student of entries) {
          for (const program of selectedPrograms) {
            const pairKey = `${student.student_id.trim().toUpperCase()}|${program.id}`;
            if (successfulPairs[pairKey]) continue;
            try {
              const { registration } = await api.register({ ...form, ...student, program_id: program.id, language: form.language || program.language || '', source: 'online', team_leader_name: leader.name, team_leader_id: leader.student_id });
              successfulPairs[pairKey] = true;
              report.push({ student: student.student_name || student.student_id, program: programLabel(program), registration });
            } catch (err) { report.push({ student: student.student_name || student.student_id, program: programLabel(program), error: err.message }); }
          }
        }
      } else {
        const needsGroupMembers = form.is_team || requiresGroupRoster;
        const additionalMembers = needsGroupMembers ? groupMembers : [];
        if (needsGroupMembers && additionalMembers.length < 1) throw new Error('Add at least one other group member and enter their Student ID.');
        const memberIds = additionalMembers.map(member => String(member.student_id || '').trim().toUpperCase());
        if (memberIds.includes(String(form.student_id).trim().toUpperCase()) || new Set(memberIds).size !== memberIds.length) {
          throw new Error('Each student must have a different Student ID.');
        }
        const studentKey = String(form.student_id).trim().toUpperCase();
        for (const program of selectedPrograms) {
          const pairKey = `${studentKey}|${program.id}`;
          if (successfulPairs[pairKey]) continue;
          try {
            const groupEntry = form.is_team || isGroupProgram(program);
            const { registration } = await api.register({ ...form, is_team: groupEntry, program_id: program.id,
              team_roster: groupEntry ? additionalMembers.map(({ student_id, student_name }) => ({ student_id, student_name })) : [],
              language: form.language || program.language || '', source: 'online' });
            successfulPairs[pairKey] = true;
            report.push({ student: form.student_name, program: programLabel(program), registration });
          } catch (err) { report.push({ student: form.student_name, program: programLabel(program), error: err.message }); }
        }
      }
      setCompletedPairs(successfulPairs);
      setSubmissionReport(report);
      const totalPairs = (teamLeaderMode ? roster.filter(row => row.student_name.trim() || row.student_id.trim()).length : 1) * selectedPrograms.length;
      const succeeded = report.some(entry => entry.registration);
      const allSelectedCompleted = (teamLeaderMode
        ? roster.filter(row => row.student_name.trim() || row.student_id.trim()).every(student => selectedPrograms.every(program => successfulPairs[`${student.student_id.trim().toUpperCase()}|${program.id}`]))
        : selectedPrograms.every(program => successfulPairs[`${String(form.student_id).trim().toUpperCase()}|${program.id}`]));
      if (allSelectedCompleted && totalPairs > 0) {
        setMessage(`${totalPairs} registration${totalPairs === 1 ? '' : 's'} saved successfully.`);
        setSelectedProgramIds([]);
        setCompletedPairs({});
        if (teamLeaderMode) setRoster([{ student_name: '', student_id: '' }]);
        else setForm(current => ({ ...current, student_name: '', student_id: '', is_team: false, team_members: '', language: '' }));
      } else if (succeeded) {
        setMessage('Some registrations were saved. Failed program/student pairs are listed below; submit again to retry only those pairs.');
      }
    } catch (err) {
      setError(err.message);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="card narrow">
      <h2>Student Registration</h2>
      <p className="muted">Same form for stage & writing programs. Open to all campus members.</p>
      <form onSubmit={submit}>
        <label className="checkbox"><input type="checkbox" checked={teamLeaderMode} onChange={event => { setTeamLeaderMode(event.target.checked); setError(''); setSubmissionReport([]); setCompletedPairs({}); }} /> I’m a team leader registering multiple students</label>
        <label>Category</label>
        <div className="team-choice">
          {CATEGORIES.map(c => (
            <label key={c.key} className={`team-option ${category === c.key ? 'selected' : ''}`}>
              <input type="radio" name="category" value={c.key} checked={category === c.key}
                onChange={() => { setCategory(c.key); setSelectedProgramIds([]); setForm({ ...form, program_id: '', language: '' }); setSubmissionReport([]); }} required />
              <strong>{c.label}</strong>
            </label>
          ))}
        </div>

        <label>Programs (select one or more)</label>
        {!category && <p className="muted small">Choose a category first.</p>}
        {categoryPrograms.map(program => {
          const isSelected = selectedProgramIds.includes(String(program.id));
          const isFull = program.quota != null && Number(program.registration_count) >= Number(program.quota);
          return <label className="checkbox" key={program.id}>
            <input type="checkbox" checked={isSelected} disabled={!isSelected && isFull}
              onChange={event => {
                setSelectedProgramIds(current => event.target.checked
                  ? [...current, String(program.id)]
                  : current.filter(id => id !== String(program.id)));
                setSubmissionReport([]); setMessage('');
              }} />
            <span>{program.number ? `${program.number}. ` : ''}{program.name}{program.time_slot ? ` — ${program.time_slot}` : ''}{isFull ? ' · Registration full' : ''}</span>
          </label>;
        })}
        {!!selectedPrograms.length && <p className="muted small">Selected {selectedPrograms.length} program{selectedPrograms.length === 1 ? '' : 's'}. Each registration is saved separately; if one fails, the others remain saved and only failed selections will retry.</p>}
        <p className="muted small">Individual participants may register for up to 5 Stage programs. Group entries do not count toward this limit.</p>
        {teamLeaderMode && requiresGroupRoster && <p className="error small" role="alert">One or more selected programs require a group entry. Turn off team leader roster mode and register the performers together.</p>}

        {selectedPrograms.length > 0 && <p className="muted small">The organizers will assign performance codes after registration. You can check your programs and results later using My Results.</p>}

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
          onBlur={e => lookupStageCount(e.target.value)}
          pattern="\d{4}[A-Za-z]{2,3}\d{3}"
          title="4 digits, 2-3 letters, 3 digits — e.g. 2023CSE001"
          placeholder="e.g. 2023CSE001"
          maxLength={10}
          required
        />
        <p className="muted small">Format: 4 digits, 2–3 letters, 3 digits. You're registered instantly — no approval needed.</p>
        {stageCount?.studentId === form.student_id.trim().toUpperCase() && !form.is_team && !requiresGroupRoster && <p className={stageCount.remaining === 0 ? 'error small' : 'muted small'} role="status">
          Individual Stage programs: {stageCount.count} of 5 registered; {stageCount.remaining} remaining.
        </p>}

        {requiresGroupRoster ? <p className="muted small">This selection includes a group program. Add every other performer below; the registration will be saved as a group entry.</p> : <label className="checkbox">
          <input type="checkbox" checked={form.is_team} onChange={e => { const checked = e.target.checked; setForm({ ...form, is_team: checked }); if (checked && !groupMembers.length) setGroupMembers([{ student_id: '', student_name: '', lookup: '' }]); }} />
          Group entry (more than one performer)
        </label>}
        {(form.is_team || requiresGroupRoster) && (
          <>
            <p className="muted small">Enter each member’s Student ID to look up their existing details. If they aren’t registered yet, enter their name and Student ID when prompted.</p>
            {groupMembers.map((member, index) => <div className="card" key={index}>
              <h4>Group member {index + 1}</h4>
              <label>Student ID</label>
              <input value={member.student_id} onChange={event => updateGroupMember(index, { student_id: event.target.value.toUpperCase(), student_name: '', lookup: '' })}
                onBlur={() => lookupGroupMember(index)} pattern="\d{4}[A-Za-z]{2,3}\d{3}" placeholder="e.g. 2023CSE001" required />
              {member.lookup === 'loading' && <p className="muted small">Looking up student…</p>}
              {member.lookup === 'found' && <p className="success small">{member.student_name}{member.team_name ? ` · ${member.team_name}` : ''}</p>}
              {member.lookup === 'missing' && <>
                {member.lookup_error ? <p className="error small">{member.lookup_error}</p> : <p className="error small">Student not found. Enter their full name and Student ID.</p>}
                <label>Full name</label>
                <input value={member.student_name} onChange={event => updateGroupMember(index, { student_name: event.target.value })} required />
              </>}
              {groupMembers.length > 1 && <button type="button" className="danger" onClick={() => setGroupMembers(current => current.filter((_, i) => i !== index))}>Remove member</button>}
            </div>)}
            {groupMembers.length < 24 && <button type="button" className="secondary" onClick={() => setGroupMembers(current => [...current, { student_id: '', student_name: '', lookup: '' }])}>Add group member</button>}
          </>
        )}
        </>}

        {needsLanguage && (
          <>
            <label>Language</label>
            <input value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
              placeholder="e.g. English, Hindi, Malayalam" required />
            <p className="muted small">Writing submissions (essay/story files) are uploaded on-site or emailed to organizers ahead of the festival in this MVP.</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Registering…' : teamLeaderMode ? 'Register student roster' : 'Register'}</button>
      </form>

      {submissionReport.length > 0 && <div className="success-box" role="status">
        <strong>Registration summary</strong>
        {submissionReport.map((entry, index) => <p className={entry.error ? 'error' : 'success'} key={`${entry.student}-${entry.program}-${index}`}>
          {entry.student} · {entry.program}: {entry.error ? `Not registered — ${entry.error}` : 'Registered; organizer code pending'}
        </p>)}
        <p className="muted small">Successful registrations are saved individually and are not removed if another selected program has an issue.</p>
      </div>}
    </div>
  );
}
