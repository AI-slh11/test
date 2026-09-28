// An infinite auto-scrolling ticker line. Renders the items twice back-to-back
// and animates a translateX loop, so the seam is invisible as it repeats.
export default function ScrollTextLine({
  items = ['RENDEZVOUS 26', 'DECODING PHYTOLORE', 'JAMIA MADEENATHUNNOOR LIFE FESTIVAL'],
  speed = 28
}) {
  const track = [...items, ...items];
  return (
    <div className="scroll-textline" style={{ '--marquee-duration': `${speed}s` }}>
      <div className="scroll-textline-track">
        {track.map((text, i) => (
          <span className="scroll-textline-item" key={i}>
            {text}
            <span className="scroll-textline-dot" aria-hidden="true">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
