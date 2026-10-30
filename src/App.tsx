import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { registerSW } from 'virtual:pwa-register';
import { ParkerDB, downloadBackup } from './data';
import { SyncEngine, type SyncState } from './sync';
import { localOnly, localAccount, cloudAppUrl } from './runtime';
import { LandscapeArt } from './Landscape';
import { worldLayout, chronologicalLots } from '../shared/landscape';
import { MiniLot, Vehicle, Arrow, Wordmark, Scenery, CoastArt, ideaColor } from './art';
import {
  cancelJourney,
  cancelAllJourneys,
  departureSnapshot,
  driveOff,
  parkJourney,
} from './motion';
import {
  addDays,
  displaySlots,
  effectiveRevisitOn,
  general,
  getLotStatus,
  isReady,
  labelDate,
  laterDate,
  nameKey,
  nextSlot,
  occupancy,
  today,
  type Idea,
  type Lot,
} from '../shared/domain';
import { planCapture, parseLotInput } from '../shared/parser';
import { commandHelp, planCommand } from '../shared/commands';
import {
  mergeImport,
  replaceImport,
  planImport,
  collectRecovered,
  type ImportPlan,
} from './backup';
type Account = { id: string; email: string; avatar?: string | null };
type Settings = { reduced: boolean; rememberLot: boolean; defaultLot: string };
type Panel =
  | { type: 'dropOff' }
  | { type: 'lot'; id: string }
  | { type: 'idea'; id: string }
  | { type: 'new' }
  | { type: 'editLot'; id: string }
  | { type: 'settings' }
  | null;
const cachedAccount = () => {
  if (localOnly) return localStorage.getItem('park-local-started') === 'true' ? localAccount : null;
  try {
    return JSON.parse(localStorage.getItem('park-account') ?? 'null') as Account | null;
  } catch {
    return null;
  }
};
export function App() {
  const [account, setAccount] = useState<Account | null>(cachedAccount);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(
    !localOnly && localStorage.getItem('park-deleting') === 'true',
  );
  const login = async (credential: string, devEmail?: string) => {
    try {
      const r = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, devEmail }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (b.deleting) {
        localStorage.setItem('park-deleting', 'true');
        setDeleting(true);
        return;
      }
      if (account && account.id !== b.user.id) {
        setNotice(
          'Sign in with the previously cached account, or export its pending work and sign out first.',
        );
        return;
      }
      localStorage.setItem('park-account', JSON.stringify(b.user));
      setAccount(b.user);
    } catch (e) {
      setNotice(String(e));
    }
  };
  if (deleting)
    return (
      <DeletionProgress
        reauthenticate={<GoogleLogin login={login} />}
        done={async () => {
          if (account) {
            const db = new ParkerDB(account.id);
            await db.delete();
            for (const key of Object.keys(sessionStorage))
              if (key.startsWith(`park-draft:${account.id}:`)) sessionStorage.removeItem(key);
          }
          localStorage.removeItem('park-account');
          localStorage.removeItem('park-deleting');
          setAccount(null);
          setDeleting(false);
        }}
      />
    );
  return account ? (
    <Workspace
      key={account.id}
      account={account}
      deleting={() => {
        localStorage.setItem('park-deleting', 'true');
        setDeleting(true);
      }}
      signOut={() => {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith(`park-draft:${account?.id}:`)) sessionStorage.removeItem(key);
        localStorage.removeItem('park-account');
        setAccount(null);
      }}
      reauthenticate={<GoogleLogin login={login} />}
    />
  ) : (
    <main className="sign-in">
      <div className="coast-sign">
        <Wordmark />
        <div className="shore-line" />
      </div>
      <section>
        <h1>A place to leave ideas.</h1>
        <div className="login-lot">
          <MiniLot lot={general('preview')} ideas={[]} />
        </div>
        {localOnly ? (
          <>
            <p>
              <a className="cloud-sign-in" href={cloudAppUrl}>
                Sign in with Google
              </a>
            </p>
            <p className="help">Sign in to save and sync your park across devices.</p>
            <button
              onClick={() => {
                localStorage.setItem('park-local-started', 'true');
                setAccount(localAccount);
              }}
            >
              Open my park
            </button>
          </>
        ) : (
          <GoogleLogin login={login} />
        )}
        {notice && <p role="alert">{notice}</p>}
        <p className="privacy-copy">
          {localOnly
            ? 'Saved in this browser. No sign-in or cloud sync. Export backups in Settings to keep your ideas safe.'
            : 'Private to you. Saved locally and synced to your account.'}
        </p>
      </section>
    </main>
  );
}
function GoogleLogin({ login }: { login: (credential: string, devEmail?: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch('/api/auth/challenge');
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        if (!b.clientId) {
          setError('Google sign-in needs configuration. See the setup guide.');
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
          if (!alive) return;
          const google = (
            window as unknown as {
              google: {
                accounts: {
                  id: {
                    initialize: (x: unknown) => void;
                    renderButton: (e: HTMLElement, x: unknown) => void;
                  };
                };
              };
            }
          ).google;
          google.accounts.id.initialize({
            client_id: b.clientId,
            nonce: b.nonce,
            callback: (r: { credential: string }) => login(r.credential),
          });
          if (host.current)
            google.accounts.id.renderButton(host.current, {
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
            });
        };
        document.head.append(script);
      } catch {
        setError('Connect to the internet to sign in on this device.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div>
      <div ref={host} />
      {error && <p className="help">{error}</p>}
      {import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true' && (
        <button
          onClick={async () => {
            await fetch('/api/auth/challenge');
            login('', 'local@park.test');
          }}
        >
          Use local development account
        </button>
      )}
    </div>
  );
}
function Workspace({
  account,
  signOut,
  reauthenticate,
  deleting,
}: {
  account: Account;
  deleting: () => void;
  signOut: () => void;
  reauthenticate: ReactNode;
}) {
  const [db] = useState(() => new ParkerDB(account.id, localOnly));
  const [syncState, setSyncState] = useState<SyncState>(
    localOnly ? 'Saved in this browser' : 'Changes waiting',
  );
  const [engine] = useState(() => new SyncEngine(db, setSyncState));
  const ideas = useLiveQuery(() => db.ideas.toArray(), [db], []) ?? [];
  const allLots = useLiveQuery(() => db.lots.orderBy('sortOrder').toArray(), [db], []) ?? [];
  const isDemo = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true';
  const lots = allLots;
  const recoveredWork = useLiveQuery(() => db.getMeta<unknown>('recoveredDrafts', null), [db]);
  const queue = useLiveQuery(() => db.queue.orderBy('order').toArray(), [db], []) ?? [];
  const undos = useLiveQuery(() => db.undos.orderBy('expires').toArray(), [db], []) ?? [];
  const [view, setView] = useState('Lots'),
    [panel, setPanel] = useState<Panel>(null),
    [expanded, setExpanded] = useState(new Set<string>()),
    [text, setText] = useDraftState(`park-draft:${account.id}:capture`, ''),
    [truck, setTruck] = useState(false),
    [destination, setDestination] = useState('general'),
    [destinationChosen, setDestinationChosen] = useState(false),
    [ignoreDate, setIgnoreDate] = useState(false),
    [message, setMessage] = useState(''),
    [clock, setClock] = useState(Date.now()),
    [hidden, setHidden] = useState(new Set<string>()),
    [settings, setSettings] = useState<Settings>({
      reduced: false,
      rememberLot: false,
      defaultLot: 'general',
    }),
    [update, setUpdate] = useState<(() => Promise<void>) | null>(null),
    [keyboard, setKeyboard] = useState(0);
  const [creatingLot, setCreatingLot] = useState(false);
  const [commandHelpOpen, setCommandHelpOpen] = useState(false);
  const [lotDescription, setLotDescription] = useDraftState(
    `park-draft:${account.id}:quick-lot`,
    '',
  );
  const [creatingLotBusy, setCreatingLotBusy] = useState(false);
  const lotSubmitting = useRef(false);
  const completing = useRef(new Set<string>());
  const describedLot = parseLotInput(lotDescription);
  const draftRevision = useRef(0),
    submitting = useRef(new Set<number>());
  const composer = useRef<HTMLTextAreaElement>(null),
    submit = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [includeUpdates, setIncludeUpdates] = useState(false);
  const [worldWidth, setWorldWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setWorldWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [plotHeights, setPlotHeights] = useState(new Map<string, number>()),
    [largeText, setLargeText] = useState(false);
  const dropOffLot: Lot = {
    ...(lots.find((l) => l.id === 'general') ?? general(account.id)),
    name: 'Drop-off zone',
  };
  const worldLots = [dropOffLot, ...lots.filter((l) => l.id !== 'general')];
  const world = worldLayout(worldLots, worldWidth, plotHeights);
  useEffect(() => {
    if (view !== 'Lots') return;
    const observer = new ResizeObserver((entries) => {
      setLargeText(parseFloat(getComputedStyle(document.documentElement).fontSize) > 20);
      setPlotHeights((previous) => {
        let changed = false;
        const next = new Map(previous);
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.worldLot;
          if (id && Math.abs((next.get(id) ?? 0) - entry.contentRect.height) > 1) {
            next.set(id, entry.contentRect.height);
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    });
    document.querySelectorAll('.landscape .lot-plot').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lots, ideas.length, view, worldWidth]);
  const reduced = settings.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const showPanel = (next: Panel) => {
    if (!panel) returnFocus.current = document.activeElement as HTMLElement;
    setPanel(next);
  };
  const closePanel = () => {
    setPanel(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  };
  const notify = (s: string) => setMessage(s);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      engine.schedule();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    let alive = true;
    void db.init(isDemo).then(async () => {
      const stored = await db.getMeta<Settings>('settings', {
        reduced: false,
        rememberLot: false,
        defaultLot: 'general',
      });
      if (!alive) return;
      setSettings(stored);
      setDestination(stored.rememberLot ? stored.defaultLot : 'general');
      setDestinationChosen(stored.rememberLot);
      void engine.run();
    });
    const foreground = () => {
      setClock(Date.now());
      if (document.visibilityState === 'visible') {
        engine.paused = false;
        void engine.run(true);
      }
    };
    const online = () => void engine.run(true);
    const offline = () => setSyncState(localOnly ? 'Saved in this browser' : 'Offline');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', foreground);
    const tick = setInterval(() => setClock(Date.now()), 30000);
    const unregister = registerSW({
      onNeedRefresh() {
        setUpdate(() => () => unregister(true));
      },
    });
    return () => {
      alive = false;
      engine.dispose();
      clearInterval(tick);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [db, engine]);
  useEffect(() => {
    const handler = () => {
      const v = window.visualViewport;
      if (v) setKeyboard(Math.max(0, window.innerHeight - v.height - v.offsetTop));
    };
    window.visualViewport?.addEventListener('resize', handler);
    window.visualViewport?.addEventListener('scroll', handler);
    return () => {
      window.visualViewport?.removeEventListener('resize', handler);
      window.visualViewport?.removeEventListener('scroll', handler);
    };
  }, []);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const editing = (e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable]');
      if (e.key === 'Escape') {
        if (panel) {
          e.preventDefault();
          closePanel();
        } else composer.current?.blur();
      }
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        composer.current?.focus();
      }
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        showPanel({ type: 'new' });
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [panel]);
  useEffect(() => () => cancelAllJourneys(), [view, panel]);
  useEffect(() => {
    const expiry = Math.min(...undos.filter((u) => u.expires > Date.now()).map((u) => u.expires));
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(1, expiry - Date.now() + 5));
    return () => clearTimeout(timer);
  }, [undos, clock]);
  const day = today();
  const isCommand = !creatingLot && text.trimStart().startsWith('/');
  let commandPreview = '';
  if (isCommand) {
    try {
      commandPreview = planCommand(text, ideas, lots, account.id, day).summary;
    } catch (error) {
      commandPreview = error instanceof Error ? error.message : String(error);
    }
  }
  void clock;
  const parsed = planCapture(
    text,
    lots,
    account.id,
    day,
    destinationChosen ? destination : undefined,
    ignoreDate,
  );
  const inferredLot = parsed.lot;
  const slots = displaySlots(lots);
  const normalLots = chronologicalLots(lots.filter((l) => !l.isArchived));
  const lotFor = (i: Idea) => lots.find((l) => l.id === i.lotId);
  const newest = (a: Idea, b: Idea) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  const dropOff = ideas.filter((i) => i.lotId === 'general' && i.status === 'parked').sort(newest);
  const ready = ideas
    .filter(
      (i) =>
        i.lotId !== 'general' && i.status === 'parked' && lotFor(i) && isReady(i, lotFor(i)!, day),
    )
    .sort(
      (a, b) =>
        effectiveRevisitOn(a, lotFor(a)!)!.localeCompare(effectiveRevisitOn(b, lotFor(b)!)!) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const active = ideas
    .filter((i) => i.status === 'active')
    .sort(
      (a, b) =>
        (b.activatedAt ?? '').localeCompare(a.activatedAt ?? '') || a.id.localeCompare(b.id),
    );
  const archived = ideas
    .filter((i) => i.status === 'archived' || (lotFor(i)?.isArchived && i.status === 'parked'))
    .sort(newest);
  const timing = (i: Idea) => {
    const l = lotFor(i);
    if (i.status === 'active') return 'Active';
    if (!l) return 'Someday';
    if (isReady(i, l, day)) return 'Ready to revisit';
    const date = effectiveRevisitOn(i, l);
    return date ? `Not before ${labelDate(date, i.datePrecision)}` : 'Someday';
  };
  const saveIdea = (i: Idea, patch: Partial<Idea>) =>
    run(() => db.save('idea', { ...i, ...patch }));
  const lifecycle = (i: Idea, status: Idea['status']) =>
    saveIdea(i, {
      status,
      ...(status === 'active'
        ? { activatedAt: new Date().toISOString(), archivedAt: null, archiveReason: null }
        : status === 'archived'
          ? { archivedAt: new Date().toISOString(), archiveReason: 'dismissed' }
          : { archivedAt: null, archiveReason: null }),
    });
  const complete = (i: Idea, el: HTMLElement) =>
    run(async () => {
      if (i.kind !== 'task') return showPanel({ type: 'idea', id: i.id });
      if (completing.current.has(i.id)) return;
      completing.current.add(i.id);
      const departure = departureSnapshot(el);
      try {
        await db.save(
          'idea',
          {
            ...i,
            status: 'archived',
            archivedAt: new Date().toISOString(),
            archiveReason: 'completed',
          },
          'complete',
        );
        driveOff(departure, reduced, i.id);
        notify('Completed');
      } finally {
        completing.current.delete(i.id);
      }
    });
  const park = () =>
    run(async () => {
      const submitted = text;
      const revision = draftRevision.current;
      if (!submitted.trim() || submitting.current.has(revision)) return;
      submitting.current.add(revision);
      if (isCommand) {
        try {
          const plan = await db.command(submitted, day);
          if (plan.ui === 'undo') {
            const undo = (await db.undos.orderBy('expires').toArray())
              .filter((u) => u.expires > Date.now())
              .at(-1);
            if (!undo) throw new Error('Nothing left to undo.');
            await db.undo(undo.id);
            cancelJourney(undo.ideaId);
          } else if (plan.ui === 'export') downloadBackup(await db.backup());
          else if (plan.ui === 'sync') await engine.run(true);
          else if (plan.ui === 'sign-out') {
            await logout();
            return;
          } else if (plan.ui?.startsWith('prefer-')) {
            const next = { ...settings };
            if (plan.ui === 'prefer-reduced') next.reduced = plan.value === 'on';
            if (plan.ui === 'prefer-remember') next.rememberLot = plan.value === 'on';
            if (plan.ui === 'prefer-destination') {
              next.defaultLot = plan.value!;
              setDestination(plan.value!);
              setDestinationChosen(true);
            }
            await db.setMeta('settings', next);
            setSettings(next);
          } else if (plan.ui?.startsWith('resolve-')) {
            const pending = await db.queue.get(plan.value!);
            if (!pending?.issue) throw new Error('No conflict with that mutation ID.');
            await db.resolve(pending.id, plan.ui === 'resolve-mine' ? 'mine' : 'server');
          } else if (plan.ui === 'edit') showPanel({ type: 'idea', id: plan.value! });
          else if (plan.ui === 'edit-lot') showPanel({ type: 'editLot', id: plan.value! });
          else if (['settings', 'import', 'delete-account'].includes(plan.ui ?? '')) {
            showPanel({ type: 'settings' });
            requestAnimationFrame(() => {
              if (plan.ui === 'import')
                document.querySelector<HTMLInputElement>('.panel input[type="file"]')?.click();
              if (plan.ui === 'delete-account') {
                const section = document.querySelector<HTMLElement>('.panel .delete-account');
                section?.querySelector<HTMLButtonElement>('button')?.click();
                section?.scrollIntoView({ block: 'center' });
              }
            });
          } else if (plan.ui === 'help') setCommandHelpOpen(true);
          else if (plan.ui) {
            setPanel(null);
            setView(
              plan.ui === 'archive' ? 'Archive' : plan.ui === 'drop-off' ? 'Drop-off zone' : 'Lots',
            );
          }
          if (draftRevision.current === revision) {
            draftRevision.current++;
            setText('');
          }
          notify(plan.summary);
          composer.current?.focus();
        } finally {
          submitting.current.delete(revision);
        }
        return;
      }
      let result: Awaited<ReturnType<ParkerDB['capture']>>;
      try {
        result = await db.capture(submitted, {
          day,
          explicitId: destinationChosen ? destination : undefined,
          ignoreDate,
          truck,
        });
      } finally {
        submitting.current.delete(revision);
      }
      const { idea: i, lot } = result;
      if (draftRevision.current === revision) {
        draftRevision.current++;
        setText('');
      }
      setIgnoreDate(false);
      if (!settings.rememberLot) {
        setDestination('general');
        setDestinationChosen(false);
      }
      notify(
        `Parked in ${lot.id === 'general' ? 'Drop-off zone' : lot.name}${lot.capacity !== null && occupancy(ideas, lot.id) + (truck ? 2 : 1) > lot.capacity ? ' · Over capacity' : ''}`,
      );
      composer.current?.focus();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (submit.current)
            parkJourney(
              i.id,
              lot.id,
              submit.current,
              i.vehicleSize === 'truck',
              reduced,
              (id, on) =>
                setHidden((current) => {
                  const next = new Set(current);
                  on ? next.add(id) : next.delete(id);
                  return next;
                }),
            );
        }),
      );
    });
  const createLot = () =>
    run(async () => {
      if (!lotDescription.trim() || lotSubmitting.current) return;
      if (describedLot.warnings.length) throw new Error(describedLot.warnings.join('. '));
      const now = new Date().toISOString();
      const lot: Lot = {
        id: crypto.randomUUID(),
        ownerId: account.id,
        name: describedLot.name,
        nameKey: nameKey(describedLot.name),
        startOn: describedLot.startOn,
        endExclusive: describedLot.endExclusive,
        capacity: describedLot.capacity,
        capacityPolicy: 'soft',
        accent: 'blue',
        sortOrder: nextSlot(lots),
        isArchived: false,
        endedPromptDismissedFor: null,
        createdAt: now,
        updatedAt: now,
        serverVersion: 0,
      };
      lotSubmitting.current = true;
      setCreatingLotBusy(true);
      try {
        await db.save('lot', lot);
        setDest(lot.id);
        setLotDescription('');
        setCreatingLot(false);
        notify(`Created ${lot.name} · Ready to park ideas here`);
        requestAnimationFrame(() => composer.current?.focus());
      } finally {
        lotSubmitting.current = false;
        setCreatingLotBusy(false);
      }
    });
  const setDest = (id: string) => {
    setDestination(id);
    setDestinationChosen(true);
    if (settings.rememberLot) {
      const next = { ...settings, defaultLot: id };
      setSettings(next);
      void db.setMeta('settings', next);
    }
  };
  const row = (i: Idea) => (
    <article className="idea-row" key={i.id}>
      <button
        className="vehicle-action"
        aria-label={
          i.kind === 'task' && i.status !== 'archived'
            ? `Complete ${i.title}`
            : `Details for ${i.title}`
        }
        onClick={(e) =>
          i.kind === 'task' && i.status !== 'archived'
            ? complete(i, e.currentTarget)
            : showPanel({ type: 'idea', id: i.id })
        }
      >
        <Vehicle truck={i.vehicleSize === 'truck'} color={ideaColor(i)} />
      </button>
      <button className="idea-title" onClick={() => showPanel({ type: 'idea', id: i.id })}>
        <strong>{i.title}</strong>
        <small>
          {i.lotId === 'general' ? 'Drop-off zone' : lotFor(i)?.name} · {timing(i)}
        </small>
      </button>
      {i.status === 'parked' && (
        <button className="text-button" onClick={() => lifecycle(i, 'active')}>
          Start
        </button>
      )}
    </article>
  );
  const dropOffContent = (preview = false) => (
    <>
      {dropOff.map(row)}
      {!dropOff.length && <p className="empty-copy">Nothing here yet.</p>}
      {ready.length > 0 && (
        <section className="item-section">
          <h3>Ready to revisit</h3>
          {ready.map(row)}
        </section>
      )}
      {active.length > 0 && (
        <section className="item-section">
          <h3>
            In progress <span>{active.length}</span>
          </h3>
          {active.map(row)}
        </section>
      )}
      {!preview &&
        normalLots
          .filter(
            (l) => getLotStatus(l) === 'Ended' && l.endedPromptDismissedFor !== l.endExclusive,
          )
          .map((l) => (
            <div className="ended-review" key={l.id}>
              <p>
                {l.name}’s planned window ended. Keep these ideas here, extend the lot, or move
                them.
              </p>
              <button
                onClick={() =>
                  run(() => db.save('lot', { ...l, endedPromptDismissedFor: l.endExclusive }))
                }
              >
                Keep as is
              </button>
              <button onClick={() => showPanel({ type: 'editLot', id: l.id })}>Extend dates</button>
              <button onClick={() => showPanel({ type: 'lot', id: l.id })}>Review ideas</button>
            </div>
          ))}
    </>
  );
  const showLots = normalLots.filter((l) => l.id !== 'general');
  const lotIdeas = (l: Lot) =>
    ideas
      .filter((i) => i.lotId === l.id && i.status === 'parked')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const lotPlot = (l: Lot) => {
    const signName =
      l.id.startsWith('date-day-') && l.startOn === day
        ? 'Today'
        : l.id.startsWith('date-day-') && l.startOn === addDays(day, 1)
          ? 'Tomorrow'
          : l.name;
    const used = occupancy(ideas, l.id);
    const count = ideas.filter((i) => i.status === 'parked' && i.lotId === l.id).length;
    const visual = ideas;
    return (
      <section
        key={l.id}
        data-world-lot={l.id}
        className={`lot-plot ${l.capacity !== null && used >= l.capacity ? 'full' : ''}`}
        style={{
          left: world.positions.get(l.id)?.x,
          top: world.positions.get(l.id)?.y,
          width: world.positions.get(l.id)?.width,
        }}
      >
        <button
          id={`lot-${l.id}`}
          className="lot-open"
          aria-label={`${l.name}, ${used}${l.capacity !== null ? ` of ${l.capacity}` : ''} spaces occupied, ${getLotStatus(l)}, expand`}
          aria-expanded={expanded.has(l.id)}
          onClick={() => {
            setExpanded((old) => {
              const n = new Set(old);
              n.has(l.id) ? n.delete(l.id) : n.add(l.id);
              return n;
            });
            if (matchMedia('(min-width:1000px)').matches) showPanel({ type: 'lot', id: l.id });
          }}
        >
          <div className="lot-label">
            <h2 title={l.name}>{signName}</h2>
            <span>{getLotStatus(l)}</span>
          </div>
          <div className="lot-meta">
            <span>
              {l.capacity !== null
                ? `${used} / ${l.capacity} spaces`
                : `${count} ${count === 1 ? 'car' : 'cars'} · Unlimited`}
              {l.capacity !== null && used > l.capacity ? ' · Over capacity' : ''}
            </span>
            <span>
              {l.startOn ? labelDate(l.startOn) : 'Any time'}
              {l.endExclusive ? ` – ${labelDate(addDays(l.endExclusive, -1))}` : ''}
            </span>
          </div>
          <MiniLot lot={l} ideas={visual} hidden={hidden} />
        </button>

        {expanded.has(l.id) && (
          <div className="expanded-mobile">
            {lotIdeas(l).map(row)}
            {!lotIdeas(l).length && <p className="empty-copy">Empty lot.</p>}
            <button onClick={() => showPanel({ type: 'lot', id: l.id })}>Lot actions</button>
          </div>
        )}
      </section>
    );
  };
  const selectedLot = panel && 'id' in panel ? lots.find((l) => l.id === panel.id) : undefined;
  const selectedIdea = panel?.type === 'idea' ? ideas.find((i) => i.id === panel.id) : undefined;
  const exportAll = async () => {
    downloadBackup(await db.backup());
    await db.setMeta('lastBackup', Date.now());
    notify('Backup exported, including pending work.');
  };
  const logout = async (all = false) => {
    if (localOnly) {
      notify('This park is saved in this browser. Use Settings to export a backup.');
      return;
    }
    if (queue.length || collectRecovered(recoveredWork).length) {
      notify('Changes are waiting. Sync first, or export pending work before signing out.');
      return;
    }
    try {
      await engine.request(all ? '/api/auth/logout-all' : '/api/auth/logout', {
        method: 'POST',
        body: '{}',
      });
    } catch {
      if (navigator.onLine) {
        notify('Unable to revoke the session. Try again.');
        return;
      }
      notify('Signed out locally. Reconnect to revoke your server session.');
    }
    engine.dispose();
    await db.delete();
    signOut();
  };
  return (
    <div
      className={`app view-${view === 'Drop-off zone' ? 'drop-off' : view.toLowerCase()} ${largeText ? 'large-text' : ''} ${keyboard > 100 ? 'keyboard-open' : ''}`}
      style={{ '--keyboard': `${keyboard}px` } as React.CSSProperties}
    >
      <aside className="coast" aria-label="Parker">
        <CoastArt />
        <Wordmark />
      </aside>
      <header className="toolbar">
        <div className="mobile-brand">
          <Wordmark />
        </div>
        <nav aria-label="Main navigation">
          {['Lots', 'Drop-off zone', 'Archive'].map((v) => (
            <button
              key={v}
              aria-current={view === v ? 'page' : undefined}
              onClick={() => {
                setView(v);
                setPanel(null);
              }}
            >
              {v}
            </button>
          ))}
        </nav>
        <span className="toolbar-spacer" />
        <button className="sync-label" onClick={() => showPanel({ type: 'settings' })}>
          <span className={`status-dot ${syncState === 'Synced' ? 'synced' : ''}`} />
          {syncState}
        </button>
        <button
          className="new-lot"
          onClick={() => {
            setCreatingLot((current) => !current);
            composer.current?.focus();
          }}
        >
          + New lot
        </button>
        <button
          className="mobile-menu-toggle"
          aria-label="Open navigation"
          popoverTarget="mobile-navigation"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M5 6h14v2H5zM5 11h14v2H5zM5 16h14v2H5z" />
          </svg>
        </button>
      </header>
      <div id="mobile-navigation" popover="auto" className="compact-app-menu">
        <nav aria-label="Navigation">
          {['Lots', 'Drop-off zone', 'Archive', 'New lot', 'Settings'].map((v) => (
            <button
              key={v}
              aria-current={v === view ? 'page' : undefined}
              onClick={() => {
                document.getElementById('mobile-navigation')?.hidePopover();
                if (v === 'New lot') {
                  setCreatingLot(true);
                  composer.current?.focus();
                } else if (v === 'Settings') showPanel({ type: 'settings' });
                else {
                  setView(v);
                  setPanel(null);
                }
              }}
            >
              {v}
            </button>
          ))}
        </nav>
      </div>
      <main className="land">
        {view !== 'Lots' && (
          <div className="browse-tools">
            <h1>{view}</h1>
          </div>
        )}
        {view === 'Lots' ? (
          <>
            <div
              className="map-scroll"
              tabIndex={0}
              aria-label="Parking landscape. Scroll to explore lots"
            >
              <div
                className="landscape"
                data-world-width={worldWidth}
                style={{ height: world.height }}
              >
                <LandscapeArt lots={worldLots} width={worldWidth} layout={world} />
                <div className="map-lots">
                  <section
                    className="lot-plot drop-off-plot"
                    data-world-lot="general"
                    data-lot-geometry="general"
                    style={{
                      left: world.positions.get('general')?.x,
                      top: world.positions.get('general')?.y,
                      width: world.positions.get('general')?.width,
                    }}
                  >
                    <button
                      id="lot-general"
                      className="drop-off-heading"
                      aria-label={`Drop-off zone, ${dropOff.length} ${dropOff.length === 1 ? 'car' : 'cars'}, expand`}
                      onClick={() => showPanel({ type: 'dropOff' })}
                    >
                      <h1>
                        Drop-off zone <span>{dropOff.length}</span>
                      </h1>
                    </button>
                    <div className="drop-off-todos" aria-label="Drop-off items">
                      {dropOff.map((i) => (
                        <div className="drop-off-todo" key={i.id}>
                          <button
                            className="todo-complete"
                            data-spot={i.id}
                            style={{ visibility: hidden.has(i.id) ? 'hidden' : 'visible' }}
                            title={
                              i.kind === 'task' ? `Complete ${i.title}` : `Details for ${i.title}`
                            }
                            aria-label={
                              i.kind === 'task' ? `Complete ${i.title}` : `Details for ${i.title}`
                            }
                            onClick={(e) =>
                              i.kind === 'task'
                                ? complete(i, e.currentTarget)
                                : showPanel({ type: 'idea', id: i.id })
                            }
                          >
                            <Vehicle truck={i.vehicleSize === 'truck'} color={ideaColor(i)} />
                          </button>
                          <button
                            className="todo-title"
                            onClick={() => showPanel({ type: 'idea', id: i.id })}
                          >
                            {i.title}
                          </button>
                        </div>
                      ))}
                      {!dropOff.length && <p className="empty-copy">Nothing here yet.</p>}
                    </div>
                  </section>
                  {showLots.map(lotPlot)}
                </div>
              </div>
            </div>
          </>
        ) : view === 'Drop-off zone' ? (
          <section className="full-list">{dropOffContent()}</section>
        ) : (
          <section className="full-list">
            <h2>Archived ideas</h2>
            {archived.map(row)}
            {!archived.length && <p className="empty-copy">Archived ideas stay safe here.</p>}
            <h2>Archived lots</h2>
            {lots
              .filter((l) => l.isArchived)
              .map((l) => (
                <div className="archive-lot" key={l.id}>
                  <button onClick={() => showPanel({ type: 'lot', id: l.id })}>{l.name}</button>
                  <button onClick={() => run(() => db.save('lot', { ...l, isArchived: false }))}>
                    Unarchive
                  </button>
                </div>
              ))}
          </section>
        )}
      </main>
      <div className="capture-rail">
        <div className="feedback" role="status">
          {message || (undos.some((u) => u.expires > Date.now()) ? 'Last thought parked' : '')}
          {undos
            .filter((u) => u.expires > Date.now())
            .slice(-1)
            .map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  cancelJourney(u.ideaId);
                  void run(async () => {
                    await db.undo(u.id);
                    notify('Undone');
                  });
                }}
              >
                Undo
              </button>
            ))}
        </div>
        <div
          className={`capture-hint ${!creatingLot && !text.trim() && !destinationChosen ? 'idle-hint' : ''}`}
          id="capture-preview"
          aria-live="polite"
        >
          {isCommand ? (
            commandPreview
          ) : creatingLot ? (
            <>
              Name a custom lot <button onClick={() => setCreatingLot(false)}>Cancel</button>
            </>
          ) : text.trim() || destinationChosen ? (
            <>
              {parsed.create ? 'New lot' : 'Parking in'} ·{' '}
              {inferredLot.id === 'general' ? 'Drop-off zone' : inferredLot.name}
              {parsed.revisitOn && (
                <>
                  <span> · “{parsed.title}”</span>
                  <button onClick={() => setIgnoreDate(true)}>Keep date in title</button>
                </>
              )}
              {destinationChosen && (
                <button
                  onClick={() => {
                    setDestination('general');
                    setDestinationChosen(false);
                  }}
                >
                  Reset
                </button>
              )}
            </>
          ) : (
            <>
              A thought, a date, or{' '}
              <button
                onClick={() => setCommandHelpOpen((open) => !open)}
                aria-expanded={commandHelpOpen}
              >
                / an action
              </button>
            </>
          )}
        </div>
        {(commandHelpOpen || (isCommand && (text.trim() === '/' || text.trim() === '/help'))) && (
          <div className="command-help">
            <div>
              <strong>Actions</strong>
              <button
                onClick={() => {
                  setCommandHelpOpen(false);
                  if (['/', '/help'].includes(text.trim())) {
                    draftRevision.current++;
                    setText('');
                  }
                }}
              >
                Close
              </button>
            </div>
            <p>Use exact names in quotes. Duplicate titles need the ID shown in details.</p>
            {commandHelp.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  draftRevision.current++;
                  setText(example);
                  setCreatingLot(false);
                  setCommandHelpOpen(false);
                  composer.current?.focus();
                }}
              >
                {example}
              </button>
            ))}
          </div>
        )}
        {creatingLot && lotDescription.trim() && (
          <p className="lot-capture-preview" aria-live="polite">
            {describedLot.warnings.length
              ? describedLot.warnings.join('. ')
              : [
                  describedLot.name,
                  describedLot.startOn && `Starts ${labelDate(describedLot.startOn)}`,
                  describedLot.endExclusive &&
                    `Ends ${labelDate(addDays(describedLot.endExclusive, -1))}`,
                  describedLot.capacity && `${describedLot.capacity} spaces`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        )}
        <form
          className={`composer ${creatingLot ? 'creating-lot' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            void (creatingLot ? createLot() : park());
          }}
        >
          <div className="writing-bar">
            <textarea
              ref={composer}
              rows={1}
              wrap="off"
              aria-label={creatingLot ? 'Describe your new lot' : 'Idea to park'}
              aria-describedby="capture-preview"
              placeholder={creatingLot ? 'Side projects for 2 weeks max 5…' : 'Park a thought…'}
              value={creatingLot ? lotDescription : text}
              disabled={creatingLotBusy}
              onChange={(e) => {
                if (creatingLot) {
                  setLotDescription(e.target.value);
                  return;
                }
                draftRevision.current++;
                setText(e.target.value);
                setIgnoreDate(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void (creatingLot ? createLot() : park());
                }
                if (e.key === 'Escape' && creatingLot) setCreatingLot(false);
              }}
            />
            {!creatingLot && !isCommand && (
              <div className="capture-options">
                <button
                  type="button"
                  className="size-toggle"
                  aria-label={truck ? 'Big idea' : 'Compact'}
                  title={truck ? 'Big idea · 2 spaces' : 'Compact · 1 space'}
                  aria-pressed={truck}
                  onClick={() => setTruck((t) => !t)}
                >
                  <Vehicle truck={truck} />
                  <span className="size-label">{truck ? 'Big idea' : 'Compact'}</span>
                </button>
              </div>
            )}
            <button
              ref={submit}
              className="park-button"
              aria-label={creatingLot ? 'Create lot' : 'Park idea'}
              disabled={creatingLotBusy || !(creatingLot ? lotDescription : text).trim()}
              type="submit"
            >
              <Arrow />
            </button>
          </div>
        </form>
      </div>
      {panel && (
        <PanelShell
          title={
            panel.type === 'dropOff'
              ? 'Drop-off zone'
              : panel.type === 'new'
                ? 'New lot'
                : panel.type === 'settings'
                  ? 'Settings'
                  : panel.type === 'idea'
                    ? 'Idea details'
                    : (selectedLot?.name ?? 'Lot')
          }
          close={closePanel}
          modal={['new', 'editLot', 'idea'].includes(panel.type)}
        >
          {panel.type === 'dropOff' && (
            <div className="drop-off-details">{dropOffContent(true)}</div>
          )}
          {(panel.type === 'new' || panel.type === 'editLot') && (
            <LotEditor
              key={panel.type === 'editLot' ? panel.id : 'new'}
              existing={selectedLot}
              lots={lots}
              owner={account.id}
              save={async (lot) => {
                try {
                  const conflict = queue.find(
                    (p) => p.entity === 'lot' && p.entityId === lot.id && p.issue,
                  );
                  if (conflict) await db.resolve(conflict.id, 'mine', lot);
                  else await db.save('lot', lot);
                  engine.schedule();
                  setPanel({ type: 'lot', id: lot.id });
                  notify('Lot saved');
                } catch (e) {
                  throw e;
                }
              }}
            />
          )}
          {panel.type === 'lot' && selectedLot && (
            <>
              <div className="panel-lot-meta">
                {getLotStatus(selectedLot)} · {occupancy(ideas, selectedLot.id)}
                {selectedLot.capacity ? ` / ${selectedLot.capacity}` : ''} spaces
              </div>
              <p className="help">
                Action ID: <code>{selectedLot.id}</code>
              </p>
              <div className="lot-panel-preview">
                <MiniLot lot={selectedLot} ideas={ideas} hidden={hidden} geometry={false} />
              </div>
              {selectedLot.endExclusive && getLotStatus(selectedLot) === 'Ended' && (
                <p className="help">
                  This lot’s planned window ended. Your ideas are safe. Extend its dates to park
                  here again.
                </p>
              )}
              {ideas
                .filter(
                  (i) =>
                    i.lotId === selectedLot.id &&
                    (selectedLot.isArchived ? true : i.status === 'parked'),
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
                .map(row)}
              {!ideas.some((i) => i.lotId === selectedLot.id) && (
                <p className="empty-copy">Empty lot.</p>
              )}
              <div className="lot-panel-footer">
                {' '}
                <button
                  onClick={() => {
                    setDest(selectedLot.id);
                    closePanel();
                    composer.current?.focus();
                  }}
                >
                  Park here
                </button>
              </div>
              <details className="lot-extra">
                <summary>Lot options</summary>{' '}
                <div className="panel-actions">
                  {selectedLot.id !== 'general' && (
                    <>
                      <button onClick={() => setPanel({ type: 'editLot', id: selectedLot.id })}>
                        Edit lot
                      </button>
                      <button
                        onClick={() =>
                          run(() =>
                            db.save('lot', { ...selectedLot, isArchived: !selectedLot.isArchived }),
                          )
                        }
                      >
                        {selectedLot.isArchived ? 'Unarchive' : 'Archive lot'}
                      </button>
                      <MoveSlot
                        lot={selectedLot}
                        lots={lots}
                        save={(slot) =>
                          run(() => db.save('lot', { ...selectedLot, sortOrder: slot }))
                        }
                      />
                    </>
                  )}
                </div>
                <label className="field">
                  Move all parked ideas to
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const target = e.target.value;
                      if (!target) return;
                      void run(async () => {
                        for (const i of ideas.filter(
                          (i) => i.lotId === selectedLot.id && i.status === 'parked',
                        ))
                          await db.save('idea', { ...i, lotId: target });
                        notify('Ideas moved');
                      });
                      e.target.value = '';
                    }}
                  >
                    <option value="">Choose a lot…</option>
                    {normalLots
                      .filter((l) => l.id !== selectedLot.id && getLotStatus(l) !== 'Ended')
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id === 'general' ? 'Drop-off zone' : l.name}
                        </option>
                      ))}
                  </select>
                </label>
              </details>
            </>
          )}
          {panel.type === 'idea' && selectedIdea && (
            <IdeaEditor
              idea={selectedIdea}
              lots={lots}
              timing={timing(selectedIdea)}
              save={async (patch) => {
                const combined = { ...selectedIdea, ...patch };
                const conflict = queue.find(
                  (p) => p.entity === 'idea' && p.entityId === selectedIdea.id && p.issue,
                );
                if (conflict) await db.resolve(conflict.id, 'mine', combined);
                else await db.save('idea', combined);
                engine.schedule();
                notify('Idea saved');
              }}
              lifecycle={(status) => lifecycle(selectedIdea, status)}
            />
          )}
          {panel.type === 'settings' && (
            <>
              <div className="account-line">
                {account.avatar && <img src={account.avatar} alt="" referrerPolicy="no-referrer" />}
                <div>
                  <strong>{account.email}</strong>
                  <p>
                    {localOnly ? 'Browser-only park · no cloud account' : 'Private to your account'}
                  </p>
                </div>
              </div>
              {localOnly ? (
                <>
                  <h3>Google account</h3>
                  <p>
                    Sign in with Google to use Parker across devices. To move this browser’s ideas,
                    export a backup below, then import it in your signed-in park.
                  </p>
                  <p>
                    <a className="cloud-sign-in" href={cloudAppUrl}>
                      Sign in with Google
                    </a>
                  </p>
                  <h3>Storage</h3>
                  <p>
                    Saved in this browser. Your ideas stay on this device and are not synced to
                    other devices.
                  </p>
                </>
              ) : (
                <>
                  <h3>Sync</h3>
                  <ExpiredDevice db={db} engine={engine} exportAll={exportAll} notify={notify} />
                  <p>
                    {syncState} · {queue.length} changes waiting
                  </p>
                  <button onClick={() => void engine.run(true)}>Sync now</button>
                  {syncState === 'Sign in again' && reauthenticate}
                </>
              )}
              {queue
                .filter((p) => p.issue)
                .map((p) => (
                  <section className="conflict" key={p.id}>
                    <h4>Needs attention</h4>
                    <p>
                      {String(p.patch.title ?? p.patch.name ?? p.entityId)} · {p.issue?.code}
                    </p>
                    <details>
                      <summary>Compare versions</summary>
                      <pre>
                        {JSON.stringify(
                          { mutationId: p.id, mine: p.patch, synced: p.issue?.record },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                    <button onClick={() => run(() => db.resolve(p.id, 'mine'))}>Keep mine</button>
                    <button onClick={() => run(() => db.resolve(p.id, 'server'))}>
                      Use synced
                    </button>
                    <button
                      onClick={() =>
                        p.entity === 'idea'
                          ? showPanel({ type: 'idea', id: p.entityId })
                          : showPanel({ type: 'editLot', id: p.entityId })
                      }
                    >
                      Edit combined
                    </button>
                  </section>
                ))}
              {undos
                .filter((u) => u.issue)
                .map((u) => (
                  <p role="alert" key={u.id}>
                    Undo needs attention: {u.issue}
                    <button onClick={() => showPanel({ type: 'idea', id: u.ideaId })}>
                      Review idea
                    </button>
                  </p>
                ))}
              <h3>On this device</h3>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.reduced}
                  onChange={(e) => {
                    const next = { ...settings, reduced: e.target.checked };
                    setSettings(next);
                    void db.setMeta('settings', next);
                  }}
                />
                Reduce motion
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.rememberLot}
                  onChange={(e) => {
                    const next = {
                      ...settings,
                      rememberLot: e.target.checked,
                      defaultLot: e.target.checked ? destination : 'general',
                    };
                    setSettings(next);
                    void db.setMeta('settings', next);
                  }}
                />
                Remember my last destination
              </label>
              <RecoveredDrafts db={db} saved={() => engine.schedule()} notify={notify} />
              <h3>Your data</h3>
              <p className="help">
                {localOnly
                  ? 'Browser storage can be cleared. Export a JSON backup regularly; import it to move your park to another browser or device.'
                  : 'Cloud sync is private. Offline changes stay on this device until synced. Browser storage can be cleared; keep a backup. Free server quotas can pause syncing.'}
              </p>
              <button onClick={() => void exportAll()}>Export backup and pending work</button>
              <label className="file-label">
                Import JSON backup
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setImportPlan(await planImport(db, JSON.parse(await file.text())));
                    } catch (error) {
                      notify(String(error));
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {importPlan && (
                <section>
                  <h4>Import preview</h4>
                  <p>
                    {importPlan.lots.length} lots · {importPlan.ideas.length} ideas ·{' '}
                    {importPlan.updates} existing records
                  </p>
                  {importPlan.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={includeUpdates}
                      onChange={(e) => setIncludeUpdates(e.target.checked)}
                    />
                    Apply these existing-record updates
                  </label>
                  <p className="help">
                    Pending alternatives are kept as recoverable drafts, never sent automatically.
                  </p>
                  <button
                    onClick={() =>
                      run(async () => {
                        await mergeImport(db, importPlan, includeUpdates);
                        setImportPlan(null);
                        notify('Backup imported');
                      })
                    }
                  >
                    Confirm merge
                  </button>
                  {!localOnly && (
                    <details>
                      <summary>Replace all account data</summary>
                      <p>
                        This removes{' '}
                        {ideas.filter((i) => !importPlan.ideas.some((x) => x.id === i.id)).length}{' '}
                        ideas and{' '}
                        {
                          lots.filter(
                            (l) =>
                              l.id !== 'general' && !importPlan.lots.some((x) => x.id === l.id),
                          ).length
                        }{' '}
                        lots, and applies all records in this preview. Changes sync to every device.
                        A backup downloads before replacement.
                      </p>
                      <button
                        disabled={queue.length > 0 || syncState !== 'Synced'}
                        onClick={() =>
                          run(async () => {
                            await exportAll();
                            await replaceImport(db, importPlan);
                            setImportPlan(null);
                            notify('Replacement queued. Sync progress is shown above.');
                          })
                        }
                      >
                        Back up and confirm account-wide replacement
                      </button>
                    </details>
                  )}
                  <button onClick={() => setImportPlan(null)}>Cancel import</button>
                </section>
              )}
              <h3>Install Parker</h3>
              <p className="help">
                iPhone: open in Safari, Share → Add to Home Screen. Mac: use your browser’s Install
                or Add to Dock.{' '}
                {localOnly
                  ? 'Open Parker online once before using it offline.'
                  : 'Sign in online once before using Parker offline.'}
              </p>
              {update && (
                <button
                  onClick={() => {
                    if (text.trim()) {
                      notify('Park or copy your draft before updating.');
                      return;
                    }
                    void update();
                  }}
                >
                  Update available · Reload
                </button>
              )}
              {!localOnly && (
                <>
                  <h3>Account</h3>
                  <div className="panel-actions">
                    <button onClick={() => void logout()}>Sign out</button>
                    <button onClick={() => void logout(true)}>Sign out all devices</button>
                  </div>
                  {(queue.length > 0 || collectRecovered(recoveredWork).length > 0) && (
                    <button
                      onClick={() =>
                        run(async () => {
                          await exportAll();
                          engine.dispose();
                          await db.delete();
                          signOut();
                        })
                      }
                    >
                      Export pending work and sign out locally
                    </button>
                  )}
                  <DeleteAccount
                    engine={engine}
                    pending={queue.length > 0}
                    exportAll={exportAll}
                    done={async () => {
                      engine.dispose();
                      await db.delete();
                      signOut();
                    }}
                    reauthenticate={reauthenticate}
                    started={deleting}
                  />
                </>
              )}
            </>
          )}
        </PanelShell>
      )}
    </div>
  );
}
function PanelShell({
  title,
  close,
  modal,
  children,
}: {
  title: string;
  close: () => void;
  modal: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (modal) d?.showModal();
    else d?.show();
    return () => d?.close();
  }, [modal]);
  return (
    <dialog
      ref={ref}
      className={`panel ${modal ? 'modal' : ''}`}
      aria-labelledby="panel-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="panel-heading">
        <h2 id="panel-title">{title}</h2>
        <button aria-label="Close panel" onClick={close}>
          ×
        </button>
      </div>
      <div className="panel-body">{children}</div>
    </dialog>
  );
}
function LotEditor({
  existing,
  lots,
  owner,
  save,
}: {
  existing?: Lot;
  lots: Lot[];
  owner: string;
  save: (l: Lot) => Promise<void>;
}) {
  const prefix = `park-draft:${owner}:lot:${existing?.id ?? 'new'}:`;
  const [input, setInput] = useDraftState(prefix + 'input', ''),
    [manual, setManual] = useDraftState(prefix + 'manual', !!existing),
    [name, setName] = useDraftState(prefix + 'name', existing?.name ?? ''),
    [start, setStart] = useDraftState(prefix + 'start', existing?.startOn ?? ''),
    [end, setEnd] = useDraftState(
      prefix + 'end',
      existing?.endExclusive ? addDays(existing.endExclusive, -1) : '',
    ),
    [capacity, setCapacity] = useDraftState(
      prefix + 'capacity',
      existing?.capacity?.toString() ?? '',
    ),
    [strict, setStrict] = useDraftState(prefix + 'strict', existing?.capacityPolicy === 'strict'),
    [accent, setAccent] = useDraftState(prefix + 'accent', existing?.accent ?? 'blue'),
    [error, setError] = useState('');
  const parsed = parseLotInput(input);
  const editingGeneral = existing?.id === 'general';
  const switchManual = () => {
    setName(parsed.name);
    setStart(parsed.startOn ?? '');
    setEnd(parsed.endExclusive ? addDays(parsed.endExclusive, -1) : '');
    setCapacity(parsed.capacity?.toString() ?? '');
    setManual(true);
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          if (!manual && parsed.warnings.length) throw new Error(parsed.warnings.join('. '));
          const now = new Date().toISOString();
          const l: Lot = {
            ...(existing ?? {
              id: crypto.randomUUID(),
              ownerId: owner,
              createdAt: now,
              serverVersion: 0,
              isArchived: false,
              endedPromptDismissedFor: null,
              sortOrder: nextSlot(lots),
            }),
            name: manual ? name.trim() : parsed.name,
            nameKey: nameKey(manual ? name : parsed.name),
            startOn: manual ? start || null : parsed.startOn,
            endExclusive: manual ? (end ? addDays(end, 1) : null) : parsed.endExclusive,
            capacity: manual ? (capacity ? Number(capacity) : null) : parsed.capacity,
            capacityPolicy: strict ? 'strict' : 'soft',
            accent: accent as Lot['accent'],
            updatedAt: now,
          };
          await save(l);
          for (const key of Object.keys(sessionStorage))
            if (key.startsWith(`park-draft:${owner}:lot:${existing?.id ?? 'new'}:`))
              sessionStorage.removeItem(key);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }}
    >
      {!manual ? (
        <>
          <label className="field">
            One sentence
            <input
              autoFocus
              aria-label="Describe your new lot"
              placeholder="Post surgery for 2 weeks starting Tuesday max 5"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
          <div className="parse-chips">
            <button type="button" onClick={switchManual}>
              {parsed.name || 'Lot name'}
            </button>
            <button type="button" onClick={switchManual}>
              {parsed.startOn ? `Starts ${labelDate(parsed.startOn)}` : 'No start date'}
            </button>
            <button type="button" onClick={switchManual}>
              {parsed.endExclusive
                ? `Ends ${labelDate(addDays(parsed.endExclusive, -1))}`
                : 'No end date'}
            </button>
            <button type="button" onClick={switchManual}>
              {parsed.capacity ? `${parsed.capacity} spaces` : 'Unlimited'}
            </button>
          </div>
          {parsed.warnings.map((w) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
          <button type="button" onClick={switchManual}>
            Edit details manually
          </button>
          {parsed.warnings.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setName(parsed.name || input);
                setStart('');
                setEnd('');
                setCapacity('');
                setManual(true);
              }}
            >
              Use name only
            </button>
          )}
        </>
      ) : (
        <>
          <label className="field">
            Name
            <input
              autoFocus
              required
              maxLength={120}
              value={name}
              disabled={editingGeneral}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            Start date
            <input
              type="date"
              value={start}
              disabled={editingGeneral}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            End date · inclusive
            <input
              type="date"
              value={end}
              disabled={editingGeneral}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="field">
            Spaces · blank means unlimited
            <input
              type="number"
              min={1}
              max={99}
              value={capacity}
              disabled={editingGeneral}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
        </>
      )}
      {manual && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={strict}
              disabled={editingGeneral}
              onChange={(e) => setStrict(e.target.checked)}
            />
            Strict capacity · stop new arrivals when full
          </label>
          <label className="field">
            Accent
            <select
              value={accent}
              onChange={(e) => setAccent(e.target.value as 'blue' | 'green' | 'gold' | 'coral')}
            >
              {['blue', 'green', 'gold', 'coral'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="help">
            Ideas become ready when this lot starts, unless an idea has a later date. Lowering a
            limit keeps existing cars safe.
          </p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="primary" type="submit">
        {existing ? 'Save lot' : 'Create lot'}
      </button>
    </form>
  );
}
function IdeaEditor({
  idea,
  lots,
  timing,
  save,
  lifecycle,
}: {
  idea: Idea;
  lots: Lot[];
  timing: string;
  save: (p: Partial<Idea>) => Promise<void>;
  lifecycle: (s: Idea['status']) => void;
}) {
  const [draft, setDraft] = useDraftState(`park-draft:${idea.ownerId}:idea:${idea.id}`, idea),
    [error, setError] = useState('');
  const apply = async (p: Partial<Idea>) => {
    try {
      await save(p);
      setDraft((current) => ({ ...current, ...p }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <p className="panel-lot-meta">
        {timing} · {idea.status}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void apply({
            title: draft.title,
            notes: draft.notes,
            kind: draft.kind,
            vehicleSize: draft.vehicleSize,
            lotId: draft.lotId,
            revisitOn: draft.revisitOn,
            datePrecision:
              draft.revisitOn === idea.revisitOn
                ? idea.datePrecision
                : draft.revisitOn
                  ? 'day'
                  : null,
          });
        }}
      >
        <label className="field">
          Title
          <textarea
            required
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="field">
          Notes
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <label className="field">
          Kind
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as Idea['kind'] })}
          >
            <option value="idea">Idea</option>
            <option value="task">Task · offers Complete</option>
          </select>
        </label>
        <label className="field">
          Vehicle size
          <select
            value={draft.vehicleSize}
            onChange={(e) =>
              setDraft({ ...draft, vehicleSize: e.target.value as Idea['vehicleSize'] })
            }
          >
            <option value="compact">Compact · 1 space</option>
            <option value="truck">Big idea · 2 spaces</option>
          </select>
        </label>
        <label className="field">
          Lot
          <select
            value={draft.lotId}
            onChange={(e) => setDraft({ ...draft, lotId: e.target.value })}
          >
            {lots
              .filter((l) => !l.isArchived || l.id === idea.lotId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id === 'general' ? 'Drop-off zone' : l.name}
                  {l.isArchived ? ' · Archived' : ''}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          Revisit date
          <input
            type="date"
            value={draft.revisitOn ?? ''}
            onChange={(e) => setDraft({ ...draft, revisitOn: e.target.value || null })}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="primary">
          Save idea
        </button>
      </form>
      <h3>Later</h3>
      <div className="panel-actions">
        {['tomorrow', 'week', 'month', 'someday'].map((p) => (
          <button
            key={p}
            onClick={() =>
              void apply({
                revisitOn: laterDate(p),
                datePrecision:
                  p === 'someday' ? null : p === 'week' ? 'week' : p === 'month' ? 'month' : 'day',
              })
            }
          >
            {p === 'week'
              ? 'Next week'
              : p === 'month'
                ? 'Next month'
                : p === 'someday'
                  ? 'Someday'
                  : 'Tomorrow'}
          </button>
        ))}
      </div>
      <div className="panel-actions">
        {idea.status !== 'active' && idea.status !== 'archived' && (
          <button onClick={() => lifecycle('active')}>Start</button>
        )}
        {idea.status !== 'archived' ? (
          <button onClick={() => lifecycle('archived')}>Archive</button>
        ) : (
          <button
            onClick={() =>
              void apply({
                status: 'parked',
                archivedAt: null,
                archiveReason: null,
                lotId: draft.lotId,
              })
            }
          >
            Restore to selected lot
          </button>
        )}
      </div>
      <details>
        <summary>Original capture</summary>
        <p className="original">{idea.originalText}</p>
        <p className="help">
          Action ID: <code>{idea.id}</code>
        </p>
      </details>
    </>
  );
}
function DeleteAccount({
  started,
  engine,
  pending,
  exportAll,
  done,
  reauthenticate,
}: {
  started: () => void;
  engine: SyncEngine;
  pending: boolean;
  exportAll: () => Promise<void>;
  done: () => Promise<void>;
  reauthenticate: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState(''),
    [exported, setExported] = useState(false),
    [message, setMessage] = useState('');
  return (
    <section className="delete-account">
      <button onClick={() => setOpen(!open)}>Delete account and cloud data…</button>
      {open && (
        <>
          <p>
            This permanently removes your lots, ideas, Google linkage, and sessions. Export your
            work first, then sign in again to confirm your identity.
          </p>
          <button
            onClick={async () => {
              await exportAll();
              setExported(true);
            }}
          >
            Export before deletion
          </button>
          {reauthenticate}
          <label className="field">
            Type DELETE
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button
            disabled={confirm !== 'DELETE' || !exported || pending}
            onClick={async () => {
              try {
                const me = await engine.request('/api/me');
                engine.csrf = me.csrf;
                const result = await engine.request('/api/me', {
                  method: 'DELETE',
                  body: JSON.stringify({ confirm }),
                });
                if (result.deletionToken) {
                  started();
                }
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            Permanently delete account
          </button>
          {pending && <p>Sync or resolve pending work before deleting.</p>}
          <p role="status">{message}</p>
        </>
      )}
    </section>
  );
}

function RecoveredDrafts({
  db,
  saved,
  notify,
}: {
  db: ParkerDB;
  saved: () => void;
  notify: (s: string) => void;
}) {
  const source = useLiveQuery(() => db.getMeta<unknown>('recoveredDrafts', null), [db]);
  const drafts = collectRecovered(source);
  if (!drafts.length) return null;
  return (
    <section>
      <h3>Recovered drafts · {drafts.length}</h3>
      <p className="help">
        These alternatives came from your backup. Recover one as a new record; the original stays
        available.
      </p>
      {drafts.map((d, n) => (
        <details key={n}>
          <summary>{String(d.record.title ?? d.record.name)}</summary>
          <pre>{JSON.stringify(d.record, null, 2)}</pre>
          <button
            onClick={async () => {
              try {
                const now = new Date().toISOString();
                const id = crypto.randomUUID();
                if (d.entity === 'idea') {
                  const r = d.record;
                  await db.save('idea', {
                    ...r,
                    id,
                    ownerId: db.owner,
                    lotId: 'general',
                    status: 'parked',
                    kind: r.kind === 'task' ? 'task' : 'idea',
                    vehicleSize: r.vehicleSize === 'truck' ? 'truck' : 'compact',
                    originalText: String(r.originalText ?? r.title),
                    title: String(r.title),
                    notes: String(r.notes ?? ''),
                    revisitOn: typeof r.revisitOn === 'string' ? r.revisitOn : null,
                    datePrecision: r.datePrecision ?? null,
                    dateLabel: null,
                    activatedAt: null,
                    archivedAt: null,
                    archiveReason: null,
                    createdAt: now,
                    updatedAt: now,
                    serverVersion: 0,
                  } as Idea);
                } else {
                  const lots = await db.lots.toArray();
                  const name = String(d.record.name) + ' (recovered)';
                  await db.save('lot', {
                    ...general(db.owner),
                    ...d.record,
                    id,
                    ownerId: db.owner,
                    name,
                    nameKey: nameKey(name),
                    sortOrder: nextSlot(lots),
                    createdAt: now,
                    updatedAt: now,
                    serverVersion: 0,
                  } as Lot);
                }
                saved();
                notify('Draft recovered as a new record');
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            Recover {d.entity === 'idea' ? 'as a new idea in Drop-off zone' : 'as a new lot'}
          </button>
        </details>
      ))}
    </section>
  );
}

function MoveSlot({ lot, lots, save }: { lot: Lot; lots: Lot[]; save: (slot: number) => void }) {
  const [slot, setSlot] = useState(nextSlot(lots));
  const reserved = new Set([
    ...lots.filter((l) => l.id !== lot.id).map((l) => l.sortOrder),
    ...displaySlots(lots.filter((l) => l.id !== lot.id)).values(),
  ]);
  return (
    <label className="map-move">
      Map slot
      <input
        type="number"
        min={1}
        step={1}
        aria-label="Map slot"
        value={slot}
        onChange={(e) => setSlot(Number(e.target.value))}
      />
      <button
        disabled={!Number.isInteger(slot) || slot < 1 || reserved.has(slot)}
        onClick={() => save(slot)}
      >
        Move on map
      </button>
      {reserved.has(slot) && <small>That slot is reserved.</small>}
    </label>
  );
}

function useDraftState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}
function ExpiredDevice({
  db,
  engine,
  exportAll,
  notify,
}: {
  db: ParkerDB;
  engine: SyncEngine;
  exportAll: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const device = useLiveQuery(() => db.getMeta<{ expiresAt: number } | null>('device', null), [db]);
  const issues = useLiveQuery(() => db.queue.toArray(), [db], []) ?? [];
  if (
    !device ||
    (device.expiresAt > Date.now() && !issues.some((p) => p.issue?.code === 'device_expired'))
  )
    return null;
  return (
    <section className="conflict">
      <p>
        This device’s registration expired. Export your work, then reconcile against a fresh cloud
        copy. Old proposed versions remain available as recovered drafts and are never automatically
        resubmitted.
      </p>
      <button
        onClick={async () => {
          try {
            await exportAll();
            const backup = await db.backup();
            await db.transaction('rw', [db.queue, db.meta, db.ideas, db.lots, db.ack], async () => {
              await db.setMeta('recoveredDrafts', [
                ...collectRecovered(await db.getMeta('recoveredDrafts', null)),
                ...collectRecovered(backup.pendingWork),
              ]);
              for (const p of await db.queue.toArray()) {
                const base = await db.ack.get(`${p.entity}:${p.entityId}`);
                const table = p.entity === 'idea' ? db.ideas : db.lots;
                if (base?.record) await table.put(base.record as Idea & Lot);
                else if (p.entityId !== 'general') await table.delete(p.entityId);
              }
              await db.queue.clear();
              await db.meta.delete('device');
              await db.meta.delete('cursor');
            });
            engine.paused = false;
            await engine.run(true);
            notify('Device reconciled. Review recovered drafts before submitting them.');
          } catch (e) {
            notify(String(e));
          }
        }}
      >
        Export and reconcile expired device
      </button>
    </section>
  );
}

function DeletionProgress({
  done,
  reauthenticate,
}: {
  done: () => Promise<void>;
  reauthenticate: ReactNode;
}) {
  const [message, setMessage] = useState('Deleting your account data…'),
    [expired, setExpired] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch('/api/deletion');
        if (r.status === 401) {
          if (!stopped) {
            setExpired(true);
            setMessage('Sign in again to resume account deletion.');
          }
          return;
        }
        if (!r.ok) throw new Error('Deletion paused. Your account is locked. Reconnect and retry.');
        const b = await r.json();
        if (stopped) return;
        if (b.complete) {
          setMessage('Deletion complete');
          await done();
        } else timer = setTimeout(() => void poll(), 500);
      } catch (e) {
        if (!stopped) setMessage(String(e));
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [retry]);
  return (
    <main className="deletion-screen">
      <Wordmark />
      <h1>Account deletion</h1>
      <p role="status">{message}</p>
      {expired ? (
        reauthenticate
      ) : (
        <button onClick={() => setRetry((n) => n + 1)}>Retry deletion progress</button>
      )}
    </main>
  );
}
