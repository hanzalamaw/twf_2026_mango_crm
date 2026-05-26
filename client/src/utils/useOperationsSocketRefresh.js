import { useEffect, useRef } from 'react';
import { getOperationsSocket } from './operationsSocket';
import { shouldSkipSocketRefresh } from './operationsGroupPatch';

/**
 * Debounced refresh on operations:changed only (server also emits specific events;
 * listening to all three caused duplicate reloads).
 */
export function useOperationsSocketRefresh(refresh, deps = [], delayMs = 1200, skipRef = null) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const socket = getOperationsSocket();
    let timer = null;
    let lastPayload = null;
    const onEvent = () => {
      if (shouldSkipSocketRefresh(skipRef)) return;
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(lastPayload), delayMs);
    };
    const onEventWithPayload = (payload) => {
      lastPayload = payload;
      onEvent();
    };
    socket.on('operations:changed', onEventWithPayload);
    return () => {
      clearTimeout(timer);
      socket.off('operations:changed', onEventWithPayload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls when to re-bind
  }, deps);
}
