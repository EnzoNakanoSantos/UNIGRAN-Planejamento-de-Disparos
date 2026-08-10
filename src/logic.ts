import type { BaseRule, Dispatch, Validation } from './types';

export function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(value: string) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function normalize(value: string) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function dateDiff(a: string, b: string) {
  return Math.round(
    (new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000
  );
}

export function addDaysISO(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isBaseStale(dispatch: Dispatch, base?: BaseRule) {
  if (!base?.lastUpdated || !dispatch.date) return true;
  return dateDiff(dispatch.date, base.lastUpdated) > 7;
}

export function baseValidation(base?: BaseRule): Validation {
  const issues: string[] = [];
  if (!base) return { level: 'red', issues: ['Base principal não informada'] };
  if (!base.mainBase.trim()) issues.push('Base principal não informada');
  if (!base.excludedBases.trim()) issues.push('Regra de exclusão não configurada');
  if (!base.lastUpdated) issues.push('Data de atualização não preenchida');
  if (!issues.length) return { level: 'green', issues: [] };
  const red = issues.some(issue => /principal|exclusão não/.test(issue));
  return { level: red ? 'red' : 'yellow', issues };
}

export function dispatchValidation(dispatch: Dispatch, bases: BaseRule[]): Validation {
  const issues: string[] = [];
  const base = bases.find(item => item.id === dispatch.baseId);
  issues.push(...baseValidation(base).issues);
  if (base?.lastUpdated && dispatch.date) {
    const gap = dateDiff(dispatch.date, base.lastUpdated);
    if (gap > 7) issues.push(`Base atualizada ${gap} dias antes do disparo`);
  }
  if (!issues.length) return { level: 'green', issues: [] };
  const red = issues.some(issue => /principal|exclusão não/.test(issue));
  return { level: red ? 'red' : 'yellow', issues: [...new Set(issues)] };
}

export function overlapMap(dispatches: Dispatch[]) {
  const map = new Map<string, Dispatch[]>();
  const active = dispatches.filter(item => item.status !== 'Cancelado' && item.audience.trim());
  for (const dispatch of active) {
    const conflicts = active.filter(other =>
      other.id !== dispatch.id &&
      normalize(other.audience) === normalize(dispatch.audience) &&
      Math.abs(dateDiff(dispatch.date, other.date)) <= 1
    );
    if (conflicts.length) map.set(dispatch.id, conflicts);
  }
  return map;
}
