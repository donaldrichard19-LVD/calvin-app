'use strict';

const DEFAULT_SHARING = { members: true, routines: true, preferences: true, logistics: true, orders: true };

function generateContextCard(context, partners, sharingControls, orders, options = {}) {
  const sharing = { ...DEFAULT_SHARING, ...sharingControls };
  const ctx = context || {};
  const lines = ['[Family Context — powered by Calvin]'];

  if (partners?.length) {
    lines.push(`Partners: ${partners.map((p) => p.display_name || p.name || 'Unknown').join(', ')}`);
  }

  if (sharing.members && ctx.members?.length) {
    const memberLines = ctx.members.map((m) => {
      const parts = [m.name];
      if (m.role) parts[0] += ` (${m.role}${m.age ? `, age ${m.age}` : ''})`;
      if (m.notes) parts.push(m.notes);
      return parts.join(' — ');
    });
    lines.push(`Family members: ${memberLines.join('; ')}`);
  }

  if (sharing.routines && ctx.routines?.length) {
    const items = ctx.routines.map((r) => {
      let s = r.label || '';
      if (r.details) s += `: ${r.details}`;
      if (r.who) s += ` (${r.who})`;
      return s;
    });
    lines.push(`Routines: ${items.join('; ')}`);
  }

  if (sharing.preferences && ctx.preferences?.length) {
    const items = ctx.preferences.map((p) => {
      if (p.label && p.value) return `${p.label}: ${p.value}`;
      return p.label || p.value || '';
    }).filter(Boolean);
    lines.push(`Preferences: ${items.join('; ')}`);
  }

  if (sharing.logistics && ctx.logistics?.length) {
    const items = ctx.logistics.map((l) => {
      if (l.label && l.value) return `${l.label}: ${l.value}`;
      return l.label || l.value || '';
    }).filter(Boolean);
    lines.push(`Logistics: ${items.join('; ')}`);
  }

  if (ctx.notes) {
    lines.push(`Notes: ${ctx.notes}`);
  }

  if (sharing.orders && orders?.length) {
    const recent = orders.slice(0, 5);
    const items = recent.map((o) => {
      let s = o.description || o.source;
      if (o.status) s += ` [${o.status}]`;
      if (o.eta && o.status !== 'completed' && o.status !== 'delivered') s += ` ETA ${new Date(o.eta).toLocaleString()}`;
      if (o.placed_by) s += ` (${o.placed_by})`;
      return s;
    });
    lines.push(`Recent orders: ${items.join('; ')}`);
  }

  if (lines.length <= 1) return null;
  return lines.join('\n');
}

module.exports = { generateContextCard, DEFAULT_SHARING };
