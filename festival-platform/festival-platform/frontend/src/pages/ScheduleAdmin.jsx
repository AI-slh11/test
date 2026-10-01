import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { downloadSchedulePdf } from '../schedulePdf.js';

const blank = () => ({ title: '', schedule_date: '', start_time: '', end_time: '', venue: '', notes: '', published: false });
const timeLabel = (value) => value ? new Date(`2000-01-01T${value}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

export default function ScheduleAdmin() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank());
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => setItems(await api.organizerSchedule());
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (editingId) await api.updateScheduleItem(editingId, form);
      else await api.createScheduleItem(form);
      setForm(blank()); setEditingId(null); await load();
      setMessage('Schedule item saved.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({ title: item.title, schedule_date: item.schedule_date, start_time: item.start_time,
      end_time: item.end_time || '', venue: item.venue || '', notes: item.notes || '', published: item.published });
    setError(''); setMessage('');
    document.getElementById('schedule-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const togglePublished = async (item) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await api.updateScheduleItem(item.id, { ...item, published: !item.published });
      await load(); setMessage(item.published ? 'Schedule item unpublished.' : 'Schedule item is now public.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete “${item.title}” from the schedule?`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await api.deleteScheduleItem(item.id); await load(); setMessage('Schedule item deleted.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/schedule`); setMessage('Public schedule link copied.'); }
    catch { setError('Could not copy the link. Open /schedule and copy the address bar URL.'); }
  };

  return <div className="card schedule-admin">
    <div className="schedule-admin-head"><div><h3>Shared schedule</h3><p className="muted">Add sessions, then publish them to make them visible to everyone.</p></div>
      <div className="row-actions">
        <button className="secondary" disabled={!items.length} onClick={async () => {
          try { await downloadSchedulePdf(items); setMessage('Organizer schedule PDF downloaded.'); }
          catch (e) { setError(e.message || 'Could not download the schedule PDF.'); }
        }}>Download schedule PDF</button>
        <button className="secondary" onClick={copyLink}>Copy public schedule link</button>
      </div></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    <form id="schedule-editor" className="schedule-form" onSubmit={submit}>
      <h4>{editingId ? 'Edit schedule item' : 'Add a session'}</h4>
      <label>Session title<input required maxLength="160" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Opening ceremony" /></label>
      <div className="grid-2">
        <label>Date<input type="date" required value={form.schedule_date} onChange={e => set('schedule_date', e.target.value)} /></label>
        <label>Venue<input maxLength="200" value={form.venue} onChange={e => set('venue', e.target.value)} placeholder="Stage or room" /></label>
        <label>Start time<input type="time" required value={form.start_time} onChange={e => set('start_time', e.target.value)} /></label>
        <label>End time (optional)<input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} /></label>
      </div>
      <label>Details (optional)<textarea maxLength="1000" rows="3" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="What attendees should know" /></label>
      <label className="checkbox"><input type="checkbox" checked={form.published} onChange={e => set('published', e.target.checked)} /> Publish this item on the public schedule when saved</label>
      <div className="row-actions"><button disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add session'}</button>
        {editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setForm(blank()); }}>Cancel edit</button>}</div>
    </form>
    <h4>Schedule entries ({items.length})</h4>
    {!items.length ? <p className="muted">No sessions yet. Add the first one above.</p> : <div className="schedule-admin-list">
      {items.map(item => <article className="schedule-admin-item" key={item.id}>
        <div><strong>{item.title}</strong><p className="muted">{new Date(`${item.schedule_date}T00:00:00`).toLocaleDateString()} · {timeLabel(item.start_time)}{item.end_time ? `–${timeLabel(item.end_time)}` : ''}{item.venue ? ` · ${item.venue}` : ''}</p>
          {item.notes && <p>{item.notes}</p>}</div>
        <div className="row-actions"><span className={item.published ? 'schedule-status published' : 'schedule-status'}>{item.published ? 'Public' : 'Draft'}</span>
          <button className="secondary" disabled={busy} onClick={() => togglePublished(item)}>{item.published ? 'Unpublish' : 'Publish'}</button>
          <button className="secondary" disabled={busy} onClick={() => edit(item)}>Edit</button>
          <button className="danger" disabled={busy} onClick={() => remove(item)}>Delete</button></div>
      </article>)}
    </div>}
  </div>;
}
