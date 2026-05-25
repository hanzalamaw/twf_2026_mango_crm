import { useEffect, useRef } from 'react';
import { getOperationsSocket } from './operationsSocket';

/** Debounced refresh on operations socket events (avoids request storms / UI flicker). */
export function useOperationsSocketRefresh(refresh, deps = [], delayMs = 1200) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const socket = getOperationsSocket();
    let timer = null;
    const onEvent = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), delayMs);
    };
    socket.on('operations:changed', onEvent);
    socket.on('challans:changed', onEvent);
    socket.on('riders:changed', onEvent);
    return () => {
      clearTimeout(timer);
      socket.off('operations:changed', onEvent);
      socket.off('challans:changed', onEvent);
      socket.off('riders:changed', onEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls when to re-bind
  }, deps);
}
