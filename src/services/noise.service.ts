import { GUID_RE, NOISE_RE } from '@/constants';

/**
 * "Noise" is churn that the application produces without the user asking
 * for it — regenerated GUIDs, revision counters, timestamps. The user can
 * mute noise so the meaningful diff floats to the top.
 */

/** Is this raw JSON line a noise line? */
export function isNoiseLine(txt: string | null | undefined): boolean {
  if (!txt) return false;
  const m = /^\s*"([^"]+)"\s*:/.exec(txt);
  if (m && NOISE_RE.test(m[1])) return true;
  return GUID_RE.test(txt);
}

/** Does this flattened JSON path look like it points at a noise field? */
export function isNoisePath(p: string): boolean {
  const k = p.split('/').pop() ?? '';
  return NOISE_RE.test(k) || /^\$?id$/i.test(k) || GUID_RE.test(k);
}
