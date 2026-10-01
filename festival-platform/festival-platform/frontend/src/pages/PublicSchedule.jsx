import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { CATEGORIES } from '../categories.js';

const timeLabel = (value) => value ? new Date(`2000-01-01T${value}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

export function ScheduleSection({ compact = false }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.publicSchedule().then(setItems).catch(e => setError(e.message)); }, []);
  const shown = compact ? items.slice(0, 4) : items;

  return <section className="public-schedule" id="schedule">
    <div className="public-schedule-head"><div><p className="eyebrow">Plan your festival</p><h2>Festival Schedule</h2><p className="muted">Sessions published by the organizers.</p></div>
      {compact && <Link className="hero-btn ghost" to="/schedule">Full schedule</Link>}
    </div>
    {error ? <p className="muted">The schedule could not be loaded right now.</p> : !shown.length ? <p className="muted">The organizers have not published any sessions yet. Please check back later.</p> :
      <div className="public-schedule-list">{shown.map(item => <article className="public-schedule-item" key={item.id}>
        <div className="public-schedule-time"><strong>{timeLabel(item.start_time)}</strong>{item.end_time && <span>to {timeLabel(item.end_time)}</span>}</div>
        <div className="public-schedule-content"><h3>{item.title}</h3><p><strong>{item.category === 'all' ? 'All categories' : CATEGORIES.find(category => category.key === item.category)?.label || 'Category not set'}</strong> · {new Date(`${item.schedule_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}{item.venue ? ` · ${item.venue}` : ''}</p>{item.notes && <p className="public-schedule-notes">{item.notes}</p>}</div>
      </article>)}</div>}
  </section>;
}

export default function PublicSchedule() {
  return <div className="container schedule-page"><Link to="/" className="schedule-back">← Home</Link><ScheduleSection /></div>;
}
