import { useMemo, useState } from 'react';
import type { Dispatch } from '../../types';
import { todayISO } from '../../logic';

export function useCalendar(dispatches: Dispatch[]) {
  const [calendarMonth, setCalendarMonth] = useState(todayISO().slice(0, 7));
  const [viewingDay, setViewingDay] = useState('');
  const calendarDispatches = useMemo(
    () => dispatches.filter(item => item.date.startsWith(calendarMonth))
      .sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`)),
    [calendarMonth, dispatches]
  );
  const viewingDayDispatches = useMemo(
    () => dispatches.filter(item => item.date === viewingDay)
      .sort((a, b) => `${a.time || '00:00'} ${a.campaign}`.localeCompare(`${b.time || '00:00'} ${b.campaign}`)),
    [dispatches, viewingDay]
  );
  return { calendarMonth, setCalendarMonth, viewingDay, setViewingDay, calendarDispatches, viewingDayDispatches };
}
