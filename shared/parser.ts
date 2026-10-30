import {
  addDays,
  localISO,
  validDate,
  today,
  laterDate,
  general,
  nameKey,
  nextSlot,
  type Lot,
} from './domain';
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function parseDate(input: string, day = today()): string | null {
  const s = input.toLowerCase().trim();
  if (validDate(s)) return s;
  if (s === 'today') return day;
  if (s === 'tomorrow') return addDays(day, 1);
  const d = new Date(day + 'T12:00:00');
  const weekday = s.replace(/^next /, '');
  const w = weekdays.findIndex((value) => value === weekday || value.slice(0, 3) === weekday);
  if (w >= 0) {
    let delta = (w - d.getDay() + 7) % 7;
    if (s.startsWith('next ') && delta === 0) delta = 7;
    return addDays(day, delta);
  }
  const m = s.match(/^([a-z]+) (\d{1,2})(?:,? (\d{4}))?$/);
  if (!m) return null;
  const month = months.findIndex((x) => x === m[1] || x.slice(0, 3) === m[1]);
  if (month < 0) return null;
  let y = m[3] ? Number(m[3]) : d.getFullYear();
  let value = `${y}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (!validDate(value)) return null;
  if (!m[3] && value < day) value = `${++y}${value.slice(4)}`;
  return validDate(value) ? value : null;
}
export function parseLotInput(input: string, day = today()) {
  let s = input.trim().replace(/\s+/g, ' ');
  let quoted = '';
  const q = s.match(/^"([^"]+)"/);
  if (q) {
    quoted = q[1];
    s = s.slice(q[0].length).trim();
  }
  const warnings: string[] = [];
  let startOn: string | null = null,
    endExclusive: string | null = null,
    capacity: number | null = null,
    duration: number | null = null;
  const clauses = [
    ...s.matchAll(
      /\b(starting|from|for|until|through|max|limit|with)\s+(.+?)(?=\s+\b(?:starting|from|for|until|through|max|limit|with)\b|$)/gi,
    ),
  ];
  const seen = new Set<string>();
  for (const m of clauses) {
    const word = m[1].toLowerCase(),
      value = m[2].trim().replace(/\s+lot$/i, '');
    const category = ['starting', 'from'].includes(word)
      ? 'start'
      : ['until', 'through'].includes(word)
        ? 'end'
        : ['max', 'limit', 'with'].includes(word)
          ? 'capacity'
          : 'duration';
    if (seen.has(category)) warnings.push(`Repeated ${category} clause`);
    seen.add(category);
    if (category === 'start') {
      startOn = parseDate(value, day);
      if (!startOn) warnings.push(`Choose an exact start for “${value}”`);
    }
    if (category === 'end') {
      const end = parseDate(value, day);
      if (end) endExclusive = addDays(end, 1);
      else warnings.push(`Choose an exact end for “${value}”`);
    }
    if (category === 'duration') {
      const v = value.match(/^(\d+|one|two|three|four) (days?|weeks?)$/i);
      if (v) {
        const n = Number(v[1]) || ({ one: 1, two: 2, three: 3, four: 4 }[v[1] as 'one'] ?? 0);
        duration = n * (v[2].startsWith('week') ? 7 : 1);
        if (duration <= 0 || duration > 36500)
          warnings.push('Choose a positive duration up to 100 years');
      } else warnings.push('Use a whole number of days or weeks');
    }
    if (category === 'capacity') {
      const v = value.match(word === 'with' ? /^(-?\d+) spots?$/ : /^(-?\d+)$/);
      if (v && Number(v[1]) >= 1 && Number(v[1]) <= 99) capacity = Number(v[1]);
      else warnings.push('Capacity must be 1–99');
    }
  }
  if (duration && duration > 0 && duration <= 36500) {
    startOn ??= day;
    const end = addDays(startOn, duration);
    if (endExclusive && endExclusive !== end) warnings.push('Duration and end date disagree');
    else endExclusive = end;
  }
  if (startOn && endExclusive && endExclusive <= startOn) warnings.push('End must follow start');
  const name = (quoted || s.slice(0, clauses[0]?.index ?? s.length).replace(/\s+lot$/i, ''))
    .trim()
    .replace(/\s+/g, ' ');
  if (!name) warnings.push('Give this lot a name');
  return { name, startOn, endExclusive, capacity, capacityPolicy: 'soft' as const, warnings };
}
export function parseIdeaInput(original: string, day = today()) {
  const literal = original.trim().replace(/\s+/g, ' ');
  const empty = { title: literal, revisitOn: null, datePrecision: null };
  if (/^".*"$/s.test(literal)) return { ...empty, title: literal.slice(1, -1) };
  const weekday =
    '(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)';
  const month = '(?:' + months.map((m) => m + '|' + m.slice(0, 3)).join('|') + ')';
  const exact = `(?:today|tomorrow|(?:next )?${weekday}|\\d{4}-\\d{2}-\\d{2}|${month} \\d{1,2}(?:,? \\d{4})?)`;
  const pattern = `(?:${exact}|next week|next month|someday|in \\d+ (?:days?|weeks?)|(?:in|after) ${month}|on ${exact})`;
  // Dates at either edge are intentional; deadline phrases and quoted names stay literal.
  const trailing = literal.match(new RegExp(`\\s+(${pattern})[.!]?$`, 'i'));
  const leading = trailing
    ? null
    : literal.match(new RegExp(`^(${pattern})(?:[, :] +| +)(.+)$`, 'i'));
  if (
    leading &&
    !/^(?:today|tomorrow|on |next |in )/i.test(leading[1]) &&
    !new RegExp(`^${pattern}[,:]`, 'i').test(literal)
  )
    return empty;
  const match = trailing ?? leading;
  if (!match) return empty;
  if (
    trailing &&
    /\b(?:by|before|after|until|starting|from|in|on|next)\s*$/i.test(
      literal.slice(0, trailing.index),
    )
  )
    return empty;
  const phrase = match[1].toLowerCase();
  let revisitOn: string | null = null;
  let datePrecision: 'day' | 'week' | 'month' | null = 'day';
  if (phrase === 'next week') {
    revisitOn = laterDate('week', day);
    datePrecision = 'week';
  } else if (phrase === 'next month') {
    revisitOn = laterDate('month', day);
    datePrecision = 'month';
  } else if (phrase === 'someday') datePrecision = null;
  else if (/^in \d+/.test(phrase)) {
    const n = Number(phrase.split(' ')[1]);
    if (n > 0 && n * (phrase.includes('week') ? 7 : 1) <= 36500)
      revisitOn = addDays(day, n * (phrase.includes('week') ? 7 : 1));
  } else if (/^(in|after) /.test(phrase)) {
    const [prep, monthName] = phrase.split(' ');
    const index = months.findIndex((m) => m === monthName || m.slice(0, 3) === monthName);
    const d = new Date(day + 'T12:00:00');
    const year = d.getFullYear() + (index < d.getMonth() ? 1 : 0);
    revisitOn = localISO(new Date(year, index + (prep === 'after' ? 1 : 0), 1, 12));
    datePrecision = 'month';
  } else revisitOn = parseDate(phrase.replace(/^on /, ''), day);
  if (!revisitOn && phrase !== 'someday') return empty;
  const title = trailing ? literal.slice(0, trailing.index).trim() : leading![2].trim();
  return { title: title || literal, revisitOn, datePrecision };
}

/** Predictable capture: named custom lot, explicit choice, calendar lot, then drop-off. */
export function planCapture(
  input: string,
  lots: Lot[],
  owner: string,
  day = today(),
  explicitId?: string,
  ignoreDate = false,
) {
  const parsed = ignoreDate
    ? { title: input.trim(), revisitOn: null, datePrecision: null }
    : parseIdeaInput(input, day);
  const available = lots.filter((l) => !l.isArchived && (!l.endExclusive || l.endExclusive > day));
  const explicit = available.find((l) => l.id === explicitId);
  const normalized = (s: string) =>
    ` ${s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()} `;
  const matched = available
    .filter(
      (l) =>
        l.id !== 'general' &&
        !l.id.startsWith('date-') &&
        normalized(parsed.title).includes(normalized(l.name)),
    )
    .sort((a, b) => b.name.length - a.name.length || a.sortOrder - b.sortOrder)[0];
  if (explicit || matched) return { ...parsed, lot: (explicit || matched)!, create: false };
  if (parsed.revisitOn) {
    const date = parsed.revisitOn;
    const id = `date-${parsed.datePrecision}-${date}`;
    const existing =
      available.find((l) => l.id === id) ??
      available.find((l) => l.startOn === date && l.endExclusive === addDays(date, 1));
    if (existing) return { ...parsed, lot: existing, create: false };
    const dateName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const name =
      parsed.datePrecision === 'week'
        ? `Week of ${dateName}`
        : parsed.datePrecision === 'month'
          ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })
          : dateName;
    const archived = lots.find((l) => l.id === id);
    if (archived)
      return {
        ...parsed,
        lot: { ...archived, isArchived: false, endExclusive: null },
        create: true,
      };
    const now = new Date().toISOString();
    const lot: Lot = {
      ...general(owner),
      id,
      name,
      nameKey: nameKey(name),
      startOn: date,
      sortOrder: nextSlot(lots),
      createdAt: now,
      updatedAt: now,
      accent: 'blue',
    };
    return { ...parsed, lot, create: true };
  }
  return { ...parsed, lot: lots.find((l) => l.id === 'general') ?? general(owner), create: false };
}

/** Prefer a named lot, then a matching date, then the current conversation's lot. */
export function inferLot(
  input: string,
  lots: Lot[],
  contextId = 'general',
  revisitOn: string | null = null,
  day = today(),
): Lot | undefined {
  const available = lots.filter(
    (lot) => !lot.isArchived && (!lot.endExclusive || lot.endExclusive > day),
  );
  const words = (value: string) =>
    value
      .toLocaleLowerCase('en-US')
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const sentence = ` ${words(input)} `;
  const named = available
    .filter((lot) => sentence.includes(` ${words(lot.name)} `))
    .sort((a, b) => b.name.length - a.name.length || a.sortOrder - b.sortOrder);
  if (named.length) return named[0];
  if (revisitOn) {
    const dated = available
      .filter(
        (lot) =>
          lot.startOn &&
          lot.startOn <= revisitOn &&
          (!lot.endExclusive || lot.endExclusive > revisitOn),
      )
      .sort((a, b) => b.startOn!.localeCompare(a.startOn!) || a.sortOrder - b.sortOrder);
    if (dated.length) return dated[0];
  }
  return (
    available.find((lot) => lot.id === contextId) ??
    available.find((lot) => lot.id === 'general') ??
    available[0]
  );
}
