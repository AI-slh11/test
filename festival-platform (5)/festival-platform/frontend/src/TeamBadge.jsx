import React from 'react';
import { teamMeta } from './teams.js';

export default function TeamBadge({ name }) {
  const t = teamMeta(name);
  if (!t) return <span className="team-badge muted-badge">No team</span>;
  return (
    <span className="team-badge" style={{ '--team': t.color }}>
      <span className="team-badge-dot" />{t.key}
    </span>
  );
}
