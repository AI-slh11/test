export const CATEGORIES = [
  { key: 'premier', label: 'Premier' },
  { key: 'junior', label: 'Junior' }
];
export const categoryLabel = (key) => CATEGORIES.find(c => c.key === key)?.label || '';

// "Essay Malayalam" exists in both categories, so always show the category next to the name.
export const programLabel = (p) =>
  p.category ? `${categoryLabel(p.category)} · ${p.number ? `#${p.number} ` : ''}${p.name}` : p.name;
