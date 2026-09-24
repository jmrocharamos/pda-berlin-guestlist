'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Ban, Check, ChevronRight, CircleHelp, ClipboardList, ImagePlus, MessageSquare, RotateCcw, Search, ShieldAlert, UserRound, Users, X } from 'lucide-react';
import { admissionCount, applyDoorAction, doorRoles, personState, sampleParties, undoDoorAction, type BanRecord, type DoorAction, type DoorEvent, type DoorRole, type Party } from '../../lib/door-preview';
import { prepareDoorPhoto } from '../../lib/door-photo';

const themeOptions = [['afterdark', 'After Dark'], ['basement', 'Pink Basement'], ['velvet', 'Violet Velvet'], ['daylight', 'Pink Daylight']];
const titles: Record<DoorAction, string> = { check: 'Checked in', refuse: 'Entry refused', reverse: 'Refusal reversed · admitted', note: 'Note added' };
const statusText = { waiting: 'Not checked in', inside: 'Counted inside', refused: 'Entry refused' };
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Sheet({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className={`dp-sheet ${wide ? 'dp-wide' : ''}`} aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="dp-sheet-head"><h2>{title}</h2><button className="dp-icon" aria-label="Close panel" onClick={onClose}><X size={22} /></button></div><div className="dp-sheet-body">{children}</div></dialog>;
}

export default function DoorPreview() {
  const [theme, setTheme] = useState('afterdark');
  const [parties, setParties] = useState<Party[]>(sampleParties);
  const [tab, setTab] = useState<'guests' | 'banned'>('guests');
  const [role, setRole] = useState<DoorRole>('Downstairs (Queue)');
  const [staff, setStaff] = useState('Alex');
  const [roleOpen, setRoleOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState(staff);
  const [roleDraft, setRoleDraft] = useState<DoorRole>(role);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [selected, setSelected] = useState<{ partyId: string; personId: string } | null>(null);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'refuse' | 'reverse' | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [manual, setManual] = useState({ in: 0, out: 0 });
  const [counterHistory, setCounterHistory] = useState<{ direction: 'in' | 'out'; staff: string; role: DoorRole; at: string }[]>([]);
  const [counterOpen, setCounterOpen] = useState(false);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [banForm, setBanForm] = useState<'new' | string | null>(null);
  const [banName, setBanName] = useState('');
  const [banNote, setBanNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { try { const saved = localStorage.getItem('pda-colour-theme'); if (themeOptions.some(([id]) => id === saved)) setTheme(saved!); } catch {} return () => { if (toastTimer.current) clearTimeout(toastTimer.current); }; }, []);
  const notify = (text: string) => { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); };
  const currentParty = parties.find((item) => item.id === selected?.partyId);
  const person = currentParty?.people.find((item) => item.id === selected?.personId);
  const state = person ? personState(person) : null;
  const admitted = admissionCount(parties);
  const inside = Math.max(0, admitted + manual.in - manual.out);
  const people = parties.flatMap((party) => party.people);
  const refused = people.filter((item) => personState(item).status === 'refused').length;
  const checks = people.reduce((count, item) => count + personState(item).checks.length, 0);
  const activeBan = bans.find((item) => item.id === banForm);
  const visibleParties = parties.filter((party) => (group === 'All' || party.group === group) && `${party.name} ${party.group} ${party.host}`.toLowerCase().includes(query.toLowerCase()));
  const visibleBans = bans.filter((entry) => `${entry.name} ${entry.notes.map((item) => item.text).join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  function openGuest(party: Party, personId = party.people[0].id) { setSelected({ partyId: party.id, personId }); setNote(''); setDecision(null); setUndoId(null); }
  function quickCheck(partyId: string, personId: string) {
    const event: DoorEvent = { id: crypto.randomUUID(), personId, action: 'check', role, staff, note: '', at: new Date().toISOString() };
    setParties((items) => items.map((party) => party.id === partyId
      ? { ...party, people: party.people.map((item) => item.id === personId ? applyDoorAction(item, event) : item) }
      : party));
    notify('Check saved');
  }
  function record(action: DoorAction) {
    if (!person || !currentParty || !state) return;
    const event: DoorEvent = { id: crypto.randomUUID(), personId: person.id, action, role, staff, note: note.trim(), at: new Date().toISOString() };
    if (action === 'note' && !event.note) return;
    const next = applyDoorAction(person, event);
    if (next === person) { notify('Already recorded. No extra person was counted.'); return; }
    const delta = Number(personState(next).status === 'inside') - Number(state.status === 'inside');
    setParties((items) => items.map((party) => party.id === currentParty.id ? { ...party, people: party.people.map((item) => item.id === person.id ? next : item) } : party));
    setNote(''); setDecision(null);
    notify(`${titles[action]}${delta > 0 ? ' · +1 inside' : delta < 0 ? ' · −1 inside' : ' · count unchanged'}`);
  }
  function undo() {
    if (!person || !currentParty || !undoId) return;
    const next = undoDoorAction(person, undoId, { staff, role, at: new Date().toISOString() });
    const delta = Number(personState(next).status === 'inside') - Number(personState(person).status === 'inside');
    setParties((items) => items.map((party) => party.id === currentParty.id ? { ...party, people: party.people.map((item) => item.id === person.id ? next : item) } : party));
    setUndoId(null); notify(`Action undone${delta > 0 ? ' · +1 inside' : delta < 0 ? ' · −1 inside' : ' · count unchanged'}`);
  }
  function count(direction: 'in' | 'out') {
    if (direction === 'out' && inside === 0) return;
    setManual((value) => ({ ...value, [direction]: value[direction] + 1 }));
    setCounterHistory((items) => [{ direction, role, staff, at: new Date().toISOString() }, ...items]);
    notify(direction === 'in' ? 'General arrival · +1 inside' : 'Departure · −1 inside');
  }
  function openBan(entry?: BanRecord) { uploadVersion.current += 1; setPhotoBusy(false); setBanForm(entry?.id ?? 'new'); setBanName(entry?.name ?? ''); setBanNote(''); setPhotos(entry?.photos ?? []); setPhotoError(''); }
  async function choosePhotos(files: FileList | null) {
    if (!files?.length) return;
    const version = ++uploadVersion.current;
    setPhotoBusy(true); setPhotoError('');
    const converted: string[] = []; const errors: string[] = [];
    for (const file of Array.from(files).slice(0, Math.max(0, 4 - photos.length))) {
      try { converted.push(await prepareDoorPhoto(file)); } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Could not open this photo.'}`); }
    }
    if (version !== uploadVersion.current) return;
    setPhotos((value) => [...value, ...converted].slice(0, 4));
    setPhotoError(errors.join(' ')); setPhotoBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  }
  function saveBan() {
    if (!banName.trim() || photoBusy) return;
    const at = new Date().toISOString();
    const newNote = banNote.trim() ? [{ text: banNote.trim(), staff, role, at }] : [];
    if (activeBan) setBans((items) => items.map((item) => item.id === activeBan.id ? { ...item, name: banName.trim(), photos, notes: [...item.notes, ...newNote] } : item));
    else setBans((items) => [{ id: crypto.randomUUID(), name: banName.trim(), photos, notes: newNote, role, staff, at }, ...items]);
    setBanForm(null); notify('Saved in this test tab · guest check-ins are unchanged');
  }

  return <div className="app-shell dp-app" data-theme={theme}>
    <div className="dp-preview-banner"><span><strong>TEST PREVIEW</strong> Sample guests · live event unchanged</span><a href="/">Back to staff app <ArrowUpRight size={14} /></a></div>
    <header className="dp-top"><a className="dp-brand" href="/preview-door"><img src="/pda-logo.jpg" alt="PDA" /><span>TOGETHER<br /><b>AT THE DOOR.</b></span></a><button className="dp-worker" onClick={() => { setStaffDraft(staff); setRoleDraft(role); setRoleOpen(true); }}><UserRound size={18} /><span><small>Working as {staff}</small><strong>{role}</strong></span><ChevronRight size={16} /></button></header>
    <div className="dp-layout"><aside className="dp-desktop-side"><p className="dp-kicker">TONIGHT AT PDA</p><h1>A little care.<br />A good night.</h1><nav aria-label="Sections"><button className={tab === 'guests' ? 'dp-selected' : ''} onClick={() => { setTab('guests'); setQuery(''); }}><Users size={19} />Guestlist<ChevronRight size={16} /></button><button className={tab === 'banned' ? 'dp-selected' : ''} onClick={() => { setTab('banned'); setQuery(''); }}><ShieldAlert size={19} />Banned ravers<ChevronRight size={16} /></button></nav><div className="dp-side-tip"><ClipboardList size={23} /><h3>One person. One count.</h3><p>The first check adds them inside. Every other role can leave a check without counting them twice.</p></div><label className="dp-theme-label">Your colours<select value={theme} onChange={(e) => setTheme(e.target.value)}>{themeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></aside>
    <main className="dp-main">
      <section className="dp-counters" aria-label="Test event counts"><div className="dp-inside"><span>Inside now</span><strong data-testid="inside-count">{inside}</strong><small>in this test</small></div><div className="dp-counter-buttons"><button className="dp-primary" onClick={() => count('in')}><ArrowUpRight size={20} /> IN +1</button><button onClick={() => count('out')} disabled={inside === 0}><ArrowDownLeft size={20} /> OUT −1</button><button className="dp-counter-history" onClick={() => setCounterOpen(true)}>Counter history</button></div><div className="dp-mini-stat"><b>{checks}</b><span>staff checks</span></div><div className="dp-mini-stat"><b>{refused}</b><span>refused</span></div></section>
      <div className="dp-mobile-tabs" aria-label="Sections"><button className={tab === 'guests' ? 'dp-selected' : ''} onClick={() => { setTab('guests'); setQuery(''); }}><Users size={18} />Guestlist</button><button className={tab === 'banned' ? 'dp-selected' : ''} onClick={() => { setTab('banned'); setQuery(''); }}><ShieldAlert size={18} />Banned ravers</button></div>
      <div className="dp-title-row"><div><p className="dp-kicker">{tab === 'guests' ? 'WELCOME THEM IN' : 'SEPARATE STAFF DIRECTORY'}</p><h2>{tab === 'guests' ? 'Find someone on the list.' : 'Banned ravers'}</h2></div>{tab === 'banned' && <button className="dp-primary" onClick={() => openBan()}><ImagePlus size={19} />Add a person</button>}</div>
      {tab === 'banned' && <p className="dp-section-copy">Names, photos and information for the whole team. This directory is separate from tonight’s refused entries. Every role can add or update a record.</p>}
      <label className="dp-search"><Search size={22} /><input placeholder={tab === 'guests' ? 'Search a name or guest group…' : 'Search a name or note…'} aria-label={tab === 'guests' ? 'Search guests' : 'Search banned directory'} value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button className="dp-icon" aria-label="Clear search" onClick={() => setQuery('')}><X size={18} /></button>}</label>
      {tab === 'guests' ? <><div className="dp-filters" aria-label="Guest groups">{['All', 'Guestlist', 'SOLI', 'SKIP', 'Friends'].map((item) => <button className={item === group ? 'dp-selected' : ''} key={item} onClick={() => setGroup(item)}>{item === 'All' ? 'All groups' : item}</button>)}</div><div className="dp-list-meta"><span>{visibleParties.length} guest groups</span><span>Every +1 has their own record</span></div><div className="dp-guest-list">{visibleParties.map((party) => { const count = party.people.filter((item) => personState(item).status === 'inside').length; const rejection = party.people.some((item) => personState(item).status === 'refused'); const latest = party.people.flatMap((item) => item.events).filter((event) => !event.undoneBy).sort((a, b) => a.at.localeCompare(b.at)).at(-1); return <article className={`dp-guest ${rejection ? 'dp-has-refusal' : ''}`} key={party.id}><div className="dp-guest-heading"><span className="dp-avatar">{party.name.split(' ').map((item) => item[0]).join('')}</span><div><h3>{party.name}{party.people.length > 1 && <span className="dp-plus">+{party.people.length - 1}</span>}</h3><p>{party.group} <span>· {party.host}</span></p></div><span className="dp-count-badge">{count}/{party.people.length} in</span></div><div className="dp-quick-people">{party.people.map((item, index) => {
        const personStatus = personState(item);
        const checkedByMe = personStatus.checks.some((event) => event.role === role && event.staff === staff);
        const isRefused = personStatus.status === 'refused';
        const label = index === 0 ? 'Main guest' : `+1 · Guest ${index}`;
        return <div className="dp-quick-person" key={item.id}>
          <div className="dp-quick-label"><strong>{label}</strong><span className={`dp-quick-status dp-${personStatus.status}`}>{isRefused ? 'Entry refused' : personStatus.status === 'inside' ? 'Checked in' : 'Not checked in'}</span></div>
          <button className={checkedByMe || isRefused ? 'dp-quick-saved' : 'dp-primary'} disabled={checkedByMe || isRefused} aria-label={`${isRefused ? 'Entry refused' : checkedByMe ? 'Checked' : 'Check in'} — ${party.name}, ${label}`} onClick={() => quickCheck(party.id, item.id)}>{isRefused ? <Ban size={17} /> : <Check size={17} />}{isRefused ? 'Refused' : checkedByMe ? 'Checked' : 'Check in'}</button>
        </div>;
      })}</div><p className="dp-latest">{latest ? `${latest.role} · ${latest.staff} · ${titles[latest.action].toLowerCase()}` : 'Ready for the first check'}</p><button className="dp-open-guest" onClick={() => openGuest(party)}>Notes & checks<ChevronRight size={18} /></button></article>; })}</div>{!visibleParties.length && <div className="dp-empty"><Search size={32} /><h3>No one found</h3><p>Try another spelling or guest group.</p></div>}</> : <><div className="dp-list-meta"><span>{visibleBans.length} {visibleBans.length === 1 ? 'record' : 'records'}</span><span>All roles can contribute</span></div><div className="dp-ban-grid">{visibleBans.map((entry) => <button className="dp-ban-card" key={entry.id} onClick={() => openBan(entry)}>{entry.photos[0] ? <img src={entry.photos[0]} alt={`Reference photo for ${entry.name}`} /> : <div className="dp-no-photo"><UserRound size={40} /><span>No photo yet</span></div>}<div><span className="dp-ban-label">BANNED DIRECTORY</span><h3>{entry.name}</h3><p>{entry.notes.at(-1)?.text || 'No additional note.'}</p><small>Added by {entry.staff} · {entry.role}</small><span className="dp-edit-link">View & add information <ChevronRight size={16} /></span></div></button>)}</div>{!visibleBans.length && <div className="dp-empty dp-ban-empty"><ShieldAlert size={36} /><h3>{query ? 'No matching record' : 'A separate place for the team’s records.'}</h3><p>{query ? 'Try a different name or note.' : 'Add a sample name, a photo and an optional note to try it. Refusing a guest never creates a record here.'}</p>{!query && <button className="dp-primary" onClick={() => openBan()}>Add a sample person</button>}</div>}</>}
      <details className="dp-test-guide"><summary><CircleHelp size={17} />How to test this preview</summary><ol><li>Tap Check in next to Alex Rivera’s main guest, directly on the list.</li><li>Switch your role to Picker, then check the same person: inside stays the same.</li><li>Open Notes & checks to add a note, refuse entry or reverse a refusal.</li><li>Try undo and individual +1s. Add a sample record in Banned ravers.</li></ol><p>Sample data only. Actions and photos stay in this tab and reset on refresh. This preview does not sync across devices. Use a sample photo, not a real banned-person record.</p></details>
      <label className="dp-mobile-theme">Colours<select aria-label="Preview colours" value={theme} onChange={(e) => setTheme(e.target.value)}>{themeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </main></div>

    {selected && person && state && currentParty && <Sheet title={currentParty.name} onClose={() => setSelected(null)} wide><div className="dp-sheet-result" role="status"><span>{toast || 'Only the first check counts this person inside.'}</span><strong>{inside} inside</strong></div><div className="dp-party-label">{currentParty.group} · {currentParty.people.length} {currentParty.people.length === 1 ? 'person' : 'people'}</div><div className="dp-person-tabs" aria-label="Select person">{currentParty.people.map((item, index) => <button aria-pressed={item.id === person.id} className={item.id === person.id ? 'dp-selected' : ''} key={item.id} onClick={() => { setSelected({ ...selected, personId: item.id }); setNote(''); setDecision(null); setUndoId(null); }}>{index === 0 ? 'Main guest' : `+1 · Guest ${index}`}<span className={`dp-state-dot dp-${personState(item).status}`} /></button>)}</div><div className="dp-person-status"><div><small>THIS PERSON</small><h3>{person.label}</h3></div><span className={`dp-status dp-${state.status}`}>{state.status === 'inside' ? <Check size={16} /> : state.status === 'refused' ? <Ban size={16} /> : <UserRound size={16} />}{statusText[state.status]}</span></div><div className="dp-staff-checks">{state.checks.length ? state.checks.map((event) => <span key={event.id}><Check size={14} /><b>{event.role}</b><small>{event.staff} · {time(event.at)}</small></span>) : <p>No staff checks yet. Any role can check this person in.</p>}</div>
      {state.status === 'refused' && <div className="dp-warning"><Ban size={20} /><div><strong>Entry refused</strong><p>A routine check cannot override this. Use “Reverse refusal and admit” to let this person in. This is not a banned-directory entry.</p></div></div>}
      <div className="dp-action-panel"><p className="dp-acting-as">You’re recording as <strong>{staff} · {role}</strong></p><label className="dp-field">Note for this action <span>optional</span><textarea rows={2} maxLength={2000} placeholder="Anything the next person at the door should know…" value={note} onChange={(e) => setNote(e.target.value)} /></label>{decision ? <div className="dp-confirm"><h4>{decision === 'refuse' ? 'Refuse entry for this person?' : 'Reverse refusal and admit?'}</h4><p>{decision === 'refuse' ? state.status === 'inside' ? 'Their inside count is removed once. Previous checks and notes stay in the history.' : 'No one is removed from the count: this person has not been admitted.' : 'This person will count inside once. The original refusal stays in their history.'}</p><div className="dp-action-buttons"><button className={decision === 'refuse' ? 'dp-danger' : 'dp-primary'} onClick={() => record(decision)}>{decision === 'refuse' ? 'Confirm refusal' : 'Reverse refusal and admit'}</button><button onClick={() => setDecision(null)}>Cancel</button></div></div> : <div className="dp-action-buttons">{state.status === 'refused' ? <button className="dp-primary" onClick={() => setDecision('reverse')}><RotateCcw size={18} />Reverse refusal</button> : <><button className="dp-primary" disabled={state.checks.some((event) => event.role === role && event.staff === staff)} onClick={() => record('check')}><Check size={18} />{state.checks.some((event) => event.role === role && event.staff === staff) ? 'Checked' : 'Check in'}</button><button className="dp-danger" onClick={() => setDecision('refuse')}><Ban size={17} />Refuse entry</button></>}</div>}<button className="dp-note-button" disabled={!note.trim()} onClick={() => record('note')}><MessageSquare size={17} />Save note only</button></div>
      <section className="dp-history"><div className="dp-history-title"><h3>Checks & notes</h3><span>{person.events.length} actions</span></div>{person.events.length === 0 && <p className="dp-muted">The first action will appear here with the staff name, role and time.</p>}{[...person.events].reverse().map((event) => <article key={event.id} className={`dp-history-event ${event.undoneBy ? 'dp-undone' : ''}`}><span className={`dp-history-icon ${event.action === 'refuse' ? 'dp-red' : ''}`}>{event.action === 'note' ? <MessageSquare size={17} /> : event.action === 'refuse' ? <Ban size={17} /> : event.action === 'reverse' ? <RotateCcw size={17} /> : <Check size={17} />}</span><div><strong>{titles[event.action]}{event.undoneBy && ' · undone'}</strong><p>{event.staff} · {event.role} · {time(event.at)}</p>{event.note && <blockquote>{event.note}</blockquote>}{event.undoneBy ? <small>Undone by {event.undoneBy.staff} · {event.undoneBy.role} · {time(event.undoneBy.at)}</small> : undoId === event.id ? <div className="dp-undo-confirm"><p>Undo this action? The count will be recalculated from the remaining checks and decisions.</p><button onClick={undo}>Confirm undo</button><button onClick={() => setUndoId(null)}>Keep action</button></div> : <button className="dp-undo" onClick={() => setUndoId(event.id)}><RotateCcw size={14} />Undo this action</button>}</div></article>)}</section>
    </Sheet>}

    {roleOpen && <Sheet title="Who’s at the door?" onClose={() => setRoleOpen(false)}><p className="dp-muted">Switch roles to test the same guest at different points. All roles can check, refuse, reverse, count IN/OUT and contribute to the banned directory.</p><label className="dp-field">Your name<input maxLength={60} value={staffDraft} onChange={(e) => setStaffDraft(e.target.value)} placeholder="e.g. Alex" /></label><div className="dp-role-options" aria-label="Staff role">{doorRoles.map((item) => <button key={item} aria-pressed={roleDraft === item} className={roleDraft === item ? 'dp-selected' : ''} onClick={() => setRoleDraft(item)}>{item}{roleDraft === item && <Check size={18} />}</button>)}</div><p className="dp-muted dp-small">This is a test role switcher, not a login. Staff names here are self-entered.</p><button className="dp-primary dp-full" disabled={!staffDraft.trim()} onClick={() => { setStaff(staffDraft.trim()); setRole(roleDraft); setRoleOpen(false); notify(`Now testing as ${staffDraft.trim()} · ${roleDraft}`); }}>Use this role</button></Sheet>}

    {banForm && <Sheet title={activeBan ? 'Person’s record' : 'Add to banned directory'} onClose={() => { uploadVersion.current += 1; setBanForm(null); }}><div className="dp-directory-notice"><ShieldAlert size={20} /><p>A separate staff record. Saving here does not refuse a guest or change the inside count.</p></div><label className="dp-field">Name<input value={banName} maxLength={150} onChange={(e) => setBanName(e.target.value)} placeholder="Use a sample name for this test" required /></label><label className="dp-field">Reference photos <span>up to 4 · optional</span></label><div className="dp-photo-grid">{photos.map((photo, index) => <div className="dp-photo" key={`${index}-${photo.slice(-30)}`}><img src={photo} alt={`Reference ${index + 1}`} /><button className="dp-icon" aria-label={`Remove photo ${index + 1}`} disabled={photoBusy} onClick={() => setPhotos((items) => items.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div><input ref={fileInput} className="dp-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif" multiple onChange={(e) => void choosePhotos(e.target.files)} /><button className="dp-upload" disabled={photoBusy || photos.length >= 4} onClick={() => fileInput.current?.click()}><ImagePlus size={24} /><strong>{photoBusy ? 'Preparing your photo…' : 'Choose photos from your phone'}</strong><span>JPEG, PNG, WebP, HEIC/HEIF & more · up to 40 MB each</span></button><p className="dp-muted dp-small">Photos are resized on your device. In this preview they stay in this tab only, and disappear when you refresh.</p>{photoError && <p className="dp-error" role="alert">{photoError}</p>}<label className="dp-field">{activeBan ? 'Add information' : 'Note'} <span>optional</span><textarea value={banNote} maxLength={2000} rows={3} placeholder="Information that helps the team identify the person and understand the record…" onChange={(e) => setBanNote(e.target.value)} /></label>{activeBan && <div className="dp-ban-notes"><p className="dp-muted">Added by {activeBan.staff} · {activeBan.role} · {time(activeBan.at)}</p>{activeBan.notes.map((item, index) => <article key={index}><p>{item.text}</p><small>{item.staff} · {item.role} · {time(item.at)}</small></article>)}</div>}<p className="dp-acting-as">Saving as <strong>{staff} · {role}</strong></p><button className="dp-primary dp-full" disabled={!banName.trim() || photoBusy} onClick={saveBan}>{activeBan ? 'Save updated record' : 'Add to test directory'}</button></Sheet>}

    {counterOpen && <Sheet title="Counter history" onClose={() => setCounterOpen(false)}><p className="dp-muted">Manual counts are separate from guest checks. Use IN for arrivals not already checked in, and OUT for departures.</p><div className="dp-counter-summary"><span>{manual.in} manual IN</span><span>{manual.out} OUT</span><span>{admitted} list admissions</span></div>{counterHistory.length ? counterHistory.map((event, index) => <article className="dp-counter-event" key={index}><strong>{event.direction === 'in' ? '+1 IN' : '−1 OUT'}</strong><p>{event.staff} · {event.role}</p><small>{time(event.at)}</small></article>) : <p className="dp-muted">No manual counts yet.</p>}</Sheet>}
    <div className="dp-toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
  </div>;
}
