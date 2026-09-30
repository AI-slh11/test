import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { programLabel } from '../categories.js';
import TeamBadge from '../TeamBadge.jsx';
import { downloadResultsPoster, POSTER_FONTS, POSTER_TEMPLATES } from '../resultsPoster.js';

const placeNames = { 1: '1st', 2: '2nd', 3: '3rd' };

export default function OrganizerResults({ programs }) {
  const [programId, setProgramId] = useState('');
  const [review, setReview] = useState(null);
  const [places, setPlaces] = useState({});
  const [teamPoints, setTeamPoints] = useState({ 1: '', 2: '', 3: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingScore, setEditingScore] = useState(null);
  const [scoreForm, setScoreForm] = useState({ score: '', grade: 'A', remarks: '' });
  const [downloadingCertificate, setDownloadingCertificate] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingPoster, setDownloadingPoster] = useState(false);
  const [posterTemplate, setPosterTemplate] = useState('emerald');
  const [posterFont, setPosterFont] = useState('poppins');

  const loadReview = async (id = programId) => {
    if (!id) { setReview(null); setTeamPoints({ 1: '', 2: '', 3: '' }); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api.reviewResults(id);
      setReview(data);
      setTeamPoints({
        1: data.program.first_place_points ?? '',
        2: data.program.second_place_points ?? '',
        3: data.program.third_place_points ?? ''
      });
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
    if (!programId) { setReview(null); setPlaces({}); setTeamPoints({ 1: '', 2: '', 3: '' }); return; }
    loadReview(programId);
  }, [programId]);

  const participants = review?.participants || [];
  const judgeCount = review?.judges.length || 0;
  const panelSize = row => row.assigned_judge_ids?.length ?? judgeCount;
  const participantComplete = row => panelSize(row) > 0 && row.judges_submitted >= panelSize(row);
  const allJudged = participants.length > 0 && participants.every(participantComplete);
  const requiredPlaces = Math.min(3, participants.length);
  const placeValues = Object.values(places).filter(Boolean);
  const podiumComplete = requiredPlaces > 0 && placeValues.length >= requiredPlaces && placeValues.includes('1');

  const savedPlaces = useMemo(() => (review?.participants || [])
    .filter(row => row.result_place != null)
    .map(row => `${row.registration_id}:${row.result_place}`).sort().join('|'), [review]);
  const currentPlaces = Object.entries(places)
    .filter(([, place]) => place)
    .map(([id, place]) => `${id}:${place}`).sort().join('|');
  const savedTeamPoints = review ? [review.program.first_place_points, review.program.second_place_points, review.program.third_place_points]
    .map(value => value == null ? '' : String(value)).join('|') : '';
  const currentTeamPoints = [1, 2, 3].map(place => teamPoints[place] == null ? '' : String(teamPoints[place])).join('|');
  const hasUnsavedChanges = !!review && (savedPlaces !== currentPlaces || savedTeamPoints !== currentTeamPoints);

  const setParticipantPlace = (registrationId, nextPlace) => {
    setPlaces(current => {
      const next = { ...current, [registrationId]: nextPlace };
      if (!nextPlace) delete next[registrationId];
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
      const points = Object.fromEntries([1, 2, 3].map(place => [place, teamPoints[place] === '' ? null : Number(teamPoints[place])]));
      await api.setResultPlaces(programId, placements, points);
      await loadReview(programId);
      setMessage(review?.program.results_published
        ? 'Published places updated on the public leaderboard.'
        : 'Places saved. Review them, then publish when every participant has been judged.');
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

  const saveScore = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.updateScore(editingScore.id, { ...scoreForm, score: Number(scoreForm.score) });
      setEditingScore(null);
      await loadReview(programId);
      setMessage('Scorecard updated. The program average and rankings were recalculated.');
    } catch (e) {
      setError(e.message || 'Could not update scorecard.');
    } finally { setSaving(false); }
  };

  const generateCertificate = async (winner) => {
    setDownloadingCertificate(winner.registration_id);
    setError('');
    try {
      await api.downloadCertificate(programId, winner.registration_id);
    } catch (e) {
      setError(e.message || 'Could not generate certificate.');
    } finally { setDownloadingCertificate(null); }
  };

  const generateAllCertificates = async () => {
    const winners = participants.filter(row => row.result_place != null)
      .map(row => ({ ...row, place: `${row.result_place}-place` }));
    setDownloadingAll(true); setError('');
    try { await api.downloadCertificatesZip(programId, winners); setMessage(`Downloaded ${winners.length} winner certificates in one ZIP file.`); }
    catch (e) { setError(e.message || 'Could not generate certificates.'); }
    finally { setDownloadingAll(false); }
  };

  const generatePoster = async () => {
    setDownloadingPoster(true); setError('');
    try {
      const winners = participants.filter(row => row.result_place != null)
        .map(row => ({ ...row, rank: Number(row.result_place) }));
      await downloadResultsPoster({ program: review.program, winners, template: posterTemplate, font: posterFont });
      setMessage('Published results poster downloaded.');
    } catch (e) { setError(e.message || 'Could not generate the results poster.'); }
    finally { setDownloadingPoster(false); }
  };

  const tiedScores = participants.filter(row => row.average_score != null)
    .reduce((groups, row) => groups.set(row.average_score, [...(groups.get(row.average_score) || []), row]), new Map());
  const ties = [...tiedScores.values()].filter(group => group.length > 1 && group.some(row => Number(row.result_place) <= 3 || !row.result_place));

  return (
    <section className="organizer-results">
      <div className="card">
        <h3>Judge results and podium</h3>
        <p className="muted">Review each judge’s score and remarks. Assign 1st, 2nd and 3rd place; multiple students may share a place.</p>
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
              <button className="secondary" disabled={saving || !hasUnsavedChanges} onClick={savePlaces}>
                {saving ? 'Saving…' : review.program.results_published ? 'Save published changes' : 'Save places'}
              </button>
              {review.program.results_published ? (
                <button className="danger" disabled={saving} onClick={() => publish(false)}>Unpublish results</button>
              ) : (
                <button disabled={saving || hasUnsavedChanges || !allJudged || !podiumComplete} onClick={() => publish(true)}>
                  {saving ? 'Publishing…' : 'Publish results'}
                </button>
              )}
            </div>
          </div>

          {!judgeCount && <p className="error">Assign at least one judge to this program before placing or publishing results.</p>}
          {participants.some(participant => !participant.code_assigned) && <p className="error">Assign a performance code to every registered student in Green Room before scoring, placing, or publishing.</p>}
          {ties.map(group => <p className="error" role="alert" key={group.map(row => row.registration_id).join('-')}>
            Tie alert: {group.map(row => row.participant_id).join(' and ')} have the same average ({group[0].average_score}). You may assign them the same place or use your tie-break decision.
          </p>)}
          {participants.length > 0 && !allJudged && judgeCount > 0 && (
            <p className="muted">You can save draft places as scorecards arrive. Publishing unlocks after every assigned judge has scored every participant.</p>
          )}
          {!review.program.results_published && !podiumComplete && participants.length > 0 && (
            <p className="muted">Assign podium places to at least {requiredPlaces} participant{requiredPlaces === 1 ? '' : 's'}, including at least one 1st-place winner. Multiple participants may share a place.</p>
          )}

          <div className="card">
            <h3>Organizer-assigned team points</h3>
            <p className="muted">Set the points awarded to the winning team for each place in this program. There are no preset values; leave a field blank if no points should be awarded.</p>
            <div className="grid-2">
              {[1, 2, 3].map(place => (
                <label key={place}>{placeNames[place]} place points
                  <input type="number" min="0" max="10000" step="1" inputMode="numeric"
                    value={teamPoints[place]}
                    onChange={event => { setTeamPoints(current => ({ ...current, [place]: event.target.value })); setMessage(''); }}
                    placeholder="No points assigned" />
                </label>
              ))}
            </div>
          </div>

          {review.program.results_published && (
            <div className="card">
              <h3>Winner certificates</h3>
              <p className="muted">Generate a personalized PDF certificate for each published podium winner.</p>
              <div className="grid-2">
                {[1, 2, 3].map(place => {
                  const winners = participants.filter(row => Number(row.result_place) === place);
                  return (
                    <div className="card" key={place}>
                      <h4>{placeNames[place]} place</h4>
                      {winners.length ? winners.map(winner => <div className="winner-certificate" key={winner.registration_id}>
                        <p><strong>{winner.student_name}</strong></p>
                        <p className="muted">{winner.participant_id} · {programLabel(review.program)}</p>
                        <button disabled={downloadingCertificate != null} onClick={() => generateCertificate(winner)}>
                          {downloadingCertificate === winner.registration_id ? 'Generating…' : `Generate for ${winner.student_name}`}
                        </button>
                      </div>) : <p className="muted">No winners assigned to this place.</p>}
                    </div>
                  );
                })}
              </div>
              <button disabled={downloadingAll || downloadingCertificate != null || ![1,2,3].some(place => participants.some(row => Number(row.result_place) === place))}
                onClick={generateAllCertificates}>{downloadingAll ? 'Preparing certificates…' : 'Download all winner certificates (ZIP)'}</button>
              <div className="grid-2" style={{ marginTop: 18 }}>
                <label>Poster template
                  <select value={posterTemplate} onChange={event => setPosterTemplate(event.target.value)}>
                    {POSTER_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </label>
                <label>Poster font
                  <select value={posterFont} onChange={event => setPosterFont(event.target.value)}>
                    {POSTER_FONTS.map(font => <option key={font.id} value={font.id}>{font.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="secondary" disabled={downloadingPoster || ![1,2,3].some(place => participants.some(row => Number(row.result_place) === place))}
                onClick={generatePoster}>{downloadingPoster ? 'Generating poster…' : 'Download published results poster (PNG)'}</button>
            </div>
          )}

          {participants.length ? (
            <div className="results-admin-table-wrap">
              <table className="results-admin-table">
                <thead>
                  <tr><th>Participant</th><th>Team</th><th>Judge scorecards</th><th>Average</th><th>Progress</th><th>Place</th></tr>
                </thead>
                <tbody>
                  {participants.map(participant => {
                    const complete = participantComplete(participant);
                    return (
                      <tr key={participant.registration_id}>
                        <td>
                          <strong>{participant.code_assigned ? `${participant.code_letter} · ${participant.participant_id}` : 'Awaiting organizer code assignment'}</strong>
                          <small>{participant.student_name}{participant.is_team && participant.team_members ? ` · ${participant.team_members}` : ''}</small>
                        </td>
                        <td><TeamBadge name={participant.team_name} /></td>
                        <td>
                          <div className="judge-score-list">
                            {review.judges.map(judge => {
                              const score = scoreFor(participant, judge.id);
                              const assignedToStudent = participant.assigned_judge_ids?.includes(Number(judge.id));
                              return (
                                <div key={judge.id} className="judge-score-item">
                                  <strong>{judge.name}:</strong>{' '}
                                  {score ? <>
                                    {score.score}/100 ({score.grade}){score.remarks ? <small>{score.remarks}</small> : null}
                                    {!score.active && <small className="muted">Historical score · excluded from this student’s average</small>}
                                    {score.active && <button className="secondary" disabled={saving} onClick={() => {
                                      setEditingScore(score);
                                      setScoreForm({ score: String(score.score), grade: score.grade, remarks: score.remarks || '' });
                                    }}>Edit score</button>}
                                  </> : assignedToStudent ? <span className="muted">Awaiting score</span> : <span className="muted">Not assigned to this student</span>}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td>{participant.average_score ?? '—'}</td>
                        <td>{participant.judges_submitted}/{judgeCount} {complete ? '✓' : ''}</td>
                        <td>
                          <select
                            aria-label={`Place for ${participant.participant_id || participant.student_name}`}
                            value={places[participant.registration_id] || ''}
                            disabled={!participant.code_assigned || participant.judges_submitted === 0}
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
          {editingScore && (
            <form className="card" onSubmit={saveScore}>
              <h4>Correct scorecard · {editingScore.judge_name}</h4>
              <label>Score (0–100)</label>
              <input type="number" min="0" max="100" step="0.5" required value={scoreForm.score}
                onChange={e => setScoreForm(current => ({ ...current, score: e.target.value }))} />
              <label>Grade</label>
              <select value={scoreForm.grade} onChange={e => setScoreForm(current => ({ ...current, grade: e.target.value }))}>
                {['A', 'B', 'C', 'D', 'F'].map(grade => <option key={grade} value={grade}>{grade}</option>)}
              </select>
              <label>Remarks (up to 500 characters)</label>
              <textarea maxLength={500} rows={3} value={scoreForm.remarks}
                onChange={e => setScoreForm(current => ({ ...current, remarks: e.target.value }))} />
              <p className="muted small">This recalculates the program average and rankings. If results are published, the public results update when you save.</p>
              <button disabled={saving}>{saving ? 'Saving…' : 'Save scorecard'}</button>
              <button type="button" className="secondary" disabled={saving} onClick={() => setEditingScore(null)}>Cancel</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
