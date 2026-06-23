import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api';
import {
  Users, Clock, Heart, MapPin, FileText, ChevronDown,
  Copy, Check, Trash2, Plus, RotateCcw,
} from 'lucide-react';

const ROLES = ['Adult', 'Teen', 'Child', 'Pet'];
const DEFAULT_SHARING = { members: true, routines: true, preferences: true, logistics: true };
const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500',
];
const SHARING_CATEGORIES = [
  { key: 'members', label: 'People & pets', helper: 'Names, ages, relationships, and notes' },
  { key: 'routines', label: 'Routines', helper: 'Schedules, recurring activities, and responsibilities' },
  { key: 'preferences', label: 'Preferences', helper: 'Dietary, lifestyle, and household preferences' },
  { key: 'logistics', label: 'Logistics', helper: 'Contacts, addresses, and important details' },
];

function newMember() { return { id: crypto.randomUUID(), name: '', role: 'Adult', age: '', notes: '' }; }
function newRoutine() { return { id: crypto.randomUUID(), label: '', details: '', who: '' }; }
function newPreference() { return { id: crypto.randomUUID(), label: '', value: '' }; }
function newLogistic() { return { id: crypto.randomUUID(), label: '', value: '' }; }

function getInitial(name) { return (name || '?')[0].toUpperCase(); }

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return mobile;
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cw-primary/30 ${
        checked ? 'bg-cw-primary' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
  );
}

function Card({ children, className = '', dimmed = false }) {
  return (
    <div className={`relative bg-white rounded-cw shadow-card transition-opacity duration-200 ${dimmed ? 'opacity-40' : ''} ${className}`}>
      {children}
      {dimmed && (
        <div className="absolute top-3 right-4">
          <span className="text-[11px] italic text-cw-muted">Hidden from sharing</span>
        </div>
      )}
    </div>
  );
}

function AddButton({ onClick, label, mobile = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-2 border-dashed border-gray-200 rounded-cw flex items-center justify-center gap-2 text-cw-muted hover:border-cw-primary hover:text-cw-primary transition-colors ${
        mobile ? 'py-3 text-[14px]' : 'py-2.5 text-[13px]'
      }`}
    >
      <Plus size={16} />
      <span className="font-medium">{label}</span>
    </button>
  );
}

export default function ContextWallet() {
  const isMobile = useIsMobile();

  const [context, setContext] = useState({ members: [], routines: [], preferences: [], logistics: [], notes: '' });
  const [sharing, setSharing] = useState(DEFAULT_SHARING);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const [shareInfo, setShareInfo] = useState(null);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState(new Set(['members']));
  const initialRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/household/context').then((d) => {
      const ctx = d.context || {};
      const loaded = {
        members: ctx.members || [],
        routines: ctx.routines || [],
        preferences: ctx.preferences || [],
        logistics: ctx.logistics || [],
        notes: ctx.notes || '',
      };
      setContext(loaded);
      const loadedSharing = d.context_sharing || DEFAULT_SHARING;
      setSharing(loadedSharing);
      initialRef.current = JSON.stringify({ context: loaded, sharing: loadedSharing });
    }).catch(() => {});
    apiFetch('/api/household/share-info').then(setShareInfo).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialRef.current === null) return;
    setDirty(JSON.stringify({ context, sharing }) !== initialRef.current);
  }, [context, sharing]);

  // CRUD helpers
  function addMember() { setContext((p) => ({ ...p, members: [...p.members, newMember()] })); }
  function updateMember(id, field, val) {
    setContext((p) => ({ ...p, members: p.members.map((m) => m.id === id ? { ...m, [field]: val } : m) }));
  }
  function removeMember(id) { setContext((p) => ({ ...p, members: p.members.filter((m) => m.id !== id) })); }

  function addRoutine() { setContext((p) => ({ ...p, routines: [...p.routines, newRoutine()] })); }
  function updateRoutine(id, field, val) {
    setContext((p) => ({ ...p, routines: p.routines.map((r) => r.id === id ? { ...r, [field]: val } : r) }));
  }
  function removeRoutine(id) { setContext((p) => ({ ...p, routines: p.routines.filter((r) => r.id !== id) })); }

  function addPreference() { setContext((p) => ({ ...p, preferences: [...p.preferences, newPreference()] })); }
  function updatePreference(id, field, val) {
    setContext((p) => ({ ...p, preferences: p.preferences.map((r) => r.id === id ? { ...r, [field]: val } : r) }));
  }
  function removePreference(id) { setContext((p) => ({ ...p, preferences: p.preferences.filter((r) => r.id !== id) })); }

  function addLogistic() { setContext((p) => ({ ...p, logistics: [...p.logistics, newLogistic()] })); }
  function updateLogistic(id, field, val) {
    setContext((p) => ({ ...p, logistics: p.logistics.map((r) => r.id === id ? { ...r, [field]: val } : r) }));
  }
  function removeLogistic(id) { setContext((p) => ({ ...p, logistics: p.logistics.filter((r) => r.id !== id) })); }

  function toggleSharing(key) { setSharing((p) => ({ ...p, [key]: !p[key] })); }

  async function saveContext() {
    setSaving(true);
    try {
      await apiFetch('/api/household/context', {
        method: 'PATCH',
        body: JSON.stringify({ context, context_sharing: sharing }),
      });
      initialRef.current = JSON.stringify({ context, sharing });
      setDirty(false);
    } catch {}
    setSaving(false);
  }

  async function copyContextCard() {
    try {
      const { card } = await apiFetch('/api/household/context/card');
      if (card) {
        await navigator.clipboard.writeText(card);
        setCardCopied(true);
        setTimeout(() => setCardCopied(false), 2000);
      }
    } catch {}
  }

  function copyShareUrl() {
    if (!shareInfo?.share_url) return;
    navigator.clipboard.writeText(shareInfo.share_url).then(() => {
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    });
  }

  async function regenerateShareToken() {
    try {
      const data = await apiFetch('/api/household/share-token/regenerate', { method: 'POST' });
      setShareInfo(data);
    } catch {}
  }

  function toggleSection(key) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const inputBase = isMobile
    ? 'w-full text-base border border-gray-200 rounded-cw px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-cw-primary/30 focus:bg-white text-cw-fg'
    : 'w-full text-[13px] border border-gray-200 rounded-[10px] px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cw-primary/30 focus:bg-white text-cw-fg';

  const selectBase = isMobile
    ? 'w-full text-base border border-gray-200 rounded-cw px-3 py-2.5 bg-white focus:outline-none text-cw-fg'
    : 'text-[13px] border border-gray-200 rounded-[10px] px-2 py-2 bg-gray-50 focus:outline-none focus:bg-white text-cw-fg';

  // ── Shared section renderers ──────────────────────────────────
  function renderMembers() {
    return (
      <div className="space-y-3">
        {context.members.map((m, i) => (
          <div key={m.id} className={`flex items-start gap-3 ${isMobile ? '' : 'group'}`}>
            <div className={`${AVATAR_COLORS[i % AVATAR_COLORS.length]} w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-bold shrink-0 mt-0.5`}>
              {getInitial(m.name)}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <input value={m.name} onChange={(e) => updateMember(m.id, 'name', e.target.value)} placeholder="Name" className={inputBase} />
              <div className={isMobile ? 'space-y-1.5' : 'flex gap-1.5'}>
                <select value={m.role} onChange={(e) => updateMember(m.id, 'role', e.target.value)} className={selectBase}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <input value={m.age} onChange={(e) => updateMember(m.id, 'age', e.target.value)} placeholder="Age" className={`${isMobile ? inputBase : 'w-16 ' + inputBase.replace('w-full ', '')}`} />
                <input value={m.notes} onChange={(e) => updateMember(m.id, 'notes', e.target.value)} placeholder="Notes (allergies, favorites…)" className={`${isMobile ? inputBase : 'flex-1 ' + inputBase.replace('w-full ', '')}`} />
              </div>
            </div>
            <button
              onClick={() => removeMember(m.id)}
              aria-label={`Remove ${m.name || 'member'}`}
              className={`text-gray-300 hover:text-cw-destructive transition-colors p-1 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <AddButton onClick={addMember} label="Add person or pet" mobile={isMobile} />
      </div>
    );
  }

  function renderListSection(items, addFn, updateFn, removeFn, fields, addLabel) {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={`${isMobile ? 'space-y-1.5' : 'flex gap-2 items-center group'}`}>
            {fields.map(({ key, placeholder, flex }) => (
              <input
                key={key}
                value={item[key]}
                onChange={(e) => updateFn(item.id, key, e.target.value)}
                placeholder={placeholder}
                className={`${isMobile ? inputBase : (flex ? 'flex-1 ' : 'w-36 ') + inputBase.replace('w-full ', '')}`}
              />
            ))}
            <button
              onClick={() => removeFn(item.id)}
              aria-label="Remove"
              className={`text-gray-300 hover:text-cw-destructive transition-colors p-1 shrink-0 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <AddButton onClick={addFn} label={addLabel} mobile={isMobile} />
      </div>
    );
  }

  function renderNotes() {
    return (
      <textarea
        value={context.notes}
        onChange={(e) => setContext((p) => ({ ...p, notes: e.target.value }))}
        onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
        placeholder="Other context (e.g. we're vegetarian, grandparents live nearby…)"
        rows={3}
        className={`${inputBase} resize-none`}
      />
    );
  }

  // ── Section configs ────────────────────────────────────────────
  const sections = [
    { key: 'members', sharingKey: 'members', icon: Users, title: 'People & pets', desc: 'Family members, children, and pets', count: context.members.length, render: renderMembers },
    {
      key: 'routines', sharingKey: 'routines', icon: Clock, title: 'Routines & schedules', desc: 'Recurring activities and responsibilities', count: context.routines.length,
      render: () => renderListSection(context.routines, addRoutine, updateRoutine, removeRoutine, [
        { key: 'label', placeholder: 'Label (e.g. School pickup)', flex: false },
        { key: 'details', placeholder: 'Details (Mon-Fri 3:15pm…)', flex: true },
        { key: 'who', placeholder: 'Who', flex: false },
      ], 'Add routine'),
    },
    {
      key: 'preferences', sharingKey: 'preferences', icon: Heart, title: 'Preferences', desc: 'Dietary, lifestyle, and household preferences', count: context.preferences.length,
      render: () => renderListSection(context.preferences, addPreference, updatePreference, removePreference, [
        { key: 'label', placeholder: 'Category (e.g. Dietary)', flex: false },
        { key: 'value', placeholder: 'Value (e.g. Vegetarian, nut-free)', flex: true },
      ], 'Add preference'),
    },
    {
      key: 'logistics', sharingKey: 'logistics', icon: MapPin, title: 'Logistics & contacts', desc: 'Important contacts, addresses, and details', count: context.logistics.length,
      render: () => renderListSection(context.logistics, addLogistic, updateLogistic, removeLogistic, [
        { key: 'label', placeholder: 'Label (e.g. Pediatrician)', flex: false },
        { key: 'value', placeholder: 'Name, phone, hours…', flex: true },
      ], 'Add entry'),
    },
    { key: 'notes', sharingKey: null, icon: FileText, title: 'Notes', desc: 'Anything else AI assistants should know', count: context.notes ? 1 : 0, render: renderNotes },
  ];

  function renderSaveButton() {
    return (
      <div className="flex justify-end mt-4">
        <button
          onClick={saveContext}
          disabled={!dirty || saving}
          className={`bg-cw-primary text-white font-semibold px-5 rounded-[10px] disabled:opacity-40 transition-all ${
            isMobile ? 'text-[14px] py-2.5 rounded-cw active:scale-[0.98]' : 'text-[13px] py-2 hover:opacity-90'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  }

  // ── MOBILE LAYOUT ─────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="bg-cw-bg min-h-screen pb-6">
        {/* App-style header */}
        <header className="sticky top-0 z-20 bg-cw-sidebar px-4 py-3 flex items-center justify-between">
          <h1 className="text-[17px] font-bold text-white">Context</h1>
          <button
            onClick={copyContextCard}
            className="flex items-center gap-1.5 text-white/90 hover:text-white text-[13px] font-semibold active:scale-[0.98] transition-all"
          >
            {cardCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>{cardCopied ? 'Copied!' : 'Copy context'}</span>
          </button>
        </header>

        <div className="px-4 pt-4 space-y-3">
          {/* Sharing controls */}
          <Card>
            <div className="p-4 space-y-3">
              <h3 className="text-[14px] font-semibold text-cw-fg">Sharing controls</h3>
              {SHARING_CATEGORIES.map(({ key, label, helper }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-cw-fg">{label}</div>
                    <div className="text-[12px] text-cw-muted">{helper}</div>
                  </div>
                  <Switch checked={sharing[key]} onChange={() => toggleSharing(key)} />
                </div>
              ))}
            </div>
          </Card>

          {/* Accordion sections */}
          {sections.map(({ key, sharingKey, icon: Icon, title, count, render }) => {
            const dimmed = sharingKey && !sharing[sharingKey];
            const expanded = expandedSections.has(key);
            return (
              <Card key={key} dimmed={dimmed}>
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cw-secondary flex items-center justify-center">
                      <Icon size={16} className="text-cw-primary" />
                    </div>
                    <span className="text-[15px] font-semibold text-cw-fg">{title}</span>
                    {count > 0 && (
                      <span className="text-[11px] font-medium text-cw-muted bg-cw-secondary px-2 py-0.5 rounded-full">{count}</span>
                    )}
                  </div>
                  <ChevronDown size={18} className={`text-cw-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && <div className="px-4 pb-4">{render()}</div>}
              </Card>
            );
          })}

          {/* Shareable link */}
          <Card>
            <div className="p-4 space-y-3">
              <h3 className="text-[14px] font-semibold text-cw-fg">Shareable context link</h3>
              <div className="font-mono text-[13px] bg-cw-secondary/50 border border-gray-200 rounded-cw px-3 py-2.5 truncate text-cw-muted">
                {shareInfo?.share_url || 'Loading…'}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyShareUrl}
                  disabled={!shareInfo}
                  className="text-[13px] font-semibold text-cw-primary active:scale-[0.98] transition-all disabled:opacity-40"
                >
                  {shareUrlCopied ? 'Copied!' : 'Copy link'}
                </button>
                <button
                  onClick={regenerateShareToken}
                  className="text-[13px] font-medium text-cw-destructive active:scale-[0.98] transition-all"
                >
                  Regenerate
                </button>
              </div>
              <p className="text-[12px] text-cw-muted leading-relaxed">
                Regenerating invalidates all previously shared URLs.
              </p>
            </div>
          </Card>

          {renderSaveButton()}
        </div>
      </div>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────
  return (
    <div className="bg-cw-bg min-h-full pb-6">
      <div className="max-w-3xl mx-auto px-6 pt-8 space-y-6">
        {/* Page header */}
        <header>
          <span className="text-[11px] font-bold uppercase tracking-wider text-cw-muted">Context</span>
          <h1 className="text-[28px] font-bold text-cw-fg mt-1 text-balance">Your household context</h1>
          <p className="text-[15px] text-cw-muted mt-2 leading-relaxed text-pretty max-w-xl">
            Add family members, routines, preferences, and logistics. AI assistants connected to Calvin use this to personalise responses.
          </p>
        </header>

        {/* Copy context card */}
        <div>
          <button
            onClick={copyContextCard}
            className="inline-flex items-center gap-2 bg-cw-primary text-white font-semibold text-[13px] px-5 py-2.5 rounded-[10px] hover:opacity-90 transition-opacity"
          >
            {cardCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>{cardCopied ? 'Copied!' : 'Copy context card'}</span>
          </button>
        </div>

        {/* Sharing controls */}
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-[15px] font-semibold text-cw-fg">Sharing controls</h3>
            <p className="text-[13px] text-cw-muted">Controls what's included when you share your context card or AI tools access your context.</p>
            <div className="space-y-2 pt-1">
              {SHARING_CATEGORIES.map(({ key, label, helper }) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-cw-fg">{label}</div>
                    <div className="text-[12px] text-cw-muted">{helper}</div>
                  </div>
                  <Switch checked={sharing[key]} onChange={() => toggleSharing(key)} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Data sections */}
        {sections.map(({ key, sharingKey, icon: Icon, title, desc, count, render }) => {
          const dimmed = sharingKey && !sharing[sharingKey];
          return (
            <Card key={key} dimmed={dimmed}>
              <div className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-cw-secondary flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-cw-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-cw-fg">{title}</h3>
                      {count > 0 && (
                        <span className="text-[11px] font-medium text-cw-muted bg-cw-secondary px-2 py-0.5 rounded-full">{count}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-cw-muted mt-0.5">{desc}</p>
                  </div>
                </div>
                {render()}
              </div>
            </Card>
          );
        })}

        {/* Shareable link */}
        <Card>
          <div className="p-5 space-y-3">
            <h3 className="text-[15px] font-semibold text-cw-fg">Shareable context link</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-[13px] bg-cw-secondary/50 border border-gray-200 rounded-[10px] px-3 py-2.5 truncate text-cw-muted">
                {shareInfo?.share_url || 'Loading…'}
              </div>
              <button
                onClick={copyShareUrl}
                disabled={!shareInfo}
                className="text-[13px] font-semibold text-cw-primary hover:opacity-75 transition-opacity shrink-0 disabled:opacity-40"
              >
                {shareUrlCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={regenerateShareToken}
                className="flex items-center gap-1.5 text-[13px] font-medium text-cw-destructive hover:opacity-75 transition-opacity"
              >
                <RotateCcw size={14} />
                <span>Regenerate link</span>
              </button>
            </div>
            <p className="text-[12px] text-cw-muted leading-relaxed">
              Regenerating invalidates all previously shared URLs.
            </p>
          </div>
        </Card>

        {renderSaveButton()}
      </div>
    </div>
  );
}
