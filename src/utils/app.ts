import { CHIP_OPTIONS, RESPONSIBLE_BY_EMAIL, EXCEL_TYPES } from '../config/dispatch';
import { uid } from '../logic';
import type { AppState, BaseRule, Dispatch, DispatchChannel, DispatchChip, DispatchSortField, DispatchStatus, FileAttachment } from '../types';

export function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function responsibleForEmail(email: string) {
  return RESPONSIBLE_BY_EMAIL[email.trim().toLowerCase()] || '';
}

export function normalizeChip(value: string): DispatchChip {
  return CHIP_OPTIONS.includes(value as DispatchChip) ? value as DispatchChip : '';
}

export function normalizeState(data: AppState): AppState {
  const dispatches = (data.dispatches || []).map(item => ({
    ...item,
    channel: item.channel || 'email',
    time: item.time || '',
    templateName: item.templateName || '',
    chip: normalizeChip(item.chip || ''),
    htmlContent: item.htmlContent || '',
    subject: item.subject || '',
    body: item.body || '',
    attachments: Array.isArray(item.attachments) ? item.attachments : []
  }));
  const bases = (data.bases || []).map(base => ({
    ...base,
    spreadsheetAttachment: base.spreadsheetAttachment || null
  }));
  return {
    dispatches,
    bases,
    campaigns: unique([...(data.campaigns || []), ...dispatches.map(item => item.campaign), ...bases.map(item => item.campaign)]),
    audiences: unique([...(data.audiences || []), ...dispatches.map(item => item.audience)]),
    responsibles: unique([...(data.responsibles || []), ...dispatches.map(item => item.responsible), ...bases.map(item => item.responsible)]),
    revision: data.revision,
    catalogDates: data.catalogDates || {},
    database: data.database
  };
}

export function missingDispatchFields(dispatch: Dispatch) {
  return [
    !dispatch.responsible.trim() ? 'responsável' : ''
  ].filter(Boolean);
}

export function isRichHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function plainTextToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function richTextHtml(value: string) {
  if (!value.trim()) return '';
  return sanitizeRichHtml(isRichHtml(value) ? value : plainTextToHtml(value));
}

export function sanitizeRichHtml(value: string) {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4',
    'I', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD',
    'TH', 'THEAD', 'TR', 'U', 'UL'
  ]);
  const allowedStyles = new Set([
    'background-color', 'color', 'font-size', 'font-style', 'font-weight',
    'text-align', 'text-decoration'
  ]);

  doc.body.querySelectorAll('*').forEach(element => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (name === 'href' && element.tagName === 'A') {
        const href = attribute.value.trim();
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noreferrer');
          return;
        }
      }

      if (name === 'style') {
        const cleanStyle = attribute.value
          .split(';')
          .map(rule => rule.trim())
          .filter(rule => {
            const [property, rawValue = ''] = rule.split(':');
            const cleanProperty = property?.trim().toLowerCase();
            const cleanValue = rawValue.trim().toLowerCase();
            return allowedStyles.has(cleanProperty) && !/url|expression|javascript/.test(cleanValue);
          })
          .join('; ');
        if (cleanStyle) element.setAttribute('style', cleanStyle);
        else element.removeAttribute('style');
        return;
      }

      element.removeAttribute(attribute.name);
    });
  });

  return doc.body.innerHTML;
}

export function insertHtmlAtSelection(html: string) {
  if (document.queryCommandSupported?.('insertHTML')) {
    document.execCommand('insertHTML', false, html);
    return;
  }

  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = html;
  range.insertNode(template.content);
  selection.collapseToEnd();
}

export function isoDate(value: string) {
  return value ? value.slice(0, 10) : '';
}

export function dispatchTime(value: string) {
  return value || '-';
}

export function dispatchSortValue(dispatch: Dispatch, field: DispatchSortField) {
  if (field === 'createdAt') return dispatch.createdAt || '';
  if (field === 'updatedAt') return dispatch.updatedAt || '';
  return `${dispatch.date} ${dispatch.time || '00:00'}`;
}

export function fileToAttachment(file: File): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: uid('anexo'),
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: String(reader.result || '')
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function isExcelFile(file: File) {
  return EXCEL_TYPES.includes(file.type) || /\.(xls|xlsx)$/i.test(file.name);
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function dispatchDisplayName(dispatch: Dispatch) {
  return (dispatch.templateName || dispatch.campaign || '').trim();
}

export function duplicateDispatchNameMap(dispatches: Dispatch[]) {
  const groups = new Map<string, Dispatch[]>();
  for (const dispatch of dispatches) {
    const name = dispatchDisplayName(dispatch);
    if (!name) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    groups.set(key, [...(groups.get(key) || []), dispatch]);
  }
  const duplicates = new Map<string, Dispatch[]>();
  for (const items of groups.values()) {
    if (items.length > 1) duplicates.set(dispatchDisplayName(items[0]), items);
  }
  return duplicates;
}

export function duplicateNameCount(dispatch: Dispatch, duplicates: Map<string, Dispatch[]>) {
  const name = dispatchDisplayName(dispatch);
  if (!name) return 0;
  const entry = [...duplicates.entries()].find(([label]) => label.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
  return entry ? entry[1].filter(item => item.id !== dispatch.id).length : 0;
}

export function channelName(channel: DispatchChannel) {
  if (channel === 'html_email') return 'E-mail HTML';
  return channel === 'whatsapp' ? 'WhatsApp' : 'E-mail';
}

export function statusClass(status: DispatchStatus) {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function monthLabel(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex - 1, 1));
}

export function shiftMonth(month: string, amount: number) {
  const [year, monthIndex] = month.split('-').map(Number);
  const value = new Date(year, monthIndex - 1 + amount, 1);
  return value.toISOString().slice(0, 7);
}

export function calendarDays(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const first = new Date(year, monthIndex - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

export function missingBaseFields(base: BaseRule) {
  return [
    !base.responsible.trim() ? 'responsável' : '',
    !base.mainBase.trim() ? 'base principal' : '',
    !base.expectedAction.trim() ? 'ação esperada' : ''
  ].filter(Boolean);
}

