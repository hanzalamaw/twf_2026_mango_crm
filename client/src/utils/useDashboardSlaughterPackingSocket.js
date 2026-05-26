import { useEffect, useRef } from 'react';
import { getOperationsSocket } from './operationsSocket';
import { dayLabelToNumber } from './operationsDay';

/**
 * Debounced refresh of slaughter/packing dashboard cards on slaughter:changed / line:changed only.
 * Skips events for a different day than the dashboard filter.
 */
export function useDashboardSlaughterPackingSocket(refresh, dayFilter, delayMs = 800) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const socket = getOperationsSocket();
    const filterDay = dayLabelToNumber(dayFilter);
    let timer = null;

    const schedule = (payload) => {
      if (document.visibilityState !== 'visible') return;
      const eventDay = payload?.day != null ? Number(payload.day) : null;
      if (filterDay && eventDay != null && eventDay !== filterDay) return;
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), delayMs);
    };

    socket.on('slaughter:changed', schedule);
    socket.on('line:changed', schedule);

    return () => {
      clearTimeout(timer);
      socket.off('slaughter:changed', schedule);
      socket.off('line:changed', schedule);
    };
  }, [dayFilter, delayMs]);
}
