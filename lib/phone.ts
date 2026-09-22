// Central phone number normalization utility.
//
// Goal: treat equivalent representations of the same number as equal, without
// destroying the original user-facing string.
//
// Supported cases (Pakistan by default, extensible):
//   03272488207     -> 923272488207
//   923272488207    -> 923272488207
//   +923272488207   -> 923272488207
//   00923272488207  -> 923272488207
//   3272488207      -> 923272488207
//   different formatting (spaces, hyphens, parentheses) -> stripped
//
// Non-PK numbers: leading 0 trunk prefix is stripped. No forced country code.

// Isolated country rule. Change this single constant to support another
// default country later without touching the rest of the codebase.
const DEFAULT_COUNTRY_CODE = '92'; // Pakistan

export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = String(raw).replace(/[^\d]/g, '');
  if (!s) return '';

  // Drop international dialing prefix (00)
  if (s.startsWith('00')) s = s.slice(2);

  if (s.startsWith('0')) {
    // National format with trunk prefix
    s = s.slice(1);
    if (s.length === 10 && s.startsWith('3')) {
      s = DEFAULT_COUNTRY_CODE + s;
    }
  } else if (s.length === 10 && s.startsWith('3')) {
    // Mobile number without trunk prefix
    s = DEFAULT_COUNTRY_CODE + s;
  }

  return s;
}

// Loose match: normalization + suffix comparison.
// Handles cases where one side has extra country code, or where a contact
// was saved with a different representation.
export function phonesMatch(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Suffix fallback (e.g. local vs international when country unknown)
  return na.endsWith(nb) || nb.endsWith(na);
}

// True when two numbers are the same person (for duplicate detection).
export function isDuplicatePhone(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  return phonesMatch(a, b);
}
