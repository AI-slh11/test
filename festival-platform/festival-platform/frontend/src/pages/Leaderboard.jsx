import React from 'react';
import ResultsSection from '../ResultsSection.jsx';

export default function Leaderboard({ live = false }) {
  return <ResultsSection full projector={live} />;
}
