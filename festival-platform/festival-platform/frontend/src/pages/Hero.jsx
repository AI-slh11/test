import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import GhostFibers from '../GhostFibers.jsx';
import ExpandableProfileCard from '../ExpandableProfileCard.jsx';
import ResultsSection from '../ResultsSection.jsx';
import ScrollTextLine from '../ScrollTextLine.jsx';

const WORD = 'RENDEZVOUS';
// Festival Collective (names and roles as printed on the official Zynex poster)
const TEAM = [
  { name: 'Shanib Abdulla', role: 'Festival Coordinator', photo: '/team/shanib.jpg', accent: '#19bb47' },
  { name: 'Hashir Ashraf', role: 'Curator in Action', photo: '/team/hashir.jpg', accent: '#01b998' },
  { name: 'Sinan Majeed', role: 'Finance Officer', accent: '#aee515' },
  { name: 'Faheem Abdul Azeez', role: 'Assistant Coordinator', photo: '/team/faheem.jpg', accent: '#017d8b' },
  { name: 'Ashad Ali', role: 'Assistant Coordinator', accent: '#64d431' }
];
const POP_COLORS = ['#017d8b', '#19bb47', '#e2fa04'];

export default function Hero() {
  // Tracks which letters are mid-animation and what color they popped to,
  // so each letter reacts to its own click independently.
  const [popped, setPopped] = useState({});
  const heroRef = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 }); // normalized -1..1, drives parallax depth

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const el = heroRef.current;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      setTilt({ x, y });
    };
    const onLeave = () => setTilt({ x: 0, y: 0 });

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const hitLetter = (i) => {
    const color = POP_COLORS[Math.floor(Math.random() * POP_COLORS.length)];
    setPopped(prev => ({ ...prev, [i]: color }));
    setTimeout(() => {
      setPopped(prev => {
        const next = { ...prev };
        delete next[i];
        return next;
      });
    }, 500);
  };

  // Each layer moves at a different depth: blobs drift furthest (background),
  // the wordmark shifts subtly (mid-ground), giving a sense of depth on mouse move.
  const layerStyle = (depth) => ({
    transform: `translate3d(${tilt.x * depth}px, ${tilt.y * depth}px, 0)`
  });

  return (
    <>
    <section className="hero" ref={heroRef}>
      <GhostFibers lineColor="#19bb47" glowColor="#017d8b" layers={5} speed={0.3} waveAmplitude={38} frequency={1.4} />
      <div className="blob-parallax" style={layerStyle(22)}><div className="hero-blob blob-a" /></div>
      <div className="blob-parallax" style={layerStyle(-18)}><div className="hero-blob blob-b" /></div>
      <div className="blob-parallax" style={layerStyle(14)}><div className="hero-blob blob-c" /></div>

      <img src="/brand/logo-mark.png" alt="" className="hero-logomark" style={layerStyle(6)} />

      <p className="hero-eyebrow" style={layerStyle(4)}>Phytolore Presents</p>

      <div className="hero-word-row" style={layerStyle(8)}>
        <h1 className="hero-word" aria-label="Rendezvous">
          {WORD.split('').map((letter, i) => (
            <span
              key={i}
              className="hero-letter"
              style={popped[i] ? { color: popped[i], transform: 'translateY(-14px) scale(1.15)' } : undefined}
              onClick={() => hitLetter(i)}
            >
              {letter}
            </span>
          ))}
        </h1>
        <span className="hero-companion">26</span>
      </div>

      <p className="hero-sub">
        One stage, one page. Register for a competition, watch the judging happen
        live, and see rankings update the moment a score lands.
      </p>

      <div className="hero-glass">
        <div className="hero-actions">
          <Link to="/register" className="hero-btn primary">Register for a program</Link>
          <Link to="/leaderboard" className="hero-btn ghost">Watch the leaderboard</Link>
        </div>
      </div>
    </section>

    <ScrollTextLine />

    <div className="home-content">
    <ResultsSection limit={3} />

    <section className="team-section">
      <h2>Zynex</h2>
      <p className="team-sub">Markazunnajath Festival Collective — the team behind Rendezvous’26. Tap a card to open it.</p>
      <div className="profile-grid">
        {TEAM.map(m => (
          <ExpandableProfileCard
            key={m.name}
            name={m.name}
            role={m.role}
            photo={m.photo}
            initials={m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            accent={m.accent}
            bio={`${m.role}, Zynex — Markazunnajath Festival Collective. Rendezvous’26: Decoding Phytolore.`}
            tags={['Zynex', m.role]}
          />
        ))}
      </div>
    </section>
    </div>
    </>
  );
}
