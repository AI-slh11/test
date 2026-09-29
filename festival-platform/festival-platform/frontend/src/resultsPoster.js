const WIDTH = 1080;
const HEIGHT = 1350;

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

export async function downloadResultsPoster({ program, winners }) {
  if (!program || !winners?.length) throw new Error('Publish at least one podium place before generating a poster.');
  const [jmn, ndsu, rendezvous, footer] = await Promise.all([
    loadImage('/brand/jmn-logo.png'),
    loadImage('/brand/ndsu-logo.png'),
    loadImage('/brand/logo-mark.png'),
    loadImage('/brand/footer-white.png')
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#062b1a');
  background.addColorStop(0.56, '#0b5734');
  background.addColorStop(1, '#062319');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(174,229,21,.11)';
  ctx.beginPath(); ctx.arc(1015, 305, 250, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(1,185,152,.12)';
  ctx.beginPath(); ctx.arc(25, 1090, 300, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);

  ctx.fillStyle = '#d5f36a';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RENDEZVOUS ’26', 66, 72);
  ctx.fillStyle = '#d2e7d8';
  ctx.font = '500 15px Arial, sans-serif';
  ctx.fillText('MARKAZUNNAJATH FESTIVAL', 66, 101);

  const logos = [jmn, ndsu, rendezvous];
  const logoX = 636;
  logos.forEach((image, index) => {
    const x = logoX + index * 136;
    // Keep the original transparent/white logo artwork on the poster itself;
    // avoid opaque tiles that clash with the green poster background.
    drawContained(ctx, image, x + 8, 36, 102, 92);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 66px Arial, sans-serif';
  ctx.fillText('PUBLISHED RESULTS', 66, 245);
  ctx.fillStyle = '#e2fa04';
  ctx.font = '700 26px Arial, sans-serif';
  const category = program.category ? ` · ${program.category.toUpperCase()}` : '';
  ctx.fillText(`PODIUM${category}`, 70, 294);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 38px Arial, sans-serif';
  wrappedText(ctx, program.name, 70, 356, 880, 46, 2);
  ctx.fillStyle = '#b9d9c5';
  ctx.font = '500 18px Arial, sans-serif';
  ctx.fillText('OFFICIAL FESTIVAL PLACEMENTS', 70, 435);

  const sorted = [...winners].sort((a, b) => a.rank - b.rank);
  const accents = { 1: '#e2fa04', 2: '#dce5e8', 3: '#e7a65c' };
  const medals = { 1: '1ST PLACE', 2: '2ND PLACE', 3: '3RD PLACE' };
  const startY = 476;
  sorted.forEach((winner, index) => {
    const y = startY + index * 224;
    const accent = accents[winner.rank] || '#e2fa04';
    ctx.fillStyle = 'rgba(255,255,255,.075)';
    ctx.beginPath(); ctx.roundRect(62, y, 956, 202, 22); ctx.fill();
    ctx.strokeStyle = `${accent}99`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(62, y, 956, 202, 22); ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(86, y + 34, 168, 48, 24); ctx.fill();
    ctx.fillStyle = '#102319';
    ctx.font = '800 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(medals[winner.rank] || `${winner.rank} PLACE`, 170, y + 65);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px Arial, sans-serif';
    const nameLines = wrappedText(ctx, winner.student_name || `Participant ${winner.code_letter || ''}`, 286, y + 70, 680, 42, 2);
    let detailY = y + 102 + (nameLines - 1) * 42;
    ctx.fillStyle = '#b9d9c5';
    ctx.font = '600 20px Arial, sans-serif';
    ctx.fillText(winner.team_name || '', 288, detailY);
    if (winner.is_team && winner.team_members) {
      ctx.font = '400 16px Arial, sans-serif';
      wrappedText(ctx, `With ${winner.team_members}`, 288, detailY + 29, 680, 22, 2);
    }
    if (winner.average_score != null) {
      ctx.textAlign = 'right';
      ctx.fillStyle = accent;
      ctx.font = '700 19px Arial, sans-serif';
      ctx.fillText(`SCORE  ${winner.average_score}`, 974, y + 169);
    }
  });

  const footerWidth = 520;
  const footerHeight = footerWidth * footer.naturalHeight / footer.naturalWidth;
  const footerY = HEIGHT - footerHeight - 42;
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
