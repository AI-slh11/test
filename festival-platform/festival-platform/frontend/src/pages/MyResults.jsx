import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { programLabel } from '../categories.js';
import TeamBadge from '../TeamBadge.jsx';
import { downloadResultsPoster } from '../resultsPoster.js';

const places = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place' };
const statusLabels = {
  registered: 'Registered',
  submission_received: 'Submission received',
  slot_assigned: 'Slot assigned',
  judged: 'Judging complete',
  results_announced: 'Results published'
};

export default function MyResults() {
  const [studentId, setStudentId] = useState('');
  const [registrations, setRegistrations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alertsOn, setAlertsOn] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [downloadingCertificate, setDownloadingCertificate] = useState(null);
  const [certificateError, setCertificateError] = useState(null);
  const [downloadingPoster, setDownloadingPoster] = useState(null);
  const [posterError, setPosterError] = useState(null);
  const knownResults = useRef(new Set());

  useEffect(() => {
    if (!alertsOn || !studentId) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const data = await api.studentRegistrations(studentId);
        if (!active) return;
        const ready = data.registrations.filter(item => item.results_published && item.result);
        for (const item of ready) {
          const key = `${item.participant_id}:${item.result.rank}`;
          if (!knownResults.current.has(key)) {
            knownResults.current.add(key);
            setAlertMessage(`New result: ${item.program.name} — ${places[item.result.rank] || `Rank ${item.result.rank}`}`);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Festival result published', { body: `${item.program.name}: ${places[item.result.rank] || `Rank ${item.result.rank}`}` });
            }
          }
        }
      } catch { /* The page stays usable while the API reconnects. */ }
    };
    const timer = window.setInterval(refresh, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [alertsOn, studentId]);

  const lookup = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setRegistrations(null);
    try {
      const data = await api.studentRegistrations(studentId);
      setRegistrations(data.registrations);
      knownResults.current = new Set(data.registrations.filter(item => item.results_published && item.result)
        .map(item => `${item.participant_id}:${item.result.rank}`));
    } catch (err) {
      setError(err.message || 'Could not look up your programs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadCertificate = async (item) => {
    setDownloadingCertificate(item.registration_id);
    setCertificateError(null);
    try {
      await api.downloadStudentCertificate(item.registration_id, studentId);
    } catch (err) {
      setCertificateError({ registrationId: item.registration_id, message: err.message || 'Could not generate your certificate.' });
    } finally {
      setDownloadingCertificate(null);
    }
  };

  const downloadPoster = async (item) => {
    setDownloadingPoster(item.registration_id);
    setPosterError(null);
    try {
      await downloadResultsPoster({
        program: item.program,
        winners: [{
          rank: item.result.rank,
          student_name: item.student_name,
          team_name: item.team_name,
          team_members: item.team_members,
          is_team: item.is_team,
          code_letter: item.code_letter
        }]
      });
    } catch (err) {
      setPosterError({ registrationId: item.registration_id, message: err.message || 'Could not generate your poster.' });
    } finally {
      setDownloadingPoster(null);
    }
  };

  return (
    <section className="student-results-page">
      <div className="card narrow">
        <h2>My Programs &amp; Results</h2>
        <p className="muted">Enter the Student ID you used when registering to see your programs and published results.</p>
        <form onSubmit={lookup}>
          <label htmlFor="student-results-id">Student ID</label>
          <input
            id="student-results-id"
            value={studentId}
            onChange={event => setStudentId(event.target.value.toUpperCase())}
            placeholder="e.g. 2023CSE001"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            pattern="\d{4}[A-Za-z]{2,3}\d{3}"
            title="Enter 4 digits, 2–3 letters, and 3 digits"
            maxLength={10}
            required
          />
          <p className="muted small">Use the same ID you entered on the registration form.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Find my programs'}</button>
        </form>
        {registrations?.length > 0 && <div className="card"><h3>Result alerts</h3>
          <p className="muted small">Keep this page open to check for newly published results. Browser notifications require permission.</p>
          {alertMessage && <p className="success" role="status">{alertMessage}</p>}
          <button type="button" className={alertsOn ? 'secondary' : ''} onClick={async () => {
            if (alertsOn) { setAlertsOn(false); return; }
            if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
            setAlertsOn(true);
          }}>{alertsOn ? 'Turn off result alerts' : 'Notify me when results are published'}</button>
        </div>}
      </div>

      {registrations && (
        <div className="student-results-list" aria-live="polite">
          {registrations.length === 0 ? (
            <div className="card student-results-empty">
              <h3>No registrations found</h3>
              <p className="muted">Check the Student ID and try again. It must match the ID used during registration.</p>
            </div>
            ) : registrations.map((item, index) => (
            <article className="card student-result-card" key={item.participant_id || `${item.program.id}-${index}`}>
              <div className="student-result-heading">
                <div>
                  <h3>{programLabel(item.program)}</h3>
                  <p className="muted">{item.program.type === 'writing' ? 'Writing' : 'Stage'} program</p>
                </div>
                <TeamBadge name={item.team_name} />
              </div>
              {item.code_assigned ? <><p><strong>Performance code:</strong> {item.code_letter}</p><p><strong>Participant ID:</strong> {item.participant_id}</p></>
                : <p className="muted">A performance code is waiting for organizer assignment.</p>}
              <p><strong>Registration:</strong> {statusLabels[item.registration_status] || 'Registered'}</p>
              {item.results_published ? (
                item.result ? (
                  <div className="student-final-result">
                    <strong>{places[item.result.rank] || `Rank ${item.result.rank}`}</strong>
                    <span>Average score: {item.result.average_score ?? '—'}</span>
                  </div>
                ) : <p className="muted">Results are published, but no final score is available for this entry.</p>
              ) : <p className="muted">Final results have not been published yet.</p>}
              {item.results_published && item.result && item.result.rank <= 3 && <button type="button" disabled={downloadingCertificate != null}
                onClick={() => downloadCertificate(item)}>
                {downloadingCertificate === item.registration_id ? 'Generating certificate…' : 'Download my certificate'}
              </button>}
              {item.results_published && item.result && item.result.rank <= 3 && <button type="button" className="secondary"
                disabled={downloadingPoster != null} onClick={() => downloadPoster(item)}>
                {downloadingPoster === item.registration_id ? 'Generating poster…' : 'Download my results poster'}
              </button>}
              {posterError?.registrationId === item.registration_id && <p className="error" role="alert">{posterError.message}</p>}
              {certificateError?.registrationId === item.registration_id && <p className="error" role="alert">{certificateError.message}</p>}
            </article>
          ))}
        </div>
      )}
      <p className="muted small student-results-privacy">For privacy, enter your own Student ID. Individual judge scorecards are not shown here.</p>
    </section>
  );
}
