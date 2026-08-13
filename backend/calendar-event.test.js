import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleCalendarSummary,
  buildGoogleCalendarDescription,
  CALENDAR_TIME_ZONE,
  toN8nCalendarEvent
} from './calendar-event.js';

const dispatch = {
  id: 'disparo-teste',
  channel: 'email',
  date: '2026-08-11',
  time: '17:00',
  templateName: 'tese',
  subject: 'teste assunto',
  audience: 'Alunos ativos',
  responsible: 'Enzo Nakano',
  description: 'Mensagem operacional',
  campaign: 'Campanha',
  status: 'Pronto para disparo',
  googleCalendarEventId: 'google-event-1'
};

test('monta título, descrição e horário local sem deslocamento', () => {
  const event = toN8nCalendarEvent(dispatch, { mainBase: 'inscritos não matriculados' });
  assert.equal(event.summary, '📧 tese');
  assert.equal(event.colorId, '7');
  assert.equal(event.transparency, 'opaque');
  assert.equal(event.start.dateTime, '2026-08-11T17:00:00');
  assert.equal(event.start.timeZone, CALENDAR_TIME_ZONE);
  assert.equal(event.end.dateTime, '2026-08-11T18:00:00');
  assert.equal(event.googleEventId, 'google-event-1');
  assert.equal(event.description, [
    'ID do disparo: disparo-teste',
    'Template: tese',
    'Assunto: teste assunto',
    'Público: Alunos ativos',
    'Responsável: Enzo Nakano',
    'Base: inscritos não matriculados',
    'Descrição: Mensagem operacional'
  ].join('\n'));
});

test('destaca o título de acordo com o canal', () => {
  assert.equal(buildGoogleCalendarSummary({ templateName: 'tese', channel: 'email' }), '📧 tese');
  assert.equal(buildGoogleCalendarSummary({ templateName: 'tese', channel: 'whatsapp' }), '💬 tese');
  assert.equal(buildGoogleCalendarSummary({ templateName: 'tese', channel: 'html_email' }), '📧 tese');
});

test('mantém as cores de canal e eventos não transparentes', () => {
  assert.equal(toN8nCalendarEvent({ ...dispatch, channel: 'email' }).colorId, '7');
  assert.equal(toN8nCalendarEvent({ ...dispatch, channel: 'whatsapp' }).colorId, '10');
  assert.equal(toN8nCalendarEvent({ ...dispatch, channel: 'html_email' }).colorId, '3');
  assert.equal(toN8nCalendarEvent(dispatch).transparency, 'opaque');
});

test('omite campos ausentes sem produzir valores artificiais', () => {
  const description = buildGoogleCalendarDescription({ id: 'disparo-vazio' }, undefined);
  assert.equal(description, 'ID do disparo: disparo-vazio');
  assert.doesNotMatch(description, /undefined|null|\[object Object\]/);
});

test('resolve a base pelo valor humano recebido e preserva virada do dia', () => {
  const event = toN8nCalendarEvent({ ...dispatch, time: '23:30' }, { mainBase: 'Base humana' });
  assert.match(event.description, /Base: Base humana/);
  assert.equal(event.end.dateTime, '2026-08-12T00:30:00');
});
