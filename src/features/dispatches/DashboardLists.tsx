import type { BaseRule, Dispatch } from '../../types';
import { dispatchValidation, fmtDate } from '../../logic';
import { dispatchTime } from '../../utils/app';
import { ValidationBadge } from '../../components/feedback/ValidationBadge';

export function UpcomingList({ dispatches, bases }: { dispatches: Dispatch[]; bases: BaseRule[] }) {
  if (!dispatches.length) return <div className="empty smallEmpty">Nenhum disparo nos próximos 15 dias.</div>;
  return (
    <div className="dailyList upcomingScroll">
      {dispatches.map(dispatch => {
        const validation = dispatchValidation(dispatch, bases);
        return (
          <div className="dailyItem" key={dispatch.id}>
            <strong>{fmtDate(dispatch.date)}{dispatch.time ? ` - ${dispatchTime(dispatch.time)}` : ''} - {dispatch.campaign || 'Sem campanha'}</strong>
            <span>{dispatch.audience || 'Sem público'} | {dispatch.status}</span>
            <ValidationBadge validation={validation} />
          </div>
        );
      })}
    </div>
  );
}

export function IssueList({ items }: { items: string[] }) {
  if (!items.length) return <div className="empty smallEmpty">Nenhuma pendência de cadastro encontrada.</div>;
  return (
    <div className="dailyList">
      {items.map(item => <div className="dailyItem issue" key={item}>{item}</div>)}
    </div>
  );
}
