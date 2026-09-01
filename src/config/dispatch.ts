import type { DispatchChip, DispatchStatus } from '../types';

export const DISPATCH_FORM_STATUS: DispatchStatus[] = [
  'Planejado',
  'Em produção',
  'Pronto para disparo'
];

export const CHIP_OPTIONS: DispatchChip[] = ['EAD', 'DOU', 'CGR', 'U.S.A'];
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
export const EXCEL_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
export const AUTH_STORAGE_KEY = 'unigran-disparos-session';
export const RESPONSIBLE_BY_EMAIL: Record<string, string> = {
  'mktdigital02.ead@unigran.br': 'Enzo Nakano',
  'mktdigital01.ead@unigran.br': 'Raquel Kuhnen',
  'mktdigital06.ead@unigran.br': 'Matheus Salazar'
};
