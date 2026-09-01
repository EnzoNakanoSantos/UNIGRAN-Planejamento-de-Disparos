import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMarkDispatchReady,
  missingReadyDispatchFields,
  shouldValidateReadiness
} from '../shared/dispatch-readiness.js';

const baseDispatch = {
  id: 'disparo-teste',
  channel: 'email',
  date: '2026-08-21',
  time: '09:30',
  campaign: 'Campanha',
  audience: 'Publico',
  baseId: 'base-1',
  responsible: 'Responsavel',
  templateName: 'Template',
  subject: 'Assunto',
  body: 'Conteudo',
  htmlContent: '<p>Conteudo HTML</p>',
  status: 'Pronto para disparo'
};

test('E-mail incompleto nao fica pronto', () => {
  const missing = missingReadyDispatchFields({ ...baseDispatch, subject: '', body: '' });
  assert.deepEqual(missing, ['assunto', 'conteudo']);
  assert.equal(canMarkDispatchReady({ ...baseDispatch, subject: '', body: '' }), false);
});

test('E-mail completo fica pronto', () => {
  assert.deepEqual(missingReadyDispatchFields({ ...baseDispatch, channel: 'email' }), []);
  assert.equal(canMarkDispatchReady({ ...baseDispatch, channel: 'email' }), true);
});

test('WhatsApp incompleto nao fica pronto sem exigir assunto', () => {
  const missing = missingReadyDispatchFields({
    ...baseDispatch,
    channel: 'whatsapp',
    subject: '',
    body: ''
  });
  assert.deepEqual(missing, ['mensagem']);
  assert.equal(canMarkDispatchReady({ ...baseDispatch, channel: 'whatsapp', subject: '', body: '' }), false);
});

test('WhatsApp completo fica pronto sem assunto', () => {
  const dispatch = { ...baseDispatch, channel: 'whatsapp', subject: '', body: 'Mensagem' };
  assert.deepEqual(missingReadyDispatchFields(dispatch), []);
  assert.equal(canMarkDispatchReady(dispatch), true);
});

test('HTML incompleto nao fica pronto', () => {
  const dispatch = { ...baseDispatch, channel: 'html_email', subject: '', htmlContent: '' };
  assert.deepEqual(missingReadyDispatchFields(dispatch), ['assunto', 'conteudo HTML']);
  assert.equal(canMarkDispatchReady(dispatch), false);
});

test('HTML completo fica pronto', () => {
  const dispatch = { ...baseDispatch, channel: 'html_email', body: '', htmlContent: '<main>ok</main>' };
  assert.deepEqual(missingReadyDispatchFields(dispatch), []);
  assert.equal(canMarkDispatchReady(dispatch), true);
});

test('Planejado incompleto continua podendo ser salvo', () => {
  const dispatch = { ...baseDispatch, status: 'Planejado', responsible: '', body: '', subject: '' };
  assert.equal(shouldValidateReadiness(dispatch.status), false);
  assert.notDeepEqual(missingReadyDispatchFields(dispatch), []);
});

test('Em producao incompleto continua podendo ser salvo', () => {
  const dispatch = { ...baseDispatch, status: 'Em produção', responsible: '', body: '', subject: '' };
  assert.equal(shouldValidateReadiness(dispatch.status), false);
  assert.notDeepEqual(missingReadyDispatchFields(dispatch), []);
});
