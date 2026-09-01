import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestDispatchFields } from '../shared/dispatch-smart-fill.js';

const bases = [
  { id: 'base-email', campaign: 'Rematricula' },
  { id: 'base-whats', campaign: 'Boas-vindas' }
];

const dispatches = [
  {
    id: 'email-1',
    channel: 'email',
    campaign: 'Rematricula',
    audience: 'Veteranos',
    baseId: 'base-email'
  },
  {
    id: 'email-2',
    channel: 'email',
    campaign: 'Rematricula',
    audience: 'Veteranos',
    baseId: 'base-email'
  },
  {
    id: 'whats-1',
    channel: 'whatsapp',
    campaign: 'Rematricula',
    audience: 'Calouros',
    baseId: 'base-whats'
  }
];

test('sugere ultimo campo compativel sem sobrescrever valores preenchidos', () => {
  const result = suggestDispatchFields({
    dispatches,
    bases,
    draft: {
      id: '',
      channel: 'email',
      campaign: 'Rematricula',
      audience: '',
      baseId: ''
    }
  });

  assert.deepEqual(result.patch, {
    audience: 'Veteranos',
    baseId: 'base-email'
  });
  assert.deepEqual(result.suggestedFields.sort(), ['base', 'publico']);
});

test('sugere campanha pela base selecionada quando a relacao e univoca', () => {
  const result = suggestDispatchFields({
    dispatches,
    bases,
    draft: {
      id: '',
      channel: 'email',
      campaign: '',
      audience: '',
      baseId: 'base-email'
    }
  });

  assert.deepEqual(result.patch, {
    campaign: 'Rematricula',
    audience: 'Veteranos'
  });
  assert.deepEqual(result.suggestedFields.sort(), ['campanha', 'publico']);
});

test('mantem modalidades separadas ao buscar sugestoes', () => {
  const result = suggestDispatchFields({
    dispatches,
    bases,
    draft: {
      id: '',
      channel: 'email',
      campaign: '',
      audience: 'Calouros',
      baseId: ''
    }
  });

  assert.deepEqual(result.patch, {});
  assert.deepEqual(result.suggestedFields, []);
});

test('nao sobrescreve campo escolhido manualmente', () => {
  const result = suggestDispatchFields({
    dispatches,
    bases,
    draft: {
      id: '',
      channel: 'email',
      campaign: 'Rematricula',
      audience: 'Manual',
      baseId: ''
    }
  });

  assert.deepEqual(result.patch, {
    baseId: 'base-email'
  });
  assert.deepEqual(result.suggestedFields, ['base']);
});
