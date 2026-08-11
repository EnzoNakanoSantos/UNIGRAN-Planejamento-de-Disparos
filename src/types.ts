export type DispatchStatus =
  | 'Planejado'
  | 'Em produção'
  | 'Pronto para disparo'
  | 'Enviado'
  | 'Pausado'
  | 'Cancelado';

export type DispatchChannel = 'email' | 'whatsapp' | 'html_email';
export type DispatchChip = '' | 'EAD' | 'DOU' | 'CGR' | 'U.S.A';
export type FileAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};
export type DispatchAttachment = FileAttachment;

export type Dispatch = {
  id: string;
  channel: DispatchChannel;
  date: string;
  time: string;
  templateName: string;
  chip: DispatchChip;
  htmlContent: string;
  subject: string;
  body: string;
  attachments: DispatchAttachment[];
  campaign: string;
  audience: string;
  description: string;
  status: DispatchStatus;
  baseId: string;
  responsible: string;
  googleCalendarEventId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BaseRule = {
  id: string;
  campaign: string;
  mainBase: string;
  excludedBases: string;
  expectedAction: string;
  lastUpdated: string;
  responsible: string;
  notes: string;
  spreadsheetAttachment: FileAttachment | null;
};

export type AppState = {
  dispatches: Dispatch[];
  bases: BaseRule[];
  campaigns: string[];
  audiences: string[];
  responsibles: string[];
  revision?: string;
  catalogDates?: {
    campaigns?: Record<string, { createdAt: string; updatedAt: string }>;
    audiences?: Record<string, { createdAt: string; updatedAt: string }>;
    responsibles?: Record<string, { createdAt: string; updatedAt: string }>;
  };
  database?: 'supabase';
};

export type Validation = {
  level: 'green' | 'yellow' | 'red';
  issues: string[];
};

export type Tab = 'email' | 'whatsapp' | 'html_email' | 'calendar' | 'bases' | 'catalogs';
export type Modal = 'dispatch' | 'dispatchDetails' | 'calendarDay' | 'base' | null;
export type CatalogKey = 'campaigns' | 'audiences' | 'responsibles';
export type FilterState = {
  q: string;
  start: string;
  end: string;
  campaign: string;
  audience: string;
  status: string;
  base: string;
  responsible: string;
  validation: string;
  pending: boolean;
  sent: boolean;
  alert: boolean;
  overlap: boolean;
  missingBase: boolean;
  staleBase: boolean;
  readyOnly: boolean;
};
export type FilterKey = keyof FilterState;
export type BaseSort = 'name' | 'date-desc' | 'date-asc';
export type DispatchSortField = 'dispatchDate' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export const STATUS: DispatchStatus[] = [
  'Planejado',
  'Em produção',
  'Pronto para disparo',
  'Enviado',
  'Pausado',
  'Cancelado'
];
