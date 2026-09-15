'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, FileSpreadsheet, LogOut, Plus, Search, Upload, Users, X } from 'lucide-react';
import { allocationFor, guestFromLine, parseDelimited, parseTabularRows, typeClass, type ImportedGuest } from '../lib/guest-import';

type Guest = { id: number; name: string; host: string; type: string; allocation: number; checked: number; note?: string };
type NewGuest = ImportedGuest;
type Session = { role: string; permissions: string[] };
type EventState = { inside: number; out_count: number; capacity: number; title: string; venue: string };
type StateResponse = { guests: Guest[]; event: EventState; session: Session };
type SetupResponse = { needsSetup?: boolean };
type SessionResponse = { session?: Session | null };
type ErrorResponse = { error?: string };
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

export default function Home() {
  const [guests, setGuests] = useState<Guest[]>(demoGuests);
  const [event, setEvent] = useState<EventState>({ inside: 0, out_count: 0, capacity: 550, title: 'Public Display of Affection', venue: 'Berlin' });
  const [session, setSession] = useState<Session | null>(null);
  const [gate, setGate] = useState<'loading' | 'setup' | 'login' | 'open'>('loading');
  const [query, setQuery] = useState(''); const [activeType, setActiveType] = useState('All');
  const [role, setRole] = useState('bouncer'); const [pin, setPin] = useState(''); const [sharedPin, setSharedPin] = useState(''); const [gateError, setGateError] = useState('');
  const [importOpen, setImportOpen] = useState(false); const [parsed, setParsed] = useState<NewGuest[]>([]); const [fileName, setFileName] = useState(''); const [replace, setReplace] = useState(false); const [importError, setImportError] = useState('');
  const [addOpen, setAddOpen] = useState(false); const [newName, setNewName] = useState(''); const fileRef = useRef<HTMLInputElement>(null);

  const loadState = useCallback(async () => { const response = await fetch('/api/state', { cache: 'no-store' }); if (!response.ok) return false; const data = await response.json() as StateResponse; setGuests(data.guests); setEvent(data.event); setSession(data.session); setGate('open'); return true; }, []);
  useEffect(() => { (async () => { try { const setup = await (await fetch('/api/setup')).json() as SetupResponse; if (setup.needsSetup) { setGate('setup'); return; } const sessionData = await (await fetch('/api/session')).json() as SessionResponse; if (sessionData.session) await loadState(); else setGate('login'); } catch { setGate('login'); } })(); }, [loadState]);
  useEffect(() => { if (gate !== 'open') return; const timer = window.setInterval(loadState, 5000); return () => window.clearInterval(timer); }, [gate, loadState]);

  const guestTypes = useMemo(() => Array.from(new Set(guests.map((guest) => guest.type.trim()).filter(Boolean))), [guests]);
  const filters = useMemo(() => ['All', ...guestTypes], [guestTypes]);
  const parsedTypes = useMemo(() => Array.from(new Set(parsed.map((guest) => guest.type.trim()).filter(Boolean))), [parsed]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return guests.filter((guest) => (activeType === 'All' || guest.type === activeType) && (!needle || `${guest.name} ${guest.host} ${guest.type} ${guest.note ?? ''}`.toLowerCase().includes(needle))); }, [activeType, guests, query]);
  const checked = guests.reduce((total, guest) => total + guest.checked, 0); const slots = guests.reduce((total, guest) => total + guest.allocation, 0);

  const submitGate = async () => { setGateError(''); const endpoint = gate === 'setup' ? '/api/setup' : '/api/session'; const body = gate === 'setup' ? { adminPin: pin, sharedPin } : { role, pin }; const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json() as ErrorResponse; if (!response.ok) { setGateError(data.error ?? 'Could not sign in'); return; } setPin(''); await loadState(); };
  const mutate = async (body: object) => { const response = await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (response.ok) await loadState(); };
  const checkIn = (guest: Guest, amount = 1) => { setGuests((current) => current.map((item) => item.id === guest.id ? { ...item, checked: Math.min(item.allocation, item.checked + amount) } : item)); void mutate({ action: 'check', id: guest.id, amount }); };
  const count = (direction: 'in' | 'out') => { setEvent((current) => ({ ...current, inside: Math.max(0, current.inside + (direction === 'in' ? 1 : -1)), out_count: current.out_count + (direction === 'out' ? 1 : 0) })); void mutate({ action: 'counter', direction }); };
  const chooseFile = async (file?: File) => { if (!file) return; setImportError(''); setFileName(file.name); try { const result = await parseUpload(file); setParsed(result); if (!result.length) setImportError('No guest names were found. Check the headings or file format.'); } catch { setImportError('This file could not be read. Try XLSX, CSV, DOCX, PDF, TXT or TSV.'); } };
  const importGuests = async () => { const response = await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import', guests: parsed, replace }) }); const data = await response.json() as ErrorResponse; if (!response.ok) { setImportError(data.error ?? 'Import failed'); return; } setImportOpen(false); setParsed([]); setFileName(''); setActiveType('All'); await loadState(); };
  const addGuest = async () => { if (!newName.trim()) return; await mutate({ action: 'import', guests: [{ name: newName.trim(), type: 'Guestlist', host: 'Door', allocation: allocationFor(newName) }] }); setNewName(''); setAddOpen(false); };
  const signOut = async () => { await fetch('/api/session', { method: 'DELETE' }); setSession(null); setGate('login'); };

  return <main className="app-shell">
    <header className="topbar"><div className="brand-lockup" aria-label="PDA Door"><img src="/pda-logo.jpg" alt="PDA" className="brand-mark" /><div><strong>DOOR</strong><span>BERLIN · LIVE</span></div></div><div className="event-title"><span>PUBLIC DISPLAY OF AFFECTION</span><strong>{event.venue.toUpperCase()}</strong></div><button className="profile-button" onClick={signOut}><span className="live-dot" />{session?.role?.replace('-', ' ').toUpperCase() ?? 'LOCKED'}<LogOut size={13} /></button></header>
    <section className="control-strip"><div className="counter-card counter-main"><div><span>INSIDE NOW</span><strong>{event.inside}</strong></div><div className="counter-actions"><button onClick={() => count('in')} disabled={!session?.permissions.includes('counter')}><ArrowUp size={22} />IN</button><button onClick={() => count('out')} disabled={!session?.permissions.includes('counter')}><ArrowDown size={22} />OUT</button></div></div><div className="metric"><span>OUT</span><strong>{event.out_count}</strong><small>tonight</small></div><div className="metric"><span>CHECKED</span><strong>{checked}</strong><small>of {slots} slots</small></div><div className="metric accent"><span>CAPACITY</span><strong>{Math.round((event.inside / event.capacity) * 100)}%</strong><small>{Math.max(0, event.capacity - event.inside)} remaining</small></div></section>
    <section className="workspace"><aside className="sidebar"><nav><button className="nav-item active"><Users size={17} />Door list<b>{guests.length}</b></button>{session?.permissions.includes('import') && <button className="nav-item" onClick={() => setImportOpen(true)}><Upload size={17} />Import file</button>}</nav><div className="shift-note"><span>SHIFT NOTE</span><p>Solid list goes directly to wristband. Check every +1 separately.</p><small>Shared live across door devices</small></div><div className="sync-state"><span className="live-dot" />All devices sync every 5 sec</div></aside>
      <div className="guest-panel"><div className="panel-heading"><div><p>TONIGHT&apos;S DOOR</p><h1>Find a guest</h1></div><div className="heading-actions">{session?.permissions.includes('import') && <button className="import-button" onClick={() => setAddOpen(true)}><Plus size={17} />Add guest</button>}{session?.permissions.includes('import') && <button className="import-button primary" onClick={() => setImportOpen(true)}><Upload size={17} />Import list</button>}</div></div>
        <label className="search-box"><Search size={22} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, host, list or note…" autoFocus /><kbd>⌘ K</kbd></label>
        <div className="filter-row">{filters.map((type) => <button key={type} onClick={() => setActiveType(type)} className={activeType === type ? 'selected' : ''}>{type}<span>{type === 'All' ? guests.length : guests.filter((g) => g.type === type).length}</span></button>)}</div><div className="results-meta"><span>{filtered.length} RESULTS</span><span>Tap a slot to check in</span></div>
        <div className="guest-list">{filtered.length ? filtered.map((guest) => { const remaining = guest.allocation - guest.checked; return <article className={`guest-row ${typeClass(guest.type)}`} key={guest.id}><div className="type-rail" /><div className="guest-identity"><h2>{guest.name}</h2><p><span>{guest.type}</span> · {guest.host}{guest.note ? ` · ${guest.note}` : ''}</p></div><div className="slot-progress"><span>{guest.checked}/{guest.allocation} IN</span><div>{Array.from({ length: guest.allocation }).slice(0, 12).map((_, index) => <i key={index} className={index < guest.checked ? 'filled' : ''} />)}</div></div><div className="row-actions">{remaining > 0 ? <><button onClick={() => checkIn(guest)} className="check-one"><Check size={18} />Check 1</button>{remaining > 1 && <button onClick={() => checkIn(guest, remaining)} className="check-all">All {remaining}</button>}</> : <span className="complete"><Check size={17} />COMPLETE</span>}</div></article> }) : <div className="empty-state"><Search size={28} /><h2>{guests.length ? 'No match found' : 'The door list is empty'}</h2><p>{guests.length ? 'Try another spelling or list filter.' : 'Import a file or add the first guest.'}</p></div>}</div>
      </div></section>

    {gate !== 'open' && <div className="modal-backdrop"><section className="gate-card"><img src="/pda-logo.jpg" alt="PDA" /><p className="eyebrow">PRIVATE DOOR CONTROL</p><h2>{gate === 'setup' ? 'Set up the team' : gate === 'loading' ? 'Opening tonight’s list…' : 'Choose your door role'}</h2>{gate !== 'loading' && <>{gate === 'login' && <div className="role-grid">{['admin','bouncer','manager','club-manager'].map((item) => <button key={item} onClick={() => setRole(item)} className={role === item ? 'selected' : ''}>{item.replace('-', ' ')}</button>)}</div>}<label>{gate === 'setup' ? 'ADMIN PIN' : 'SHARED PIN'}<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitGate()} placeholder="4+ characters" /></label>{gate === 'setup' && <label>TEAM PIN <small>Used by bouncer, manager and club manager</small><input type="password" value={sharedPin} onChange={(e) => setSharedPin(e.target.value)} placeholder="4+ characters" /></label>}{gateError && <p className="form-error">{gateError}</p>}<button className="gate-submit" onClick={submitGate}>{gate === 'setup' ? 'Create private team access' : 'Enter door'}</button><small className="privacy-note">Multiple staff can use the same role and PIN at once. Vercel deployment protection provides an additional private access layer.</small></>}</section></div>}

    {importOpen && <div className="modal-backdrop"><section className="modal-card"><button className="modal-close" onClick={() => setImportOpen(false)}><X /></button><p className="eyebrow">IMPORT GUESTS</p><h2>Drop the list. We&apos;ll sort it.</h2><p className="modal-copy">Each populated column heading becomes its list name exactly as written. “Name +4” creates five check-in slots.</p><input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.tsv,.txt,.docx,.pdf" onChange={(e) => chooseFile(e.target.files?.[0])} /><button className="drop-zone" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={30} /><strong>{fileName || 'Choose an Excel, document or text file'}</strong><span>XLSX · CSV · TSV · DOCX · PDF · TXT</span></button>{parsed.length > 0 && <div className="import-summary"><strong>{parsed.length} names found</strong><div>{parsedTypes.map((type) => <span key={type}>{type}: {parsed.filter((g) => g.type === type).length}</span>)}</div><label className="replace-option"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace the current list</label></div>}{importError && <p className="form-error">{importError}</p>}<button className="gate-submit" disabled={!parsed.length} onClick={importGuests}>Import {parsed.length || ''} guests</button></section></div>}
    {addOpen && <div className="modal-backdrop"><section className="modal-card small"><button className="modal-close" onClick={() => setAddOpen(false)}><X /></button><p className="eyebrow">QUICK ADD</p><h2>Add one guest</h2><label>NAME AND PLUS COUNT<input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGuest()} placeholder="e.g. Alex +2" autoFocus /></label><button className="gate-submit" onClick={addGuest}>Add to guestlist</button></section></div>}
  </main>;
}
