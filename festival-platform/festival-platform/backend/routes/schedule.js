const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireOrganizerOrControlAdmin } = require('../sessionAuth');
const { recordAudit } = require('../audit');

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
const clean = (value, max) => String(value || '').trim().slice(0, max);

router.get('/', optionalAuth, (req, res) => {
  const organizer = req.user?.role === 'organizer' || !!req.admin;
  const rows = db.prepare(`SELECT id, title, schedule_date, start_time, end_time, venue, notes,
      published, sort_order, created_at, updated_at
    FROM schedule_items ${organizer ? '' : 'WHERE published = 1'}
    ORDER BY schedule_date, start_time, sort_order, id`).all();
  res.json(rows.map(row => ({ ...row, published: !!row.published })));
});

router.post('/', requireOrganizerOrControlAdmin, (req, res) => {
  const title = clean(req.body?.title, 160);
  const scheduleDate = clean(req.body?.schedule_date, 10);
  const startTime = clean(req.body?.start_time, 5);
  const endTime = clean(req.body?.end_time, 5);
  if (!title || !validDate(scheduleDate) || !validTime(startTime) || (endTime && !validTime(endTime))) {
    return res.status(400).json({ error: 'Enter a title, valid date and start time. End time is optional.' });
  }
  if (endTime && endTime <= startTime) return res.status(400).json({ error: 'End time must be after the start time.' });
  const result = db.prepare(`INSERT INTO schedule_items
    (title, schedule_date, start_time, end_time, venue, notes, published)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(title, scheduleDate, startTime, endTime || null,
      clean(req.body.venue, 200) || null, clean(req.body.notes, 1000) || null, req.body.published ? 1 : 0);
  recordAudit(req, 'create', 'schedule_item', result.lastInsertRowid, { title, schedule_date: scheduleDate });
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id', requireOrganizerOrControlAdmin, (req, res) => {
  const current = db.prepare('SELECT * FROM schedule_items WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Schedule item not found' });
  const b = req.body || {};
  const title = clean(b.title ?? current.title, 160);
  const scheduleDate = clean(b.schedule_date ?? current.schedule_date, 10);
  const startTime = clean(b.start_time ?? current.start_time, 5);
  const endTime = clean(b.end_time ?? current.end_time, 5);
  if (!title || !validDate(scheduleDate) || !validTime(startTime) || (endTime && !validTime(endTime))) {
    return res.status(400).json({ error: 'Enter a title, valid date and start time. End time is optional.' });
  }
  if (endTime && endTime <= startTime) return res.status(400).json({ error: 'End time must be after the start time.' });
  const published = 'published' in b ? (b.published ? 1 : 0) : current.published;
  db.prepare(`UPDATE schedule_items SET title = ?, schedule_date = ?, start_time = ?, end_time = ?,
    venue = ?, notes = ?, published = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(title, scheduleDate, startTime, endTime || null, clean(b.venue ?? current.venue, 200) || null,
      clean(b.notes ?? current.notes, 1000) || null, published, current.id);
  recordAudit(req, 'update', 'schedule_item', current.id, { title, schedule_date: scheduleDate, published: !!published });
  res.json({ ok: true });
});

router.delete('/:id', requireOrganizerOrControlAdmin, (req, res) => {
  const current = db.prepare('SELECT id, title FROM schedule_items WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Schedule item not found' });
  db.prepare('DELETE FROM schedule_items WHERE id = ?').run(current.id);
  recordAudit(req, 'delete', 'schedule_item', current.id, { title: current.title });
  res.json({ ok: true });
});

module.exports = router;
