import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateDispatchDraft } from '../shared/dispatch-duplicate.js';

const original = {
  id: 'disparo-original',
  channel: 'html_email',
  date: '2026-08-20',
  time: '14:00',
  templateName: 'Template original',
  chip: 'EAD',
  htmlContent: '<main>Conteudo</main>',
  subject: 'Assunto',
  body: 'Corpo',
  attachments: [{ id: 'anexo-1', name: 'imagem.png', type: 'image/png', size: 10, dataUrl: 'data:image/png;base64,aaa' }],
  campaign: 'Campanha',
  audience: 'Publico',
  description: 'Descricao',
  status: 'Enviado',
  baseId: 'base-1',
  responsible: 'Responsavel',
  googleCalendarEventId: 'google-event-1',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z'
};

test('duplicado recebe novo ID e preserva modalidade', () => {
  const duplicate = duplicateDispatchDraft(original, { id: 'disparo-novo', now: '2026-08-21T10:00:00.000Z' });
  assert.equal(duplicate.id, 'disparo-novo');
  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.channel, 'html_email');
});

test('duplicado preserva conteudo reutilizavel', () => {
  const duplicate = duplicateDispatchDraft(original, { id: 'disparo-novo', now: '2026-08-21T10:00:00.000Z' });
  assert.equal(duplicate.campaign, original.campaign);
  assert.equal(duplicate.audience, original.audience);
  assert.equal(duplicate.baseId, original.baseId);
  assert.equal(duplicate.templateName, original.templateName);
  assert.equal(duplicate.subject, original.subject);
  assert.equal(duplicate.htmlContent, original.htmlContent);
  assert.deepEqual(duplicate.attachments, original.attachments);
});

test('duplicado nao copia estado de sincronizacao do Calendar', () => {
  const duplicate = duplicateDispatchDraft(original, { id: 'disparo-novo', now: '2026-08-21T10:00:00.000Z' });
  assert.equal(duplicate.googleCalendarEventId, '');
  assert.equal(duplicate.status, 'Planejado');
});

test('duplicar nao altera o registro original', () => {
  const before = JSON.stringify(original);
  const duplicate = duplicateDispatchDraft(original, { id: 'disparo-novo', now: '2026-08-21T10:00:00.000Z' });
  duplicate.attachments[0].name = 'alterado.png';
  assert.equal(JSON.stringify(original), before);
});
