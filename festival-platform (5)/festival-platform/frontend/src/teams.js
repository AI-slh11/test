// Team 1 and Team 2 — colors come from the Rendezvous'26 gradient palette.
export const TEAMS = [
  { key: 'Aliora',  label: 'Team 1', color: '#01b998' },   // teal
  { key: 'Nexiora', label: 'Team 2', color: '#aee515' }    // lime
];

export const teamMeta = (name) => TEAMS.find(t => t.key === name);
