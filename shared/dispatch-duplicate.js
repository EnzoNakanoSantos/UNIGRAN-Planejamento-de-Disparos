export function duplicateDispatchDraft(original, options = {}) {
  const now = options.now || new Date().toISOString();
  const id = options.id || '';
  return {
    ...original,
    id,
    attachments: Array.isArray(original?.attachments)
      ? original.attachments.map(attachment => ({ ...attachment }))
      : [],
    googleCalendarEventId: '',
    status: 'Planejado',
    createdAt: now,
    updatedAt: now
  };
}
