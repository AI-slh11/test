import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './App.jsx';
import { programLabel } from './categories.js';
import { api } from './api.js';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [programs, setPrograms] = useState([]);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Global open shortcut: Cmd+K (Mac) or Ctrl+K (Windows/Linux)
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Load programs lazily once, first time the palette opens
  useEffect(() => {
    if (open && programs.length === 0) {
      api.listPrograms().then(setPrograms).catch(() => {});
    }
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const close = () => {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 160);
  };

  const runAndClose = (fn) => {
    fn();
    close();
  };

  const sections = useMemo(() => {
    const navigateItems = [
      { label: 'Home', hint: 'Landing page', action: () => navigate('/') },
      { label: 'Student Registration', hint: 'Register for a program', action: () => navigate('/register') },
      { label: 'Leaderboard', hint: 'Live rankings', action: () => navigate('/leaderboard') },
      ...(user?.role === 'organizer' ? [
        { label: 'Admin Dashboard', hint: 'Counts, quotas, edit everything', action: () => navigate('/admin/dashboard') },
        { label: 'Green Room', hint: 'Organizer control panel', action: () => navigate('/green-room') },
        { label: 'Programs Admin', hint: 'Create & manage competitions', action: () => navigate('/admin/programs') }
      ] : []),
      ...(user?.role === 'judge' ? [
        { label: 'Judge Portal', hint: 'Score participants', action: () => navigate('/judge') }
      ] : []),
      ...(!user ? [{ label: 'Organizer / Judge Login', hint: 'Sign in', action: () => navigate('/login') }] : [])
    ];

    const programItems = programs.map(p => ({
      label: programLabel(p),
      hint: `${p.type === 'writing' ? 'Writing' : 'Stage'} · ${p.registration_count} registered`,
      action: () => navigate('/leaderboard')
    }));

    const accountItems = user ? [
      { label: `Logout (${user.name})`, hint: user.role, action: () => { logout(); navigate('/login'); } }
    ] : [];

    const filter = (items) => {
      if (!query.trim()) return items;
      const q = query.toLowerCase();
      return items.filter(i => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q));
    };

    return [
      { title: 'Navigate', items: filter(navigateItems) },
      { title: 'Programs', items: filter(programItems) },
      { title: 'Account', items: filter(accountItems) }
    ].filter(s => s.items.length > 0);
  }, [query, programs, user]);

  // Flatten for keyboard navigation across section boundaries
  const flatItems = useMemo(() => sections.flatMap(s => s.items), [sections]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) runAndClose(item.action);
    }
  };

  // Keep the active row scrolled into view as arrow keys move past the fold
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div className={`cmdk-overlay ${closing ? 'is-closing' : ''}`} onClick={close}>
      <div className={`cmdk-panel ${closing ? 'is-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="cmdk-icon">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search programs, pages, actions..."
            className="cmdk-input"
          />
          <kbd className="cmdk-esc">esc</kbd>
        </div>

        <div className="cmdk-list" ref={listRef}>
          {flatItems.length === 0 && <p className="cmdk-empty">No matches.</p>}
          {sections.map(section => (
            <div key={section.title} className="cmdk-section">
              <div className="cmdk-section-title">{section.title}</div>
              {section.items.map(item => {
                runningIndex += 1;
                const idx = runningIndex;
                return (
                  <div
                    key={idx}
                    data-index={idx}
                    className={`cmdk-item ${idx === activeIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runAndClose(item.action)}
                  >
                    <span className="cmdk-item-label">{item.label}</span>
                    {item.hint && <span className="cmdk-item-hint">{item.hint}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
