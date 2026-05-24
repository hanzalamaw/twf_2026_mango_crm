import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import {
  DAY_OPTIONS,
  batchesForDay,
  latestBatchIdForDay,
  normalizeDayLabel,
} from './orderTags';

/**
 * Loads operations batches, resolves active calendar day from API (for hints),
 * and selects Day 1 + latest batch for that day by default on page open.
 */
export function useOperationsBatchDay(authFetch, { enabled = true, defaultDay = 'Day 1' } = {}) {
  const [batches, setBatches] = useState([]);
  const [activeDay, setActiveDay] = useState('Day 1');
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [ready, setReady] = useState(false);

  const loadBatches = useCallback(async () => {
    if (!enabled) return;
    try {
      const [batchRes, dayRes] = await Promise.all([
        authFetch(`${API_BASE}/operations/batches`),
        authFetch(`${API_BASE}/operations/active-day`),
      ]);
      let day = 'Day 1';
      if (dayRes.ok) {
        const dayData = await dayRes.json().catch(() => ({}));
        day = normalizeDayLabel(dayData.day) || 'Day 1';
      }
      setActiveDay(day);
      const initialDay = normalizeDayLabel(defaultDay) || 'Day 1';
      setSelectedDay((prev) => normalizeDayLabel(prev) || initialDay);

      if (batchRes.ok) {
        const data = await batchRes.json();
        setBatches(data.batches || []);
      }
    } catch {
      /* silent */
    } finally {
      setReady(true);
    }
  }, [authFetch, enabled, defaultDay]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const dayBatches = useMemo(
    () => batchesForDay(batches, selectedDay),
    [batches, selectedDay]
  );

  useEffect(() => {
    if (!ready) return;
    const latest = latestBatchIdForDay(batches, selectedDay);
    setSelectedBatch((prev) => {
      if (prev != null && dayBatches.some((b) => b.batch_id === prev)) return prev;
      return latest;
    });
  }, [ready, batches, selectedDay, dayBatches]);

  const onDayChange = useCallback((day) => {
    const normalized = normalizeDayLabel(day) || day;
    setSelectedDay(normalized);
    const latest = latestBatchIdForDay(batches, normalized);
    setSelectedBatch(latest);
  }, [batches]);

  return {
    batches,
    dayBatches,
    activeDay,
    selectedDay,
    setSelectedDay: onDayChange,
    selectedBatch,
    setSelectedBatch,
    loadBatches,
    ready,
    DAY_OPTIONS,
  };
}
