export type ImportedGuest = {
  name: string;
  host: string;
  type: string;
  allocation: number;
  note?: string;
};

export function allocationFor(name: string) {
  const match = name.match(/\+\s*(\d+)/);
  return 1 + (match ? Number(match[1]) : 0);
}

export function guestFromLine(line: string, type: string): ImportedGuest | null {
  const parts = line.split(/\t|\||\s[–—-]\s/).map((part) => part.trim()).filter(Boolean);
  const name = parts[0];
  if (!name || name.length < 2) return null;
  return {
    name,
    type: type.trim() || 'Guestlist',
    host: parts[1] || 'PDA',
    note: parts.slice(2).join(' · '),
    allocation: allocationFor(name),
  };
}

export function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

export function parseTabularRows(rows: unknown[][]): ImportedGuest[] {
  const headers = (rows[0] ?? []).map((cell) => String(cell ?? '').trim());
  const nameIndex = headers.findIndex((header) => /^(guest\s*)?name$/i.test(header));

  // A conventional table has one Name column and optional metadata columns.
  if (nameIndex >= 0) {
    const typeIndex = headers.findIndex((header) => /^(type|list|category)$/i.test(header));
    const hostIndex = headers.findIndex((header) => /^(host|added by|promoter)$/i.test(header));
    const noteIndex = headers.findIndex((header) => /^(note|comment|info)$/i.test(header));
    return rows.slice(1).map((row) => {
      const name = String(row[nameIndex] ?? '').trim();
      if (!name) return null;
      return {
        name,
        type: String(row[typeIndex] ?? '').trim() || 'Guestlist',
        host: String(row[hostIndex] ?? '').trim() || 'PDA',
        note: String(row[noteIndex] ?? '').trim(),
        allocation: allocationFor(name),
      };
    }).filter(Boolean) as ImportedGuest[];
  }

  // Door-list workbooks usually use one list per column. Every populated header
  // is the exact list label; blank spacer columns and empty columns are ignored.
  const categoryColumns = headers
    .map((header, index) => ({
      index,
      type: header,
      hasGuests: Boolean(header) && rows.slice(1).some((row) => String(row[index] ?? '').trim()),
    }))
    .filter((column) => column.hasGuests);

  return rows.slice(1).flatMap((row) => categoryColumns
    .map(({ index, type }) => guestFromLine(String(row[index] ?? '').trim(), type))
    .filter(Boolean) as ImportedGuest[]);
}

export function typeClass(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes('skip')) return 'type-skip-list';
  if (normalized.includes('soli') || normalized.includes('solid')) return 'type-solid-list';
  if (normalized.includes('guest')) return 'type-guestlist';
  return 'type-other';
}
