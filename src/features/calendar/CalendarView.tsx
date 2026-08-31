import type { Dispatch } from '../../types';
import { calendarDays, channelName, statusClass } from '../../utils/app';
import { todayISO } from '../../logic';

export function CalendarView({ month, dispatches, onView, onDayView, onCreate }: {
  month: string;
  dispatches: Dispatch[];
  onView: (dispatch: Dispatch) => void;
  onDayView: (day: string) => void;
  onCreate: (day: string) => void;
}) {
  const days = calendarDays(month);
  const today = todayISO();
  const byDate = new Map<string, Dispatch[]>();
  for (const dispatch of dispatches) {
    byDate.set(dispatch.date, [...(byDate.get(dispatch.date) || []), dispatch]);
  }

  return (
    <div className="calendar">
      {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map(day => <div className="calendarWeekday" key={day}>{day}</div>)}
      {days.map(day => {
        const items = byDate.get(day) || [];
        const outside = !day.startsWith(month);
        const previewItems = items.slice(0, 2);
        const hiddenCount = Math.max(0, items.length - previewItems.length);
        return (
          <div
            role="button"
            tabIndex={0}
            className={`calendarDay ${outside ? 'outside' : ''} ${day === today ? 'today' : ''}`}
            key={day}
            onClick={() => onDayView(day)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onDayView(day);
              }
            }}
          >
            <div className="calendarDate">
              <strong>{Number(day.slice(8, 10))}</strong>
              {items.length > 0 && <span>{items.length}</span>}
            </div>
            <div className="calendarEvents">
              {previewItems.map(dispatch => (
                <button
                  type="button"
                  className={`calendarEvent ${dispatch.channel || 'email'} ${statusClass(dispatch.status)}`}
                  key={dispatch.id}
                  onClick={event => {
                    event.stopPropagation();
                    onView(dispatch);
                  }}
                  title={`${channelName(dispatch.channel || 'email')} - ${dispatch.campaign || 'Sem campanha'}`}
                >
                  <span><i aria-hidden="true" />{dispatch.time || '--:--'}</span>
                  <strong title={dispatch.campaign || dispatch.templateName || 'Sem campanha'}>{dispatch.campaign || dispatch.templateName || 'Sem campanha'}</strong>
                  <small>{channelName(dispatch.channel || 'email')}</small>
                </button>
              ))}
              {hiddenCount > 0 && <span className="calendarMore">+ {hiddenCount} disparo(s)</span>}
              <button
                type="button"
                className="calendarEmptyCreate"
                onClick={event => {
                  event.stopPropagation();
                  onCreate(day);
                }}
              >＋ Novo</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarDayDetails({ dispatches, onView, onEdit }: {
  dispatches: Dispatch[];
  onView: (dispatch: Dispatch) => void;
  onEdit: (dispatch: Dispatch) => void;
}) {
  if (!dispatches.length) return <div className="empty">Nenhum disparo neste dia.</div>;
  return (
    <div className="dayDispatchList">
      {dispatches.map(dispatch => (
        <div className={`dayDispatchItem ${dispatch.channel || 'email'}`} key={dispatch.id}>
          <div className="dayDispatchTime">
            <strong>{dispatch.time || '--:--'}</strong>
            <span>{channelName(dispatch.channel || 'email')}</span>
          </div>
          <div className="dayDispatchInfo">
            <h3 title={dispatch.campaign || dispatch.templateName || 'Sem campanha'}>{dispatch.campaign || dispatch.templateName || 'Sem campanha'}</h3>
            <p>{dispatch.audience || 'Sem público'} | {dispatch.status}</p>
            <div className="dayDispatchMeta">
              <span>Template: {dispatch.templateName || '-'}</span>
              <span>Integração: {dispatch.chip || '-'}</span>
              <span>Responsável: {dispatch.responsible || '-'}</span>
            </div>
            {dispatch.description && <small>{dispatch.description}</small>}
          </div>
          <div className="actions">
            <button type="button" onClick={() => onView(dispatch)}>Ver completo</button>
            <button type="button" onClick={() => onEdit(dispatch)}>Editar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

