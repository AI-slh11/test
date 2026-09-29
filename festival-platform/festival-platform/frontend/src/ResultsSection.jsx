import { categoryLabel } from './categories.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import { socket } from './socket.js';
import { TEAMS, teamMeta } from './teams.js';
import TeamBadge from './TeamBadge.jsx';

const MEDALS = ['🥇', '🥈', '🥉'];
const POLL_MS = 30000; // safety net in case the socket is offline

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"
function timeAgo(sqliteUtc) {
  if (!sqliteUtc) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(sqliteUtc.replace(' ', 'T') + 'Z').getTime()) / 1000));
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

// Shows published results only: the team standings plus one card per published program,
// newest first. Updates by itself when a judge publishes.
//   limit  -> show only the latest N programs (home page), with a "see all" link
//   full   -> show everything (leaderboard page)
export default function ResultsSection({ limit, full = false, projector = false }) {
  const [feed, setFeed] = useState(null);
  const [fresh, setFresh] = useState({});
  const timers = useRef([]);

  const load = useCallback(() => {
    api.publicFeed().then(setFeed).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);

    const onPublished = (payload) => {
      load();
      if (payload?.program_id != null) {
        setFresh(f => ({ ...f, [payload.program_id]: true }));
        timers.current.push(setTimeout(() => {
          setFresh(f => { const n = { ...f }; delete n[payload.program_id]; return n; });
        }, 10000));
      }
    };
    socket.on('results:published', onPublished);
    socket.on('results:unpublished', load);

    return () => {
      clearInterval(poll);
      socket.off('results:published', onPublished);
      socket.off('results:unpublished', load);
      timers.current.forEach(clearTimeout);
    };
  }, [load]);

  const published = feed?.published ?? [];
  const shown = limit ? published.slice(0, limit) : published;
  const standings = feed?.standings ?? Object.fromEntries(TEAMS.map(t => [t.key, 0]));
  const [a, b] = TEAMS.map(t => standings[t.key] ?? 0);
  const total = a + b;
  const pctA = total === 0 ? 50 : (a / total) * 100;
  const leader = a === b ? null : (a > b ? TEAMS[0] : TEAMS[1]);
  const gap = Math.abs(a - b);

  return (
    <section className={`results-section${projector ? ' projector-results' : ''}`} id="results">
      <div className="results-head">
        <h2>{projector ? 'Rendezvous · Live Results' : full ? 'Results & Team Standings' : 'Live Results'}</h2>
        {projector && <button className="secondary" onClick={() => document.querySelector('.projector-results')?.requestFullscreen?.()}>Full screen</button>}
        <span className="live-pill"><span className="live-dot" />Live</span>
      </div>
      <p className="results-sub">
        Results appear here the moment a judge publishes them.
        {feed?.has_points ? ' Team points are assigned by the organizer for each program.' : ' Team points will appear after the organizer assigns them.'}
      </p>

      <div className="team-battle">
        {TEAMS.map((t, i) => (
          <div key={t.key} className={`team-side ${i === 1 ? 'right' : ''} ${leader?.key === t.key ? 'is-leading' : ''}`} style={{ '--team': t.color }}>
            <span className="team-side-label">{t.label}</span>
            <h3>{t.key}</h3>
            <div className="team-points">{i === 0 ? a : b}<small>pts</small></div>
          </div>
        ))}
        <div className="team-bar" aria-hidden="true">
          <div className="team-bar-a" style={{ width: `${pctA}%`, background: TEAMS[0].color }} />
          <div className="team-bar-b" style={{ width: `${100 - pctA}%`, background: TEAMS[1].color }} />
        </div>
        <p className="team-lead">
          {published.length === 0 ? 'Waiting for the first result…'
            : !feed?.has_points ? 'The organizer has not assigned team points yet'
            : leader ? <><strong style={{ color: leader.color }}>{leader.key}</strong> leads by {gap} {gap === 1 ? 'point' : 'points'}</>
            : 'Both teams are level'}
        </p>
      </div>

      {published.length === 0 ? (
        <div className="results-empty">
          <span className="live-dot big" />
          <p>No results published yet.</p>
          <small>Once the organizer publishes a program, its winners and any organizer-assigned team points appear here.</small>
        </div>
      ) : (
        <div className="results-grid">
          {shown.map(entry => {
            const top = entry.results.filter(r => r.rank <= 3);
            const rest = entry.results.filter(r => r.rank > 3);
            return (
              <article key={entry.program.id} className={`result-card ${fresh[entry.program.id] ? 'is-fresh' : ''}`}>
                <header className="result-card-head">
                  <div>
                    <h4>{entry.program.name}</h4>
                    <span className="result-meta">{categoryLabel(entry.program.category) && `${categoryLabel(entry.program.category)} · `}{entry.program.type === 'writing' ? 'Writing' : 'Stage'} · {timeAgo(entry.published_at)}</span>
                  </div>
                  {fresh[entry.program.id] && <span className="result-new">NEW</span>}
                </header>

                <ol className="podium">
                  {top.map(r => (
                    <li key={r.code_letter} className={`podium-row place-${Math.min(r.rank, 3)}`} style={{ '--team': teamMeta(r.team_name)?.color || '#888' }}>
                      <span className="medal">{MEDALS[r.rank - 1]}</span>
                      <div className="podium-who">
                        <strong>{r.name || `Participant ${r.code_letter}`}</strong>
                        {r.members && <small>with {r.members}</small>}
                        {r.team_points != null && <small>{r.team_points} team {r.team_points === 1 ? 'point' : 'points'}</small>}
                        <TeamBadge name={r.team_name} />
                      </div>
                      <span className="podium-score">{r.average_score}</span>
                    </li>
                  ))}
                </ol>

                {rest.length > 0 && (
                  <details className="result-rest">
                    <summary>+{rest.length} more placed</summary>
                    {rest.map(r => (
                      <div key={r.code_letter} className="rest-row">
                        <span>#{r.rank} · Participant {r.code_letter}</span>
                        <TeamBadge name={r.team_name} />
                        <span className="rest-score">{r.average_score}</span>
                      </div>
                    ))}
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!full && limit && published.length > limit && (
        <Link to="/leaderboard" className="results-more">See all {published.length} results →</Link>
      )}
    </section>
  );
}
