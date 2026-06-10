import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config/api';

/** Loads distinct order batches for Operations (Mango CRM — no day/challan_batch). */
export function useOperationsBatch(authFetch, { enabled = true } = {}) {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [ready, setReady] = useState(false);

  const loadBatches = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await authFetch(`${API_BASE}/operations/batches`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.batches) ? data.batches : [];
        setBatches(list);
        setSelectedBatch((prev) => (prev && list.includes(prev) ? prev : list[0] || ''));
      }
    } catch {
      /* silent */
    } finally {
      setReady(true);
    }
  }, [authFetch, enabled]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  return {
    batches,
    selectedBatch,
    setSelectedBatch,
    loadBatches,
    ready,
  };
}
