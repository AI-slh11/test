import { getAuthToken } from './api.js';

export async function downloadAdminCsv(url) {
  const token = getAuthToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('Could not export registrations');
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'festival-registrations.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(field); field = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      row.push(field); field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else field += char;
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])));
}
