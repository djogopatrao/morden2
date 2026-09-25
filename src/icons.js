// Static inline-SVG icons for the toolbar buttons. Stroke-based and
// `currentColor`-tinted so each button's text color drives the icon.
// These strings are fixed markup (never user data), so assigning them
// via innerHTML is safe.

const svg = (body, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  pencil: svg('<path d="M13.5 3.5l3 3L7 16H4v-3z"/><path d="M11.5 5.5l3 3"/>'),
  fill: svg('<path d="M4 9.5L9.5 4l6 6-5.5 5.5a1.4 1.4 0 01-2 0L4 11.5a1.4 1.4 0 010-2z"/><path d="M4 10h11.5"/><path d="M17 13.5c0 1.2-.7 2-1.5 2s-1.5-.8-1.5-2 1.5-3 1.5-3 1.5 1.8 1.5 3z"/>'),
  select: svg('<rect x="3.5" y="3.5" width="13" height="13" rx="1" stroke-dasharray="2.5 2"/>'),
  cut: svg('<circle cx="5.5" cy="14.5" r="2.5"/><circle cx="14.5" cy="14.5" r="2.5"/><path d="M7.3 12.8L15 3M12.7 12.8L5 3"/>'),
  copy: svg('<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0011.5 3h-7A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13H7"/>'),
  paste: svg('<rect x="4" y="4" width="12" height="13.5" rx="1.5"/><rect x="7.5" y="2.5" width="5" height="3" rx="1"/>'),
  rotate: svg('<path d="M16 10a6 6 0 11-2-4.5"/><path d="M14.5 2.5v3.5H11"/>'),
  flipH: svg('<path d="M10 2.5v15" stroke-dasharray="2 2"/><path d="M7.5 5L2.5 15h5z"/><path d="M12.5 5l5 10h-5z"/>'),
  flipV: svg('<path d="M2.5 10h15" stroke-dasharray="2 2"/><path d="M5 7.5L15 2.5v5z"/><path d="M5 12.5l10 5v-5z"/>'),
  clear: svg('<path d="M3.5 5.5h13"/><path d="M8 5.5V3.5h4v2"/><path d="M5 5.5l1 11h8l1-11"/>'),
  undo: svg('<path d="M6.5 4.5L3 8l3.5 3.5"/><path d="M3.5 8h8a4 4 0 010 8H9"/>', 18),
  redo: svg('<path d="M13.5 4.5L17 8l-3.5 3.5"/><path d="M16.5 8h-8a4 4 0 000 8H11"/>', 18),
  chevron: svg('<path d="M6 8l4 4 4-4"/>', 12),
  close: svg('<path d="M5 5l10 10M15 5L5 15"/>', 14),
  plus: svg('<path d="M10 3.5v13M3.5 10h13"/>', 22),
  recenter: svg('<circle cx="10" cy="10" r="5"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/>', 14),
};

export const LOGO =
  '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#db6559"/><rect x="12" y="1" width="9" height="9" fill="#3eb849"/><rect x="1" y="12" width="9" height="9" fill="#5955e0"/><rect x="12" y="12" width="9" height="9" fill="#ded087"/></svg>';
