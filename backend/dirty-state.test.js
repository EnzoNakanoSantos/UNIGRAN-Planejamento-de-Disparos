import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchSnapshot, hasUnsavedDispatchChanges } from '../shared/dirty-state.js';

const dispatch = {
  id: 'disparo-1',
  channel: 'email',
  date: '2026-08-21',
  time: '09:00',
  templateName: 'Template',
  chip: 'EAD',
  htmlContent: '',
  subject: 'Assunto',
  body: 'Conteudo',
  attachments: [],
  campaign: 'Campanha',
  audience: 'Publico',
  description: '',
  status: 'Planejado',
  baseId: 'base-1',
  responsible: 'Responsavel',
  googleCalendarEventId: ''
};

test('detecta alteracao nao salva comparando com snapshot inicial', () => {
  const snapshot = dispatchSnapshot(dispatch);
  assert.equal(hasUnsavedDispatchChanges(dispatch, snapshot), false);
  assert.equal(hasUnsavedDispatchChanges({ ...dispatch, subject: 'Novo assunto' }, snapshot), true);
});

test('ignora metadados fora do formulario de disparo', () => {
  const snapshot = dispatchSnapshot(dispatch);
  assert.equal(hasUnsavedDispatchChanges({ ...dispatch, updatedAt: '2026-08-21T12:00:00Z' }, snapshot), false);
});
