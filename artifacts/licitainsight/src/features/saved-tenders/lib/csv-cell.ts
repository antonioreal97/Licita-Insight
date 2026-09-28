/** Quoting separates columns; the apostrophe also prevents spreadsheet formula execution. */
export function csvCell(value: string | number | null): string {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
