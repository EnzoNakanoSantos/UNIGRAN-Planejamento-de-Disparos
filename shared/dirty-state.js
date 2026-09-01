const DISPATCH_DIRTY_FIELDS = [
  'id',
  'channel',
  'date',
  'time',
  'templateName',
  'chip',
  'htmlContent',
  'subject',
  'body',
  'attachments',
  'campaign',
  'audience',
  'description',
  'status',
  'baseId',
  'responsible',
  'googleCalendarEventId'
];

function normalizeAttachment(attachment) {
  return {
    id: attachment?.id || '',
    name: attachment?.name || '',
    type: attachment?.type || '',
    size: Number(attachment?.size || 0),
    dataUrl: attachment?.dataUrl || ''
  };
}

export function dispatchSnapshot(dispatch) {
  const value = {};
  for (const field of DISPATCH_DIRTY_FIELDS) {
    if (field === 'attachments') {
      value.attachments = Array.isArray(dispatch?.attachments)
        ? dispatch.attachments.map(normalizeAttachment)
        : [];
      continue;
    }
    value[field] = String(dispatch?.[field] || '');
  }
  return JSON.stringify(value);
}

export function hasUnsavedDispatchChanges(current, initialSnapshot) {
  if (!initialSnapshot) return false;
  return dispatchSnapshot(current) !== initialSnapshot;
}
