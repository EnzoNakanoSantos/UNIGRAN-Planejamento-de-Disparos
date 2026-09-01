import { todayISO } from '../logic';
import type { BaseRule, Dispatch, DispatchChannel, FilterState } from '../types';

export const defaultFilters = (): FilterState => ({
  q: '',
  start: '',
  end: '',
  campaign: '',
  audience: '',
  status: '',
  base: '',
  responsible: '',
  validation: '',
  pending: false,
  sent: false,
  alert: false,
  overlap: false,
  missingBase: false,
  staleBase: false,
  readyOnly: false
});

export const emptyDispatch = (channel: DispatchChannel = 'email'): Dispatch => ({
  id: '',
  channel,
  date: todayISO(),
  time: '',
  templateName: '',
  chip: '',
  htmlContent: '',
  subject: '',
  body: '',
  attachments: [],
  campaign: '',
  audience: '',
  description: '',
  status: 'Planejado',
  baseId: '',
  responsible: '',
  googleCalendarEventId: '',
  createdAt: '',
  updatedAt: ''
});

export const emptyBase = (): BaseRule => ({
  id: '',
  campaign: '',
  mainBase: '',
  excludedBases: '',
  expectedAction: '',
  lastUpdated: todayISO(),
  responsible: '',
  notes: '',
  spreadsheetAttachment: null
});
