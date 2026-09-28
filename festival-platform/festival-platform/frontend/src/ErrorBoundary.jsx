import React from 'react';

// Without this, any render error leaves the whole site blank white.
export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Site crashed:', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#0b1f14' }}>
        <h2>Something went wrong</h2>
        <p>The page hit an error while loading. Try reloading; if it keeps happening, send the message below to the site admin.</p>
        <pre style={{ background: '#eef5f0', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
