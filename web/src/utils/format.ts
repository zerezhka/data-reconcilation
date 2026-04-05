/**
 * Format a value for display in discrepancy tables.
 * Numbers get space-separated thousands (109990 → "109 990").
 */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (v === '') return '(empty)';

  // Try numeric formatting
  const s = String(v);
  const num = Number(s);
  if (!isNaN(num) && s.trim() !== '') {
    // Preserve decimal part
    const parts = s.split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  }

  return s;
}

/**
 * Format a delta value with sign.
 */
export function formatDelta(v: unknown): string {
  if (v === null || v === undefined) return '';
  const num = Number(v);
  if (isNaN(num)) return String(v);
  const formatted = formatValue(Math.abs(num));
  if (num > 0) return `+${formatted}`;
  if (num < 0) return `\u2212${formatted}`;
  return '0';
}
