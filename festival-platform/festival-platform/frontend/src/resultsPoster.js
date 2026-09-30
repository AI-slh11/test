const WIDTH = 1080;
const BASE_HEIGHT = 1350;

export const POSTER_TEMPLATES = [
  { id: 'emerald', name: 'Emerald Classic' },
  { id: 'royal', name: 'Royal Blue' },
  { id: 'ivory', name: 'Ivory Editorial' },
  { id: 'crimson', name: 'Crimson Gala' },
  { id: 'midnight', name: 'Midnight Constellation' },
  { id: 'ocean', name: 'Ocean Waves' },
  { id: 'sunset', name: 'Sunset Festival' },
  { id: 'orchid', name: 'Orchid Royale' },
  { id: 'monochrome', name: 'Monochrome Luxe' },
  { id: 'saffron', name: 'Saffron Heritage' }
];

export const POSTER_FONTS = [
  { id: 'poppins', name: 'Poppins', family: 'Poppins, Arial, sans-serif' },
  { id: 'inter', name: 'Inter', family: 'Inter, Arial, sans-serif' },
  { id: 'anton', name: 'Anton', family: 'Anton, Impact, sans-serif' },
  { id: 'georgia', name: 'Georgia', family: 'Georgia, serif' }
];

const THEMES = {
  emerald: {
    gradient: ['#062b1a', '#0b5734', '#062319'], glow: 'rgba(174,229,21,.11)', glow2: 'rgba(1,185,152,.12)',
    title: '#ffffff', brand: '#d5f36a', secondary: '#b9d9c5', card: 'rgba(255,255,255,.075)',
    medal: { 1: '#e2fa04', 2: '#dce5e8', 3: '#e7a65c' }, medalText: '#102319', border: 'rgba(255,255,255,.12)', footerBand: null, motif: 'circles'
  },
  royal: {
    gradient: ['#10172e', '#253d78', '#10152b'], glow: 'rgba(246,196,83,.14)', glow2: 'rgba(107,142,245,.12)',
    title: '#ffffff', brand: '#f3cf70', secondary: '#d0d9f2', card: 'rgba(255,255,255,.08)',
    medal: { 1: '#f3cf70', 2: '#dce5e8', 3: '#d99658' }, medalText: '#17203a', border: 'rgba(255,255,255,.18)', footerBand: null, motif: 'geometry'
  },
  ivory: {
    gradient: ['#fffaf0', '#efe8d7', '#fffdf7'], glow: 'rgba(184,140,47,.10)', glow2: 'rgba(11,87,52,.08)',
    title: '#163b2b', brand: '#8a681e', secondary: '#425f50', card: 'rgba(255,255,255,.72)',
    medal: { 1: '#c69b36', 2: '#aab3b5', 3: '#c67d43' }, medalText: '#ffffff', border: 'rgba(22,59,43,.22)', footerBand: '#073522', motif: 'editorial'
  },
  crimson: {
    gradient: ['#300d1d', '#711f36', '#280916'], glow: 'rgba(246,205,134,.12)', glow2: 'rgba(220,79,110,.12)',
    title: '#fffaf2', brand: '#f1ca86', secondary: '#f0ccd5', card: 'rgba(255,255,255,.075)',
    medal: { 1: '#f1ca86', 2: '#dce5e8', 3: '#e7a65c' }, medalText: '#3a1624', border: 'rgba(255,255,255,.16)', footerBand: null, motif: 'ornamental'
  },
  midnight: {
    gradient: ['#090d22', '#20294f', '#090b18'], glow: 'rgba(135,170,255,.15)', glow2: 'rgba(193,143,255,.12)',
    title: '#ffffff', brand: '#b9d7ff', secondary: '#c3cce8', card: 'rgba(255,255,255,.07)',
    medal: { 1: '#f3d27b', 2: '#dce5e8', 3: '#d99658' }, medalText: '#19213b', border: 'rgba(185,215,255,.22)', footerBand: null, motif: 'stars'
  },
  ocean: {
    gradient: ['#062c3e', '#087e8b', '#062536'], glow: 'rgba(93,235,224,.14)', glow2: 'rgba(78,177,220,.12)',
    title: '#f5ffff', brand: '#8df1e5', secondary: '#c0e2e8', card: 'rgba(255,255,255,.075)',
    medal: { 1: '#ffe18b', 2: '#dce5e8', 3: '#f1a975' }, medalText: '#073641', border: 'rgba(141,241,229,.25)', footerBand: null, motif: 'waves'
  },
  sunset: {
    gradient: ['#321848', '#a53f54', '#ed8749'], glow: 'rgba(255,211,139,.14)', glow2: 'rgba(255,131,100,.15)',
    title: '#fffaf5', brand: '#ffd184', secondary: '#f5d6d0', card: 'rgba(255,255,255,.09)',
    medal: { 1: '#ffdc76', 2: '#e3e4e6', 3: '#ffb06b' }, medalText: '#4d2434', border: 'rgba(255,222,180,.22)', footerBand: null, motif: 'waves'
  },
  orchid: {
    gradient: ['#251033', '#632b70', '#190e2c'], glow: 'rgba(247,174,226,.14)', glow2: 'rgba(173,127,255,.13)',
    title: '#fff8ff', brand: '#ffc3ed', secondary: '#e5cfe9', card: 'rgba(255,255,255,.075)',
    medal: { 1: '#ffd17f', 2: '#e1d9e7', 3: '#e8a16e' }, medalText: '#3b1d42', border: 'rgba(255,195,237,.22)', footerBand: null, motif: 'ornamental'
  },
  monochrome: {
    gradient: ['#111315', '#34383b', '#0b0c0d'], glow: 'rgba(235,239,241,.11)', glow2: 'rgba(170,180,187,.10)',
    title: '#ffffff', brand: '#f0f0ed', secondary: '#c7cccf', card: 'rgba(255,255,255,.065)',
    medal: { 1: '#f0f0ed', 2: '#cbd1d4', 3: '#aeb6ba' }, medalText: '#181a1b', border: 'rgba(240,240,237,.2)', footerBand: null, motif: 'editorial'
  },
  saffron: {
    gradient: ['#171b32', '#283454', '#101525'], glow: 'rgba(255,172,73,.14)', glow2: 'rgba(247,215,126,.10)',
    title: '#fffaf0', brand: '#ffc15c', secondary: '#d8d9e0', card: 'rgba(255,255,255,.07)',
    medal: { 1: '#ffcf57', 2: '#dce5e8', 3: '#ed9a55' }, medalText: '#29233a', border: 'rgba(255,193,92,.24)', footerBand: null, motif: 'geometry'
  }
};

function drawThemeDecoration(ctx, theme, height) {
  ctx.save();
  if (theme.motif === 'circles') {
    ctx.fillStyle = theme.glow;
    ctx.beginPath(); ctx.arc(1015, 305, 250, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = theme.glow2;
    ctx.beginPath(); ctx.arc(25, 1090, 300, 0, Math.PI * 2); ctx.fill();
  } else if (theme.motif === 'geometry') {
    ctx.fillStyle = theme.glow;
    ctx.beginPath(); ctx.moveTo(WIDTH, 140); ctx.lineTo(WIDTH, 580); ctx.lineTo(720, 360); ctx.closePath(); ctx.fill();
    ctx.fillStyle = theme.glow2;
    ctx.beginPath(); ctx.moveTo(0, height - 500); ctx.lineTo(360, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = theme.border; ctx.lineWidth = 2;
    for (let offset = 0; offset < 5; offset++) {
      ctx.beginPath(); ctx.moveTo(WIDTH - 230 + offset * 34, 145); ctx.lineTo(WIDTH - 30 + offset * 34, 345); ctx.stroke();
    }
  } else if (theme.motif === 'editorial') {
    ctx.strokeStyle = theme.border; ctx.lineWidth = 3;
    ctx.strokeRect(46, 46, WIDTH - 92, height - 92);
    ctx.fillStyle = theme.glow;
    ctx.fillRect(64, 170, 12, 245);
    ctx.fillRect(WIDTH - 76, height - 350, 12, 245);
    ctx.beginPath(); ctx.arc(WIDTH - 100, 245, 150, 0, Math.PI * 2); ctx.stroke();
  } else if (theme.motif === 'ornamental') {
    ctx.strokeStyle = theme.glow; ctx.lineWidth = 3;
    [118, 150, 182].forEach(radius => {
      ctx.beginPath(); ctx.arc(WIDTH - 28, 300, radius, Math.PI * 0.55, Math.PI * 1.55); ctx.stroke();
      ctx.beginPath(); ctx.arc(28, height - 280, radius, -Math.PI * 0.45, Math.PI * 0.45); ctx.stroke();
    });
    ctx.strokeStyle = theme.glow2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(66, 145); ctx.lineTo(250, 145); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(WIDTH - 250, height - 145); ctx.lineTo(WIDTH - 66, height - 145); ctx.stroke();
  } else if (theme.motif === 'waves') {
    ctx.fillStyle = theme.glow;
    ctx.beginPath(); ctx.moveTo(0, height - 290); ctx.bezierCurveTo(270, height - 420, 530, height - 140, WIDTH, height - 310); ctx.lineTo(WIDTH, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = theme.glow2; ctx.lineWidth = 5;
    [0, 1, 2].forEach(index => {
      const y = height - 235 + index * 30;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(290, y - 90, 650, y + 80, WIDTH, y - 30); ctx.stroke();
    });
  } else if (theme.motif === 'stars') {
    ctx.fillStyle = theme.glow;
    for (let index = 0; index < 65; index++) {
      const x = (index * 173 + 37) % WIDTH;
      const y = (index * 257 + 91) % height;
      const radius = index % 7 === 0 ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = theme.glow2; ctx.lineWidth = 2;
    [[150, 165], [900, 520], [170, 940], [820, 1180]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
    });
  }
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, WIDTH - 48, height - 48);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A poster logo could not be loaded. Refresh the page and try again.'));
    image.src = src;
  });
}

function drawContained(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else line = candidate;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  return lines.length;
}

export async function downloadResultsPoster({ program, winners, template = 'emerald', font = 'poppins' }) {
  if (!program || !winners?.length) throw new Error('Publish at least one podium place before generating a poster.');
  const [jmn, ndsu, rendezvous, footer] = await Promise.all([
    loadImage('/brand/jmn-logo.png'),
    loadImage('/brand/ndsu-logo.png'),
    loadImage('/brand/logo-mark.png'),
    loadImage('/brand/footer-white.png')
  ]);

  const theme = THEMES[template] || THEMES.emerald;
  const fontFamily = POSTER_FONTS.find(item => item.id === font)?.family || POSTER_FONTS[0].family;
  await document.fonts?.load(`700 32px ${fontFamily}`);
  const podiumGroups = [1, 2, 3].map(rank => ({
    rank,
    winners: winners.filter(winner => Number(winner.rank) === rank)
  })).filter(group => group.winners.length);
  const startY = 476;
  const cardGap = 22;
  const cardHeights = podiumGroups.map(group => 202 + (group.winners.length - 1) * 90);
  const footerWidth = 520;
  const footerHeight = footerWidth * footer.naturalHeight / footer.naturalWidth;
  const cardsHeight = cardHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, podiumGroups.length - 1) * cardGap;
  const HEIGHT = Math.max(BASE_HEIGHT, startY + cardsHeight + 30 + footerHeight + 72);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, theme.gradient[0]);
  background.addColorStop(0.56, theme.gradient[1]);
  background.addColorStop(1, theme.gradient[2]);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawThemeDecoration(ctx, theme, HEIGHT);

  ctx.fillStyle = theme.brand;
  ctx.font = `700 22px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.fillText('RENDEZVOUS ’26', 66, 72);
  ctx.fillStyle = theme.secondary;
  ctx.font = `500 15px ${fontFamily}`;
  ctx.fillText('MARKAZUNNAJATH FESTIVAL', 66, 101);

  const logos = [jmn, ndsu, rendezvous];
  const logoX = 694;
  logos.forEach((image, index) => {
    const x = logoX + index * 114;
    // Keep the original transparent/white logo artwork on the poster itself;
    // avoid opaque tiles that clash with the green poster background.
    drawContained(ctx, image, x, 36, 102, 92);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = theme.title;
  ctx.font = `800 66px ${fontFamily}`;
  ctx.fillText('PUBLISHED RESULTS', 66, 245);
  ctx.fillStyle = theme.brand;
  ctx.font = `700 26px ${fontFamily}`;
  const category = program.category ? ` · ${program.category.toUpperCase()}` : '';
  ctx.fillText(`PODIUM${category}`, 70, 294);
  ctx.fillStyle = theme.title;
  ctx.font = `700 38px ${fontFamily}`;
  wrappedText(ctx, program.name, 70, 356, 880, 46, 2);
  ctx.fillStyle = theme.secondary;
  ctx.font = `500 18px ${fontFamily}`;
  ctx.fillText('OFFICIAL FESTIVAL PLACEMENTS', 70, 435);

  const accents = theme.medal;
  const medals = { 1: '1ST PLACE', 2: '2ND PLACE', 3: '3RD PLACE' };
  let y = startY;
  podiumGroups.forEach((group, index) => {
    const cardHeight = cardHeights[index];
    const accent = accents[group.rank] || '#e2fa04';
    ctx.fillStyle = theme.card;
    ctx.beginPath(); ctx.roundRect(62, y, 956, cardHeight, 22); ctx.fill();
    ctx.strokeStyle = `${accent}99`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(62, y, 956, cardHeight, 22); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(86, y + 34, 168, 48, 24); ctx.fill();
    ctx.fillStyle = theme.medalText;
    ctx.font = `800 18px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(medals[group.rank] || `${group.rank} PLACE`, 170, y + 65);

    const rowHeight = cardHeight / group.winners.length;
    group.winners.forEach((winner, winnerIndex) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.title;
      if (group.winners.length === 1) {
        ctx.font = `700 36px ${fontFamily}`;
        const nameLines = wrappedText(ctx, winner.student_name || `Participant ${winner.code_letter || ''}`, 286, y + 70, 680, 42, 2);
        const detailY = y + 102 + (nameLines - 1) * 42;
        ctx.fillStyle = theme.secondary;
        ctx.font = `600 20px ${fontFamily}`;
        ctx.fillText(winner.team_name || '', 288, detailY);
        if (winner.is_team && winner.team_members) {
          ctx.font = `400 16px ${fontFamily}`;
          wrappedText(ctx, `With ${winner.team_members}`, 288, detailY + 29, 680, 22, 2);
        }
        return;
      }

      const rowTop = y + winnerIndex * rowHeight;
      const nameSize = Math.max(17, Math.min(30, rowHeight * 0.24));
      const nameY = rowTop + Math.max(nameSize + 10, rowHeight * 0.53);
      ctx.font = `700 ${nameSize}px ${fontFamily}`;
      wrappedText(ctx, winner.student_name || `Participant ${winner.code_letter || ''}`, 286, nameY, 680, nameSize + 5, 1);
      ctx.fillStyle = theme.secondary;
      ctx.font = `600 ${Math.max(13, Math.min(18, nameSize * 0.56))}px ${fontFamily}`;
      ctx.fillText(`${winner.team_name || ''}${winner.is_team && winner.team_members ? ` · ${winner.team_members}` : ''}`, 288, nameY + Math.max(20, nameSize * 0.78));
    });
    y += cardHeight + cardGap;
  });

  const footerY = HEIGHT - footerHeight - 72;
  if (theme.footerBand) {
    ctx.fillStyle = theme.footerBand;
    ctx.fillRect(0, footerY - 12, WIDTH, footerHeight + 24);
  }
  ctx.drawImage(footer, (WIDTH - footerWidth) / 2, footerY, footerWidth, footerHeight);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The poster image could not be created.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rendezvous-${String(program.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-results.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
