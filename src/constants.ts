/**
 * Cross-cutting constants used by the diff / merge pipeline and the UI.
 * Centralising these means the noise heuristic, identity keys and colours
 * change in a single, discoverable place.
 */

export const ID_KEYS = ['Id', 'ID', '$id', 'Guid', 'GUID'] as const;

/** Keys / paths whose value churn is generally noise (revisions, timestamps). */
export const NOISE_RE = /(uid|guid|revision|lastload|lasttime|timestamp)/i;

/** Bare GUID pattern — used to spot lines that only differ by an id. */
export const GUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The empty GUID we treat as "not really set". */
export const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

export const ACCENT = '#4f8dfd';

export const COLORS = {
  add: '#7ee0b0',
  remove: '#f0a0aa',
  modify: '#e8c67d',
  addBg: 'rgba(52,170,120,0.13)',
  removeBg: 'rgba(226,90,105,0.12)',
  modifyBg: 'rgba(224,176,84,0.10)',
  addWordBg: 'rgba(52,170,120,0.30)',
  removeWordBg: 'rgba(226,90,105,0.30)',
  addChip: '#3fae7d',
  removeChip: '#e2707c',
  modifyChip: '#dcae57',
  addPanelBd: 'rgba(52,170,120,0.30)',
  addPanelBg: 'rgba(52,170,120,0.09)',
  removePanelBd: 'rgba(226,90,105,0.30)',
  removePanelBg: 'rgba(226,90,105,0.08)',
  modifyPanelBd: 'rgba(224,176,84,0.28)',
  modifyPanelBg: 'rgba(224,176,84,0.07)',
} as const;

/** Row height for the two virtual-ish diff panes. */
export const ROW_HEIGHT = 20;

/** Names required inside a valid journey folder. */
export const JOURNEY_INDEX = 'journey.jsonl';
export const JOURNEY_MARKDOWN = 'journey.md';

/** Recognised file suffixes we pull off disk. Anything else is ignored. */
export const READABLE_EXTS = /\.(json|jsonl|md|txt)$/i;
