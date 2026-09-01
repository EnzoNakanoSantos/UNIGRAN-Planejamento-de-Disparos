/** @typedef {import('../src/types').Dispatch} Dispatch */
/** @typedef {import('../src/types').BaseRule} BaseRule */

function uniqueNonEmpty(values) {
  const uniqueValues = [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  return uniqueValues.length === 1 ? uniqueValues[0] : '';
}

function fieldValue(draft, patch, key) {
  return String((patch[key] ?? draft[key] ?? '') || '').trim();
}

/**
 * @param {{
 *   dispatches?: Dispatch[];
 *   bases?: BaseRule[];
 *   draft: Dispatch;
 * }} input
 */
export function suggestDispatchFields({ dispatches = [], bases = [], draft }) {
  const patch = {};
  const suggestedFields = new Set();
  const channelDispatches = dispatches.filter(item => item.channel === draft.channel && item.id !== draft.id);

  if (!fieldValue(draft, patch, 'campaign') && fieldValue(draft, patch, 'baseId')) {
    const base = bases.find(item => item.id === fieldValue(draft, patch, 'baseId'));
    if (base?.campaign?.trim()) {
      patch.campaign = base.campaign.trim();
      suggestedFields.add('campanha');
    }
  }

  if (!fieldValue(draft, patch, 'baseId') && fieldValue(draft, patch, 'campaign')) {
    const baseId = uniqueNonEmpty(
      bases
        .filter(item => item.campaign === fieldValue(draft, patch, 'campaign'))
        .map(item => item.id)
    );
    if (baseId) {
      patch.baseId = baseId;
      suggestedFields.add('base');
    }
  }

  if (!fieldValue(draft, patch, 'campaign')) {
    const campaign = uniqueNonEmpty(
      channelDispatches
        .filter(item =>
          (!fieldValue(draft, patch, 'audience') || item.audience === fieldValue(draft, patch, 'audience')) &&
          (!fieldValue(draft, patch, 'baseId') || item.baseId === fieldValue(draft, patch, 'baseId'))
        )
        .map(item => item.campaign)
    );
    if (campaign) {
      patch.campaign = campaign;
      suggestedFields.add('campanha');
    }
  }

  if (!fieldValue(draft, patch, 'audience')) {
    const audience = uniqueNonEmpty(
      channelDispatches
        .filter(item =>
          (!fieldValue(draft, patch, 'campaign') || item.campaign === fieldValue(draft, patch, 'campaign')) &&
          (!fieldValue(draft, patch, 'baseId') || item.baseId === fieldValue(draft, patch, 'baseId'))
        )
        .map(item => item.audience)
    );
    if (audience) {
      patch.audience = audience;
      suggestedFields.add('publico');
    }
  }

  if (!fieldValue(draft, patch, 'baseId')) {
    const baseId = uniqueNonEmpty(
      channelDispatches
        .filter(item =>
          (!fieldValue(draft, patch, 'campaign') || item.campaign === fieldValue(draft, patch, 'campaign')) &&
          (!fieldValue(draft, patch, 'audience') || item.audience === fieldValue(draft, patch, 'audience'))
        )
        .map(item => item.baseId)
    );
    if (baseId) {
      patch.baseId = baseId;
      suggestedFields.add('base');
    }
  }

  return { patch, suggestedFields: [...suggestedFields] };
}
