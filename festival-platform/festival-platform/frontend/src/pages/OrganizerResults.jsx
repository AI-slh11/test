import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { programLabel } from '../categories.js';
import TeamBadge from '../TeamBadge.jsx';

const placeNames = { 1: '1st', 2: '2nd', 3: '3rd' };

export default function OrganizerResults({ programs }) {
  const [programId, setProgramId] = useState('');
  const [review, setReview] = useState(null);
  const [places, setPlaces] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadReview = async (id = programId) => {
    if (!id) { setReview(null); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.reviewResults(id);
      setReview(data);
      setPlaces(Object.fromEntries(data.participants
        .filter(row => row.result_place != null)
        .map(row => [row.registration_id, String(row.result_place)])));
    } catch (e) {
      setReview(null);
      setError(e.message || 'Could not load judge results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMessage('');
    if (!programId) { setReview(null); setPlaces({}); return; }
    loadReview(programId);
  }, [programId]);

  const participants = review?.participants || [];
  const judgeCount = review?.judges.length || 0;
  const allJudged = participants.length > 0 && judgeCount > 0
    && participants.every(row => row.judges_submitted >= judgeCount);
  const requiredPlaces = Math.min(3, participants.length);
  const placeValues = Object.values(places).filter(Boolean);
  const podiumComplete = requiredPlaces > 0
    && Array.from({ length: requiredPlaces }, (_, index) => String(index + 1)).every(place => placeValues.includes(place));

  const savedPlaces = useMemo(() => (review?.participants || [])
    .filter(row => row.result_place != null)
    .map(row => `${row.registration_id}:${row.result_place}`).sort().join('|'), [review]);
  const currentPlaces = Object.entries(places)
    .filter(([, place]) => place)
    .map(([id, place]) => `${id}:${place}`).sort().join('|');
  const hasUnsavedChanges = !!review && savedPlaces !== currentPlaces;

  const setParticipantPlace = (registrationId, nextPlace) => {
    setPlaces(current => {
      const next = { ...current, [registrationId]: nextPlace };
      if (!nextPlace) delete next[registrationId];
      else Object.keys(next).forEach(id => {
        if (id !== String(registrationId) && next[id] === nextPlace) delete next[id];
      });
      return next;
    });
    setMessage('');
  };

  const savePlaces = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const placements = Object.entries(places).filter(([, place]) => place)
        .map(([registration_id, place]) => ({ registration_id: Number(registration_id), place: Number(place) }));
      await api.setResultPlaces(programId, placements);
      await loadReview(programId);
      setMessage('Places saved. Review them, then publish when every participant has been judged.');
    } catch (e) {
      setError(e.message || 'Could not save places.');
    } finally {
      setSaving(false);
    }
  };

  const publish = async (published) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.setPublished(programId, published);
      await loadReview(programId);
      setMessage(published ? 'Results published to the public leaderboard.' : 'Results unpublished. You can now edit places.');
    } catch (e) {
      setError(e.message || 'Could not update publication status.');
    } finally {
      setSaving(false);
    }
  };

  const scoreFor = (participant, judgeId) => participant.scores.find(score => score.judge_id === judgeId);

  return (
    <section className="organizer-results">
      <div className="card">
        <h3>Judge results and podium</h3>
        <p className="muted">Review each judge’s score and remarks. Assign 1st, 2nd and 3rd place, then publish the approved results to the public leaderboard.</p>
        <label htmlFor="results-program">Program</label>
        <select id="results-program" value={programId} onChange={e => setProgramId(e.target.value)}>
          <option value="">Select a program...</option>
          {programs.map(program => (
            <option key={program.id} value={program.id}>
              {programLabel(program)}{program.results_published ? ' · Published' : ''}
            </option>
          ))}
        </select>
        {loading && <p className="muted" role="status">Loading scorecards…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
      </div>

      {review && !loading && (
        <div className="card">
          <div className="results-admin-head">
            <div>
              <h3>{programLabel(review.program)}</h3>
              <p className="muted">{participants.length} participants · {judgeCount} assigned judges · {review.program.results_published ? 'Published' : 'Draft'}</p>
            </div>
            <div className="results-admin-actions">
              {review.program.results_published ? (
                <button className="secondary" disabled={saving} onClick={() => publish(false)}>Unpublish to edit</button>
              ) : (
                <>
                  <button className="secondary" disabled={saving || !hasUnsavedChanges} onClick={savePlaces}>{saving ? 'Saving…' : 'Save places'}</button>
                  <button disabled={saving || hasUnsavedChanges || !allJudged || !podiumComplete} onClick={() => publish(true)}>
                    {saving ? 'Publishing…' : 'Publish results'}
                  </button>
                </>
              )}
            </div>
          </div>

          {!judgeCount && <p className="error">Assign at least one judge to this program before placing or publishing results.</p>}
          {participants.length > 0 && !allJudged && judgeCount > 0 && (
            <p className="muted">Publishing is available after every assigned judge has submitted a score for every participant.</p>
          )}
          {!review.program.results_published && !podiumComplete && participants.length > 0 && (
            <p className="muted">Assign the first {requiredPlaces} place{requiredPlaces === 1 ? '' : 's'} before publishing.</p>
          )}

          {participants.length ? (
            <div className="results-admin-table-wrap">
              <table className="results-admin-table">
                <thead>
                  <tr><th>Participant</th><th>Team</th><th>Judge scorecards</th><th>Average</th><th>Progress</th><th>Place</th></tr>
                </thead>
                <tbody>
                  {participants.map(participant => {
                    const complete = judgeCount > 0 && participant.judges_submitted >= judgeCount;
                    return (
                      <tr key={participant.registration_id}>
                        <td>
                          <strong>{participant.code_letter} · {participant.participant_id}</strong>
                          <small>{participant.student_name}{participant.is_team && participant.team_members ? ` · ${participant.team_members}` : ''}</small>
                        </td>
                        <td><TeamBadge name={participant.team_name} /></td>
                        <td>
                          <div className="judge-score-list">
                            {review.judges.map(judge => {
                              const score = scoreFor(participant, judge.id);
                              return (
                                <div key={judge.id} className="judge-score-item">
                                  <strong>{judge.name}:</strong>{' '}
                                  {score ? <>{score.score}/100 ({score.grade}){score.remarks ? <small>{score.remarks}</small> : null}</> : <span className="muted">Awaiting score</span>}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td>{participant.average_score ?? '—'}</td>
                        <td>{participant.judges_submitted}/{judgeCount} {complete ? '✓' : ''}</td>
                        <td>
                          <select
                            aria-label={`Place for ${participant.participant_id}`}
                            value={places[participant.registration_id] || ''}
                            disabled={!!review.program.results_published || !complete}
                            onChange={e => setParticipantPlace(participant.registration_id, e.target.value)}
                          >
                            <option value="">Not placed</option>
                            {Object.entries(placeNames).map(([place, name]) => (
                              <option key={place} value={place}>{name} place</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="muted">No registrations for this program yet.</p>}
        </div>
      )}
    </section>
  );
}

