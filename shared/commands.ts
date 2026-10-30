import { parseDate, parseIdeaInput, parseLotInput } from './parser';
import { addDays, labelDate, nameKey, nextSlot, type Idea, type Lot } from './domain';

export const commandHelp = [
  '/lot Weekend projects max 5',
  '/start "Read a book"',
  '/complete "Read a book"',
  '/archive "Read a book"',
  '/restore "Read a book"',
  '/set "Read a book" date = tomorrow',
  '/set "Read a book" lot = Reading',
  '/set "Read a book" title = Read a novel',
  '/set "Read a book" notes = Chapter two',
  '/set "Read a book" size = big',
  '/set "Read a book" kind = idea',
  '/set-lot "Reading" capacity = 5',
  '/set-lot "Reading" start = tomorrow',
  '/set-lot "Reading" end = someday',
  '/set-lot "Reading" policy = strict',
  '/set-lot "Reading" name = Books',
  '/set-lot "Reading" accent = blue',
  '/set-lot "Reading" slot = 2',
  '/archive-lot "Reading"',
  '/restore-lot "Reading"',
  '/move-all "Reading" to "Drop-off zone"',
  '/lots',
  '/drop-off',
  '/archive',
  '/settings',
  '/export',
  '/import',
  '/undo',
  '/help',
  '/sign-out',
  '/delete-account',
  '/sync',
  '/edit "Read a book"',
  '/edit-lot "Reading"',
  '/keep-lot "Reading"',
  '/prefer reduced = on',
  '/prefer remember = off',
  '/prefer destination = Reading',
  '/resolve "Mutation ID" server',
];

type Write = { entity: 'idea'; record: Idea; undo?: 'complete' } | { entity: 'lot'; record: Lot };
export type CommandPlan = { summary: string; writes: Write[]; ui?: string; value?: string };

function find<T extends { id: string }>(records: T[], label: string, title: (v: T) => string): T {
  const value = label.trim().replace(/^"(.*)"$/, '$1');
  const matches = records.filter((r) => r.id === value || nameKey(title(r)) === nameKey(value));
  if (matches.length > 1)
    throw new Error(`More than one “${value}”. Use its ID from item details.`);
  if (!matches.length) throw new Error(`Couldn’t find “${value}”. Use its exact title or ID.`);
  return matches[0];
}

export function planCommand(
  input: string,
  ideas: Idea[],
  lots: Lot[],
  owner: string,
  day: string,
): CommandPlan {
  const match = input.trim().match(/^\/([a-z-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) throw new Error('Type /help to see single-line actions.');
  const verb = match[1].toLowerCase(),
    args = (match[2] ?? '').trim();
  const result = (summary: string, writes: Write[] = []): CommandPlan => ({ summary, writes });
  const idea = (label: string) => find(ideas, label, (i) => i.title);
  const lot = (label: string) =>
    find(
      lots,
      nameKey(label.replace(/^"(.*)"$/, '$1')) === 'drop-off zone' ? 'general' : label,
      (l) => l.name,
    );
  const now = new Date().toISOString();
  if (verb === 'prefer') {
    const parts = args.match(/^(reduced|remember|destination)\s*=\s*(.+)$/i);
    if (!parts)
      throw new Error('Use /prefer reduced = on, remember = off, or destination = Lot name.');
    const key = parts[1].toLowerCase(),
      value = parts[2].trim();
    if (key !== 'destination' && !['on', 'off'].includes(value)) throw new Error('Use on or off.');
    if (key === 'destination') {
      const destination = lot(value);
      if (destination.isArchived || (destination.endExclusive && destination.endExclusive <= day))
        throw new Error('Choose an open or upcoming lot.');
    }
    return {
      ...result(`Set ${key}: ${value}`),
      ui: `prefer-${key}`,
      value: key === 'destination' ? lot(value).id : value,
    };
  }
  if (verb === 'resolve') {
    const parts = args.match(/^"([^"]+)"\s+(mine|server)$/);
    if (!parts)
      throw new Error(
        'Use /resolve "Mutation ID" mine or server. Export alternatives before replacing them.',
      );
    return {
      ...result(`Resolve conflict using ${parts[2]}`),
      ui: `resolve-${parts[2]}`,
      value: parts[1],
    };
  }
  if (verb === 'edit' || verb === 'edit-lot') {
    const current = verb === 'edit' ? idea(args) : lot(args);
    return {
      ...result(`Edit ${verb === 'edit' ? (current as Idea).title : (current as Lot).name}`),
      ui: verb,
      value: current.id,
    };
  }
  if (verb === 'keep-lot') {
    const current = lot(args);
    return result(`Keep ${current.name} as is`, [
      { entity: 'lot', record: { ...current, endedPromptDismissedFor: current.endExclusive } },
    ]);
  }
  if (
    [
      'lots',
      'drop-off',
      'settings',
      'export',
      'import',
      'undo',
      'help',
      'sign-out',
      'delete-account',
      'sync',
    ].includes(verb) ||
    (verb === 'archive' && !args)
  ) {
    if (args) throw new Error(`/${verb} takes no additional text.`);
    return {
      ...result(`Open ${verb}`),
      ui: verb,
      value: args,
    };
  }
  if (verb === 'lot') {
    const parsed = parseLotInput(args, day);
    if (parsed.warnings.length) throw new Error(parsed.warnings.join('. '));
    if (lots.some((l) => l.nameKey === nameKey(parsed.name)))
      throw new Error('A lot with this name already exists.');
    const { warnings: _, ...fields } = parsed;
    const summary = [
      `Create ${parsed.name}`,
      parsed.startOn &&
        `Starts ${parsed.startOn === day ? 'today · ' : ''}${labelDate(parsed.startOn)}`,
      parsed.endExclusive && `Ends ${labelDate(addDays(parsed.endExclusive, -1))}`,
      parsed.capacity ? `${parsed.capacity} spaces` : 'Unlimited',
    ]
      .filter(Boolean)
      .join(' · ');
    return result(summary, [
      {
        entity: 'lot',
        record: {
          ...fields,
          id: crypto.randomUUID(),
          ownerId: owner,
          nameKey: nameKey(parsed.name),
          accent: 'blue',
          sortOrder: nextSlot(lots),
          isArchived: false,
          endedPromptDismissedFor: null,
          createdAt: now,
          updatedAt: now,
          serverVersion: 0,
        },
      },
    ]);
  }
  if (['start', 'complete', 'archive', 'restore'].includes(verb)) {
    const current = idea(args);
    if (verb === 'complete' && current.kind !== 'task')
      throw new Error('Only tasks can be completed. Set kind = task, or archive this idea.');
    if (verb === 'complete' && current.status === 'archived')
      throw new Error('This task is already archived.');
    const status = verb === 'start' ? 'active' : verb === 'restore' ? 'parked' : 'archived';
    return result(`${verb} · ${current.title}`, [
      {
        entity: 'idea',
        record: {
          ...current,
          status,
          activatedAt: status === 'active' ? now : current.activatedAt,
          archivedAt: status === 'archived' ? now : null,
          archiveReason:
            status === 'archived' ? (verb === 'complete' ? 'completed' : 'dismissed') : null,
        },
        ...(verb === 'complete' ? { undo: 'complete' as const } : {}),
      },
    ]);
  }
  if (verb === 'archive-lot' || verb === 'restore-lot') {
    const current = lot(args);
    if (current.id === 'general') throw new Error('Drop-off zone always stays available.');
    return result(`${verb === 'archive-lot' ? 'Archive' : 'Restore'} ${current.name}`, [
      { entity: 'lot', record: { ...current, isArchived: verb === 'archive-lot' } },
    ]);
  }
  if (verb === 'move-all') {
    const parts = args.match(/^"([^"]+)"\s+to\s+"([^"]+)"$/i);
    if (!parts) throw new Error('Use /move-all "Source lot" to "Destination lot".');
    const source = lot(parts[1]),
      target = lot(parts[2]);
    if (source.id === target.id) throw new Error('Choose a different destination.');
    const writes: Write[] = ideas
      .filter((i) => i.lotId === source.id && i.status === 'parked')
      .map((i) => ({ entity: 'idea', record: { ...i, lotId: target.id } }));
    return result(`Move ${writes.length} parked items to ${target.name}`, writes);
  }
  if (verb === 'set' || verb === 'set-lot') {
    const parts = args.match(/^"([^"]+)"\s+([a-z]+)\s*=\s*([\s\S]+)$/i);
    if (!parts) throw new Error(`Use /${verb} "Exact name" field = value.`);
    const field = parts[2].toLowerCase(),
      value = parts[3].trim();
    const date = () => {
      if (value.toLowerCase() === 'someday' || value.toLowerCase() === 'none') return null;
      const parsed = parseDate(value, day);
      if (!parsed) throw new Error('Use today, tomorrow, a weekday, an ISO date, or none.');
      return parsed;
    };
    if (verb === 'set') {
      const current = idea(parts[1]);
      let patch: Partial<Idea>;
      if (field === 'title' || field === 'notes')
        patch = { [field]: value === 'none' ? '' : value };
      else if (field === 'lot') patch = { lotId: lot(value).id };
      else if (field === 'date') {
        const parsed = parseIdeaInput(`Item ${value}`, day);
        if (!parsed.revisitOn && !['none', 'someday'].includes(value.toLowerCase()))
          throw new Error('Use an exact or relative date, or someday.');
        patch = { revisitOn: parsed.revisitOn, datePrecision: parsed.datePrecision };
      } else if (field === 'size' && ['big', 'truck', 'compact', 'small'].includes(value))
        patch = { vehicleSize: ['big', 'truck'].includes(value) ? 'truck' : 'compact' };
      else if (field === 'kind' && ['idea', 'task'].includes(value))
        patch = { kind: value as Idea['kind'] };
      else
        throw new Error('Fields: title, notes, lot, date, size (compact/big), kind (idea/task).');
      return result(`Update ${current.title} · ${field}: ${value}`, [
        { entity: 'idea', record: { ...current, ...patch } },
      ]);
    }
    const current = lot(parts[1]);
    if (current.id === 'general') throw new Error('Drop-off zone is permanent and unlimited.');
    let patch: Partial<Lot>;
    if (field === 'name') patch = { name: value, nameKey: nameKey(value) };
    else if (field === 'start') patch = { startOn: date() };
    else if (field === 'end') {
      const end = date();
      patch = { endExclusive: end ? addDays(end, 1) : null };
    } else if (field === 'capacity' && (value === 'none' || /^\d+$/.test(value)))
      patch = { capacity: value === 'none' ? null : Number(value) };
    else if (field === 'policy' && ['soft', 'strict'].includes(value))
      patch = { capacityPolicy: value as Lot['capacityPolicy'] };
    else if (field === 'accent' && ['blue', 'green', 'gold', 'coral'].includes(value))
      patch = { accent: value as Lot['accent'] };
    else if (field === 'slot' && /^\d+$/.test(value)) patch = { sortOrder: Number(value) };
    else
      throw new Error(
        'Fields: name, start, end, capacity (1–99/none), policy (soft/strict), accent, slot.',
      );
    return result(`Update ${current.name} · ${field}: ${value}`, [
      { entity: 'lot', record: { ...current, ...patch } },
    ]);
  }
  throw new Error(
    'Unknown action. Type /help for examples; quote a thought to save literal slash text.',
  );
}
