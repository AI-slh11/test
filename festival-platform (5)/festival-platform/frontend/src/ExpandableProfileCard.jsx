import React, { useState } from 'react';

// A compact card that expands in place into a side-by-side detail view.
// Self-contained: each card tracks its own expanded state.
export default function ExpandableProfileCard({ name, role, initials, accent, bio, tags = [], photo }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`profile-card ${expanded ? 'is-expanded' : ''}`}
      style={{ '--accent': accent }}
      onClick={() => setExpanded(e => !e)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v); } }}
    >
      <div className="profile-avatar">{photo ? <img src={photo} alt={name} loading="lazy" /> : initials}</div>

      <div className="profile-basics">
        <h3>{name}</h3>
        <p className="profile-role">{role}</p>
        {!expanded && <p className="profile-hint">Tap to expand</p>}
      </div>

      <div className="profile-detail">
        <p className="profile-bio">{bio}</p>
        {tags.length > 0 && (
          <div className="profile-tags">
            {tags.map(tag => <span key={tag} className="profile-tag">{tag}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
