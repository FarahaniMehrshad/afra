const UTF16_LE_BOM0 = 0xff;
const UTF16_LE_BOM1 = 0xfe;
const UTF16_BE_BOM0 = 0xfe;
const UTF16_BE_BOM1 = 0xff;

const MOJIBAKE_RE = /[\u2500-\u259f\u00d8\u00d9\u00da\u00db\u00dc\u00de\u00c3\u00c2]/g;
const ARABIC_RE = /[\u0600-\u06ff]/g;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

// Byte 0x80..0xFF in IBM CP437 mapped to Unicode code points.
const CP437_HIGH: readonly number[] = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7, 0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec,
  0x00c4, 0x00c5, 0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9, 0x00ff, 0x00d6, 0x00dc, 0x00a2,
  0x00a3, 0x00a5, 0x20a7, 0x0192, 0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba, 0x00bf, 0x2310,
  0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb, 0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
  0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510, 0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c,
  0x255e, 0x255f, 0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567, 0x2568, 0x2564, 0x2565, 0x2559,
  0x2558, 0x2552, 0x2553, 0x256b, 0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580, 0x03b1, 0x00df,
  0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4, 0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229,
  0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248, 0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2,
  0x25a0, 0x00a0,
];

const CP437_UNICODE_TO_BYTE = new Map<number, number>(
  CP437_HIGH.map((codePoint, idx) => [codePoint, idx + 0x80]),
);

function countBy(re: RegExp, text: string): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function arabicCount(text: string): number {
  return countBy(ARABIC_RE, text);
}

function scoreTextQuality(text: string): number {
  const arabic = arabicCount(text);
  const mojibake = countBy(MOJIBAKE_RE, text);
  const controls = countBy(CONTROL_RE, text);
  const replacement = (text.match(/\ufffd/g) ?? []).length;
  return arabic * 4 - mojibake * 3 - controls * 6 - replacement * 12;
}

function decodeBytes(bytes: Uint8Array, encoding: string, fatal = false): string | null {
  try {
    return new TextDecoder(encoding, fatal ? { fatal: true } : undefined).decode(bytes);
  } catch {
    return null;
  }
}

function detectUtf16WithoutBom(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const sample = Math.min(bytes.length - (bytes.length % 2), 1024);
  if (sample < 8) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < sample; i += 2) {
    if (bytes[i] === 0) evenZero++;
    if (bytes[i + 1] === 0) oddZero++;
  }
  const pairs = sample / 2;
  if (oddZero >= pairs * 0.35 && evenZero <= pairs * 0.08) return 'utf-16le';
  if (evenZero >= pairs * 0.35 && oddZero <= pairs * 0.08) return 'utf-16be';
  return null;
}

function encodeCp437(text: string): Uint8Array | null {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp <= 0x7f) {
      out[i] = cp;
      continue;
    }
    const b = CP437_UNICODE_TO_BYTE.get(cp);
    if (b === undefined) return null;
    out[i] = b;
  }
  return out;
}

function encodeSingleByte(text: string): Uint8Array | null {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp > 0xff) return null;
    out[i] = cp;
  }
  return out;
}

function recoverUtf8FromEncodedBytes(text: string, encoder: (s: string) => Uint8Array | null): string | null {
  const bytes = encoder(text);
  if (!bytes) return null;
  return decodeBytes(bytes, 'utf-8', true);
}

function looksSuspicious(text: string): boolean {
  if (!text) return false;
  return countBy(MOJIBAKE_RE, text) > 0 || text.includes('\ufffd');
}

/**
 * Repair common mojibake forms where UTF-8 bytes were decoded using a
 * single-byte code page (windows-1252 or IBM-CP437) before reaching us.
 */
export function normalizePossiblyMojibake(text: string): string {
  if (!looksSuspicious(text)) return text;

  const baseScore = scoreTextQuality(text);
  const baseArabic = arabicCount(text);
  const candidates = [text];

  const from1252 = recoverUtf8FromEncodedBytes(text, encodeSingleByte);
  if (from1252) candidates.push(from1252);

  const from437 = recoverUtf8FromEncodedBytes(text, encodeCp437);
  if (from437) candidates.push(from437);

  let best = text;
  let bestScore = baseScore;
  for (const c of candidates) {
    const score = scoreTextQuality(c);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  const improvedArabic = arabicCount(best) > baseArabic;
  const meaningfulGain = bestScore >= baseScore + 3;
  return improvedArabic && meaningfulGain ? best : text;
}

/**
 * Decode raw file bytes using robust fallbacks for legacy exports.
 */
export function decodeJourneyText(bytes: Uint8Array): string {
  if (!bytes.length) return '';

  if (bytes.length >= 2 && bytes[0] === UTF16_LE_BOM0 && bytes[1] === UTF16_LE_BOM1) {
    return normalizePossiblyMojibake(decodeBytes(bytes, 'utf-16le') ?? '');
  }
  if (bytes.length >= 2 && bytes[0] === UTF16_BE_BOM0 && bytes[1] === UTF16_BE_BOM1) {
    return normalizePossiblyMojibake(decodeBytes(bytes, 'utf-16be') ?? '');
  }

  const utf16Guess = detectUtf16WithoutBom(bytes);
  if (utf16Guess) {
    const guessed = decodeBytes(bytes, utf16Guess);
    if (guessed !== null) return normalizePossiblyMojibake(guessed);
  }

  const utf8 = decodeBytes(bytes, 'utf-8', true);
  if (utf8 !== null) return normalizePossiblyMojibake(utf8);

  const candidates: string[] = [];
  const cp1256 = decodeBytes(bytes, 'windows-1256');
  if (cp1256 !== null) candidates.push(cp1256);
  const cp1252 = decodeBytes(bytes, 'windows-1252');
  if (cp1252 !== null) candidates.push(cp1252);
  const utf16le = decodeBytes(bytes, 'utf-16le');
  if (utf16le !== null) candidates.push(utf16le);
  const utf16be = decodeBytes(bytes, 'utf-16be');
  if (utf16be !== null) candidates.push(utf16be);

  if (!candidates.length) return '';
  let best = candidates[0];
  let bestScore = scoreTextQuality(best);
  for (let i = 1; i < candidates.length; i++) {
    const score = scoreTextQuality(candidates[i]);
    if (score > bestScore) {
      best = candidates[i];
      bestScore = score;
    }
  }
  return normalizePossiblyMojibake(best);
}
