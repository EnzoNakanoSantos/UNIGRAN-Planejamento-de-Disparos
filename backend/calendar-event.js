export const CALENDAR_TIME_ZONE = 'America/Campo_Grande';
export const CALENDAR_DURATION_MINUTES = 60;

function padNumber(value) {
  return String(value).padStart(2, '0');
}

export function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return match ? `${match[1]}:${match[2]}` : '09:00';
}

export function addMinutesToLocalDateTime(dateValue, timeValue, minutes) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hour, minute] = normalizeTime(timeValue).split(':').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  return `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1)}-${padNumber(date.getUTCDate())}T${padNumber(date.getUTCHours())}:${padNumber(date.getUTCMinutes())}:00`;
}

export function calendarDateTime(dispatch) {
  const time = normalizeTime(dispatch.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dispatch.date)) return null;
  return {
    dateTime: `${dispatch.date}T${time}:00`,
    timeZone: CALENDAR_TIME_ZONE
  };
}

function googleCalendarColorId(channel) {
  if (channel === 'whatsapp') return '10';
  if (channel === 'html_email') return '3';
  return '7';
}

export function buildGoogleCalendarSummary(dispatch) {
  const title = dispatch.templateName || dispatch.campaign || 'Disparo';
  if (dispatch.channel === 'whatsapp') return `💬 ${title}`;
  if (dispatch.channel === 'html_email') return `📧 ${title}`;
  return `📧 ${title}`;
}

export function buildGoogleCalendarDescription(dispatch, base) {
  return [
    `ID do disparo: ${dispatch.id}`,
    dispatch.templateName ? `Template: ${dispatch.templateName}` : '',
    dispatch.subject ? `Assunto: ${dispatch.subject}` : '',
    dispatch.audience ? `Público: ${dispatch.audience}` : '',
    dispatch.responsible ? `Responsável: ${dispatch.responsible}` : '',
    base?.mainBase ? `Base: ${base.mainBase}` : '',
    dispatch.description ? `Descrição: ${dispatch.description}` : ''
  ].filter(Boolean).join('\n');
}

export function toN8nCalendarEvent(dispatch, base) {
  const start = calendarDateTime(dispatch);
  const eventId = dispatch.googleCalendarEventId || '';
  return {
    sourceId: dispatch.id,
    templateId: dispatch.id,
    templateName: dispatch.templateName || '',
    googleEventId: eventId,
    id: eventId,
    colorId: googleCalendarColorId(dispatch.channel || 'email'),
    transparency: 'opaque',
    summary: buildGoogleCalendarSummary(dispatch),
    description: buildGoogleCalendarDescription(dispatch, base),
    start,
    end: start ? {
      dateTime: addMinutesToLocalDateTime(dispatch.date, dispatch.time || '', CALENDAR_DURATION_MINUTES),
      timeZone: CALENDAR_TIME_ZONE
    } : null,
    extendedProperties: {
      private: {
        source: 'unigran-email-planner',
        dispatchId: dispatch.id,
        googleEventId: eventId,
        status: dispatch.status,
        channel: dispatch.channel || 'email',
        campaign: dispatch.campaign || '',
        audience: dispatch.audience || '',
        responsible: dispatch.responsible || ''
      }
    },
    raw: dispatch
  };
}
