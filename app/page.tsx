'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Check, FileSpreadsheet, LogOut, Plus, RotateCcw, Search, Settings, Trash2, Upload, Users, X } from 'lucide-react';
import DoorPreview from './preview-door/preview';
import './preview-door/preview.css';
import { staffRoles } from '../lib/staff-roles';
import { allocationFor, guestFromLine, parseDelimited, parseTabularRows, typeClass, type ImportedGuest } from '../lib/guest-import';

type Guest = { id: number; name: string; host: string; type: string; allocation: number; checked: number; note?: string };
type NewGuest = ImportedGuest;
type Session = { staff?: string; role: string; permissions: string[] };
type EventState = { inside: number; out_count: number; normal_entries: number; capacity: number; title: string; venue: string };
type StateResponse = { guests: Guest[]; event: EventState; session: Session };
type SetupResponse = { needsSetup?: boolean };
type SessionResponse = { session?: Session | null };
type ErrorResponse = { error?: string };
type ImportMode = 'update' | 'replace';
const demoGuests: Guest[] = [
  { id: -1, name: 'Anouk V +4', host: 'Tam Tam', type: 'Guestlist', allocation: 5, checked: 2, note: 'Birthday table' },
  { id: -2, name: 'Mika Rosen', host: 'Door', type: 'Skip list', allocation: 1, checked: 0 },
  { id: -3, name: 'Sasha K +1', host: 'PDA', type: 'Solid list', allocation: 2, checked: 2 },
  { id: -4, name: 'Jo Almeida +2', host: 'Laurel', type: 'Other', allocation: 3, checked: 0, note: 'Press' },
];

async function parseUpload(file: File): Promise<NewGuest[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['xlsx', 'csv', 'tsv'].includes(extension ?? '')) {
    let rows: unknown[][];
    if (extension === 'xlsx') { const ExcelJS = await import('exceljs'); const book = new ExcelJS.Workbook(); await book.xlsx.load(await file.arrayBuffer()); const sheet = book.worksheets[0]; rows = []; sheet?.eachRow({ includeEmpty: false }, (row) => rows.push((row.values as unknown[]).slice(1).map((value) => typeof value === 'object' && value && 'text' in value ? String((value as { text: unknown }).text) : value ?? ''))); }
    else rows = parseDelimited(await file.text(), extension === 'tsv' ? '\t' : ',');
    return parseTabularRows(rows);
  }
  let text = '';
  if (extension === 'docx') { const mammoth = await import('mammoth/mammoth.browser'); text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value; }
  else if (extension === 'pdf') { const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const pages = []; for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) { const content = await (await pdf.getPage(pageNumber)).getTextContent(); pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' ')); } text = pages.join('\n'); }
  else text = await file.text();
  let activeType = 'Guestlist'; const guests: NewGuest[] = [];
  for (const rawLine of text.split(/\r?\n/)) { const line = rawLine.trim(); if (!line) continue; const heading = line.match(/^(guest\s*list|skip\s*list|soli(?:d)?\s*list|other)\s*:?$/i); if (heading) { activeType = heading[1].trim(); continue; } const guest = guestFromLine(line.replace(/^[-•*]\s*/, ''), activeType); if (guest) guests.push(guest); }
  return guests;
}

function entryKind(type: string): 'free' | 'soli' | 'normal' {
  const value = type.toLowerCase();
  if (value.includes('soli') || value.includes('solid')) return 'soli';
  if (value.includes('guest') || value.includes('free')) return 'free';
  return 'normal';
}

const themes = [
  { id: 'afterdark', name: 'After Dark' },
  { id: 'basement', name: 'Pink Basement' },
  { id: 'velvet', name: 'Violet Velvet' },
  { id: 'daylight', name: 'Pink Daylight' },
] as const;

function ThemePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="theme-picker"><span>Colours</span><select aria-label="Colour theme" value={value} onChange={(e) => onChange(e.target.value)}>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>;
}

export default function Home() {
  const [theme, setTheme] = useState('afterdark');
  useEffect(() => { try { const saved = localStorage.getItem('pda-colour-theme'); if (themes.some((item) => item.id === saved)) setTheme(saved!); } catch {} }, []);
  const chooseTheme = (value: string) => { setTheme(value); try { localStorage.setItem('pda-colour-theme', value); } catch {} };

  const [guests, setGuests] = useState<Guest[]>(demoGuests);
  const [event, setEvent] = useState<EventState>({ inside: 0, out_count: 0, normal_entries: 0, capacity: 550, title: 'Public Display of Affection', venue: 'Berlin' });
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<'loading' | 'setup' | 'login' | 'open'>('loading');
  const [query, setQuery] = useState(''); const [activeType, setActiveType] = useState('All');
  const [staffName, setStaffName] = useState('');
  const [role, setRole] = useState('downstairs'); const [pin, setPin] = useState(''); const [sharedPin, setSharedPin] = useState(''); const [gateError, setGateError] = useState('');
  const [importOpen, setImportOpen] = useState(false); const [parsed, setParsed] = useState<NewGuest[]>([]); const [fileName, setFileName] = useState(''); const [importMode, setImportMode] = useState<ImportMode>('update'); const [importError, setImportError] = useState(''); const [importBusy, setImportBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false); const [newName, setNewName] = useState(''); const [newType, setNewType] = useState('Guestlist'); const [newGroup, setNewGroup] = useState(''); const [addError, setAddError] = useState(''); const [addBusy, setAddBusy] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false); const [capacity, setCapacity] = useState('550'); const [settingsError, setSettingsError] = useState(''); const [settingsNotice, setSettingsNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const syncGeneration = useRef(0); const mutationsInFlight = useRef(0);

  const loadState = useCallback(async () => { const generation = syncGeneration.current; const response = await fetch('/api/state', { cache: 'no-store' }); if (!response.ok) { if (response.status === 401) { setSession(null); setGate('login'); } return false; } const data = await response.json() as StateResponse; if (generation !== syncGeneration.current || mutationsInFlight.current > 0) return true; setGuests(data.guests); setEvent(data.event); setSession(data.session); setGate('open'); return true; }, []);
  useEffect(() => { (async () => { try { const setup = await (await fetch('/api/setup')).json() as SetupResponse; if (setup.needsSetup) { setGate('setup'); return; } const sessionData = await (await fetch('/api/session')).json() as SessionResponse; if (sessionData.session && sessionData.session.staff !== 'Team member') await loadState(); else setGate('login'); } catch { setGate('login'); } })(); }, [loadState]);
  useEffect(() => { if (gate !== 'open') return; const timer = window.setInterval(loadState, 5000); return () => window.clearInterval(timer); }, [gate, loadState]);

  const guestTypes = useMemo(() => Array.from(new Set(guests.map((guest) => guest.type.trim()).filter(Boolean))), [guests]);
  const filters = useMemo(() => ['All', ...guestTypes], [guestTypes]);
  const parsedTypes = useMemo(() => Array.from(new Set(parsed.map((guest) => guest.type.trim()).filter(Boolean))), [parsed]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return guests.filter((guest) => (activeType === 'All' || guest.type === activeType) && (!needle || `${guest.name} ${guest.host} ${guest.type} ${guest.note ?? ''}`.toLowerCase().includes(needle))); }, [activeType, guests, query]);
  const checked = guests.reduce((total, guest) => total + guest.checked, 0); const slots = guests.reduce((total, guest) => total + guest.allocation, 0);
  const freeEntries = guests.filter((guest) => entryKind(guest.type) === 'free').reduce((total, guest) => total + guest.checked, 0);
  const soliEntries = guests.filter((guest) => entryKind(guest.type) === 'soli').reduce((total, guest) => total + guest.checked, 0);
  const normalEntries = event.normal_entries + guests.filter((guest) => entryKind(guest.type) === 'normal').reduce((total, guest) => total + guest.checked, 0);
  const totalAdmissions = event.normal_entries + checked;

  const submitGate = async () => { setGateError(''); const endpoint = gate === 'setup' ? '/api/setup' : '/api/session'; const body = gate === 'setup' ? { adminPin: pin, sharedPin } : { role, pin, staff: staffName }; const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json() as ErrorResponse; if (!response.ok) { setGateError(data.error ?? 'Could not sign in'); return; } setPin(''); await loadState(); };
  const mutate = async (body: object) => { setActionError(''); syncGeneration.current += 1; mutationsInFlight.current += 1; try { const response = await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json() as ErrorResponse; if (!response.ok) setActionError(data.error ?? 'That action could not be saved. Please try again.'); return { ok: response.ok, error: data.error }; } catch { setActionError('Connection problem. Your action may not have saved. Check the count before trying again.'); return { ok: false, error: 'Connection problem. Please try again.' }; } finally { syncGeneration.current += 1; mutationsInFlight.current -= 1; if (mutationsInFlight.current === 0) void loadState().catch(() => setActionError('Could not refresh the list. Please check your connection.')); } };
  const checkIn = (guest: Guest, amount = 1) => { const admitted = Math.min(amount, Math.max(0, guest.allocation - guest.checked)); setGuests((current) => current.map((item) => item.id === guest.id ? { ...item, checked: Math.min(item.allocation, item.checked + amount) } : item)); setEvent((current) => ({ ...current, inside: current.inside + admitted })); void mutate({ action: 'check', id: guest.id, amount }); };
  const count = (direction: 'in' | 'out') => { setEvent((current) => ({ ...current, inside: Math.max(0, current.inside + (direction === 'in' ? 1 : -1)), out_count: current.out_count + (direction === 'out' ? 1 : 0), normal_entries: current.normal_entries + (direction === 'in' ? 1 : 0) })); void mutate({ action: 'counter', direction }); };
  const chooseFile = async (file?: File) => { if (!file) return; setImportError(''); setFileName(file.name); try { const result = await parseUpload(file); setParsed(result); if (!result.length) setImportError('No guest names were found. Check the headings or file format.'); } catch { setImportError('This file could not be read. Try XLSX, CSV, DOCX, PDF, TXT or TSV.'); } };
  const importGuests = async () => { if (!parsed.length || importBusy) return; if (importMode === 'replace' && !window.confirm('Replace every current name with this file? Existing check-ins will also be removed.')) return; setImportBusy(true); setImportError(''); const result = await mutate({ action: 'import', guests: parsed, replace: importMode === 'replace' }); setImportBusy(false); if (!result.ok) { setImportError(result.error ?? 'Import failed'); return; } setImportOpen(false); setParsed([]); setFileName(''); setImportMode('update'); setActiveType('All'); };
  const openAddGuest = () => { setNewName(''); setNewGroup(''); setNewType(guestTypes[0] ?? (session?.role === 'admin' ? '__new__' : 'Guestlist')); setAddError(''); setAddOpen(true); };
  const addGuest = async () => { if (!newName.trim() || addBusy) return; const selectedType = newType === '__new__' ? newGroup.trim() : newType; if (!selectedType) { setAddError('Enter a name for the new group.'); return; } setAddBusy(true); setAddError(''); const result = await mutate({ action: 'add-guest', guests: [{ name: newName.trim(), type: selectedType, host: 'Door', allocation: allocationFor(newName) }] }); setAddBusy(false); if (!result.ok) { setAddError(result.error ?? 'Could not add this guest'); return; } setNewName(''); setNewGroup(''); setActiveType(selectedType); setAddOpen(false); };
  const signOut = async () => { await fetch('/api/session', { method: 'DELETE' }); setSession(null); setGate('login'); };
  const openSettings = () => { setCapacity(String(event.capacity)); setSettingsError(''); setSettingsNotice(''); setSettingsOpen(true); };
  const adminAction = async (body: object, notice: string) => { setSettingsError(''); setSettingsNotice(''); const result = await mutate(body); if (!result.ok) { setSettingsError(result.error ?? 'Could not update settings'); return; } setSettingsNotice(notice); setActiveType('All'); };
  const openImport = (mode: ImportMode = 'update') => { setImportMode(mode); setParsed([]); setFileName(''); setImportError(''); setImportOpen(true); };
  const updateFromFile = () => { setSettingsOpen(false); openImport('update'); };

  return <main className="app-shell" data-theme={theme}>
    <header className="topbar"><div className="brand-lockup" aria-label="PDA Door"><img src="/pda-logo.jpg" alt="PDA" className="brand-mark" /><div><strong>DOOR</strong><span>BERLIN · LIVE</span></div></div><div className="event-title"><span>PUBLIC DISPLAY OF AFFECTION</span><strong>{event.venue.toUpperCase()}</strong></div><div className="header-tools"><ThemePicker value={theme} onChange={chooseTheme} /><button className="profile-button" aria-label="Sign out" onClick={signOut}><span className="live-dot" />{session?.role?.replace('-', ' ').toUpperCase() ?? 'LOCKED'}<LogOut size={13} /></button></div></header>
    {actionError && <p role="alert" className="form-error">{actionError}</p>}<section className="control-strip"><div className="counter-card counter-main"><div><span>Inside now</span><strong>{event.inside}</strong></div><div className="counter-actions"><button onClick={() => count('in')} disabled={!session?.permissions.includes('counter')}><ArrowUp size={22} />IN</button><button onClick={() => count('out')} disabled={!session?.permissions.includes('counter')}><ArrowDown size={22} />OUT</button></div></div><div className="metric"><span>Departures</span><strong>{event.out_count}</strong><small>tonight</small></div><div className="metric"><span>Total arrivals</span><strong>{totalAdmissions}</strong><small>all entry types</small></div><div className="metric accent capacity-metric" aria-label="Club capacity"><span>Club capacity</span><strong>{Math.round((event.inside / event.capacity) * 100)}%</strong><small>{event.inside} / {event.capacity} inside · {Math.max(0, event.capacity - event.inside)} remaining</small><div className="capacity-fill" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, event.inside / event.capacity * 100))}%` }} /></div></div></section>
    <section className="workspace"><aside className="sidebar"><nav><button className="nav-item active"><Users size={17} />Guestlist<b>{guests.length}</b></button>{session?.permissions.includes('import') && <button className="nav-item" onClick={() => openImport()}><Upload size={17} />Import file</button>}{session?.role === 'admin' && <button className="nav-item" onClick={openSettings}><Settings size={17} />Settings</button>}</nav><div className="shift-note"><span>Good to know</span><p>SOLI guests receive reduced entry. Check in each person with one tap. Use Notes & checks for notes and entry decisions.</p><small>Guestlist guests enter for free. All other groups use general entry.</small></div><div className="sync-state"><span className="live-dot" />Your team’s devices update every 5 seconds</div></aside>
      <div className="guest-panel"><div className="panel-heading"><div><p>Tonight at PDA</p></div><div className="heading-actions">{session?.role === 'admin' && <button className="import-button" onClick={openSettings}><Settings size={17} />Settings</button>}{session?.permissions.includes('import') && <button className="import-button" onClick={openAddGuest}><Plus size={17} />Add guest</button>}{session?.permissions.includes('import') && <button className="import-button primary" onClick={() => openImport()}><Upload size={17} />Import list</button>}</div></div>
        <section className="entry-overview" aria-label="Tonight so far"><div className="overview-title"><BarChart3 size={18} /><div><strong>Tonight so far</strong><span>{totalAdmissions} admitted · {event.out_count} out · {event.inside} inside · {checked}/{slots} list slots</span></div></div>{[{ label: 'General entry', value: normalEntries, className: 'normal' }, { label: 'Guestlist · free entry', value: freeEntries, className: 'free' }, { label: 'SOLI · reduced entry', value: soliEntries, className: 'soli' }].map((item) => <div className="overview-stat" key={item.label}><span>{item.label}</span><strong>{item.value}</strong><i><b className={item.className} style={{ width: `${totalAdmissions ? Math.max(3, (item.value / totalAdmissions) * 100) : 0}%` }} /></i></div>)}</section>
        {gate === 'open' && session && <DoorPreview live={{ session, theme, onChange: loadState }} />}

      </div></section>

    {gate !== 'open' && <div className="modal-backdrop"><section className="gate-card"><img src="/pda-logo.jpg" alt="PDA" /><ThemePicker value={theme} onChange={chooseTheme} /><h2>{gate === 'setup' ? 'Set up the team' : gate === 'loading' ? 'Opening tonight’s list…' : 'How are you helping tonight?'}</h2>{gate !== 'loading' && <>{gate === 'login' && <div className="role-grid">{Object.keys(staffRoles).map((item) => <button key={item} onClick={() => setRole(item)} className={role === item ? 'selected' : ''}>{staffRoles[item as keyof typeof staffRoles].label}</button>)}</div>}{gate === 'login' && <label>Your name<input value={staffName} maxLength={60} onChange={(e) => setStaffName(e.target.value)} placeholder="For your checks and notes" /></label>}<label>{gate === 'setup' || role === 'admin' || role === 'manager' ? 'Admin PIN' : 'Your team PIN'}<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitGate()} placeholder="4+ characters" /></label>{gate === 'setup' && <label>Team PIN <small>Used by Downstairs, Picker, Awareness, Club Manager and Kasse</small><input type="password" value={sharedPin} onChange={(e) => setSharedPin(e.target.value)} placeholder="4+ characters" /></label>}{gateError && <p className="form-error">{gateError}</p>}<button className="gate-submit" onClick={submitGate}>{gate === 'setup' ? 'Create private team access' : 'Open tonight’s list'}</button><small className="privacy-note">Here with the team? You can share a role and PIN and sign in on several devices.</small></>}</section></div>}

    {importOpen && <div className="modal-backdrop"><section className="modal-card"><button className="modal-close" onClick={() => !importBusy && setImportOpen(false)} disabled={importBusy}><X /></button><p className="eyebrow">Bring in a guest list</p><h2>Add names from a file</h2>{session?.role === 'admin' && <div className="import-mode" role="group" aria-label="Import mode"><button className={importMode === 'update' ? 'selected' : ''} onClick={() => setImportMode('update')}><strong>Update list</strong><small>Keep current names and check-ins. Add new names and refresh matches.</small></button><button className={importMode === 'replace' ? 'selected danger' : ''} onClick={() => setImportMode('replace')}><strong>Replace list</strong><small>Remove every current name, then load only this file.</small></button></div>}<p className="modal-copy">Each populated column heading becomes its list name exactly as written. “Name +4” creates five check-in slots.</p><input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.tsv,.txt,.docx,.pdf" onChange={(e) => chooseFile(e.target.files?.[0])} /><button className="drop-zone" onClick={() => fileRef.current?.click()} disabled={importBusy}><FileSpreadsheet size={30} /><strong>{fileName || 'Choose an Excel, document or text file'}</strong><span>XLSX · CSV · TSV · DOCX · PDF · TXT</span></button>{parsed.length > 0 && <div className="import-summary"><strong>{parsed.length} names found</strong><div>{parsedTypes.map((type) => <span key={type}>{type}: {parsed.filter((g) => g.type === type).length}</span>)}</div></div>}{importError && <p className="form-error">{importError}</p>}<button className="gate-submit" disabled={!parsed.length || importBusy} onClick={importGuests}>{importBusy ? 'Saving…' : `${importMode === 'replace' ? 'Replace' : 'Update'} list with ${parsed.length || ''} guests`}</button></section></div>}
    {addOpen && <div className="modal-backdrop"><section className="modal-card small"><button className="modal-close" onClick={() => !addBusy && setAddOpen(false)} disabled={addBusy}><X /></button><p className="eyebrow">Make room for someone</p><h2>Add a guest</h2><label>Name and any +1s<input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGuest()} placeholder="e.g. Alex +2" autoFocus /></label><label>Guest group<select value={newType} onChange={(e) => { setNewType(e.target.value); setAddError(''); }}>{guestTypes.map((type) => <option key={type} value={type}>{type}</option>)}{session?.role === 'admin' && <option value="__new__">＋ Create a new group</option>}</select></label>{newType === '__new__' && <label>New group name<input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGuest()} placeholder="e.g. Artist list" /></label>}{addError && <p className="form-error">{addError}</p>}<button className="gate-submit" disabled={!newName.trim() || (newType === '__new__' && !newGroup.trim()) || addBusy} onClick={addGuest}>{addBusy ? 'Adding…' : `Add to ${newType === '__new__' ? newGroup.trim() || 'new group' : newType}`}</button></section></div>}
    {settingsOpen && <div className="modal-backdrop"><section className="modal-card settings-card"><button className="modal-close" onClick={() => setSettingsOpen(false)}><X /></button><p className="eyebrow">Event settings</p><h2>Make it your night</h2><div className="settings-section"><h3>Capacity</h3><div className="capacity-control"><input type="number" min="1" max="100000" value={capacity} onChange={(event) => setCapacity(event.target.value)} /><button onClick={() => adminAction({ action: 'capacity', capacity: Number(capacity) }, 'Capacity updated.')}>Save</button></div></div><div className="settings-section"><h3>Guest list</h3><button className="settings-action" onClick={updateFromFile}><Upload size={16} /><span><strong>Load list from file</strong><small>Choose Update list or Replace list before saving</small></span></button><div className="list-settings">{guestTypes.map((type) => <div key={type}><span><strong>{type}</strong><small>{guests.filter((guest) => guest.type === type).length} names</small></span><button aria-label={`Delete ${type}`} onClick={() => window.confirm(`Delete the complete “${type}” list?`) && adminAction({ action: 'delete-list', type }, `${type} deleted.`)}><Trash2 size={15} /></button></div>)}</div></div><div className="settings-section danger-zone"><h3>Reset</h3><button className="settings-action" onClick={() => window.confirm('Reset every check-in and all IN/OUT counters to zero?') && adminAction({ action: 'reset-event' }, 'Event counters and guest check-ins reset.')}><RotateCcw size={16} /><span><strong>Reset event</strong><small>Keep names, reset check-ins and counters</small></span></button><button className="settings-action danger" onClick={() => window.confirm('Delete every guest list? This cannot be undone.') && adminAction({ action: 'delete-all' }, 'All guest lists deleted.')}><Trash2 size={16} /><span><strong>Delete all lists</strong><small>Remove every guest and list</small></span></button></div>{settingsError && <p className="form-error">{settingsError}</p>}{settingsNotice && <p className="form-success">{settingsNotice}</p>}</section></div>}
  </main>;
}
