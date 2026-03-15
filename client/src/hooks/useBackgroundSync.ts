import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

export interface QueuedPrediction {
  id: string;
  gameType: string;
  timestamp: number;
}

const QUEUE_KEY = "fl-lotto-oracle-offline-queue";

/** Read the offline prediction queue from localStorage */
function getQueue(): QueuedPrediction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Write the offline prediction queue to localStorage */
function setQueue(queue: QueuedPrediction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Hook that provides offline-aware prediction queuing.
 *
 * - `queuePrediction(gameType)` — adds a request to the queue when offline,
 *   or returns `false` if the device is online (caller should proceed normally).
 * - When the device comes back online, the hook automatically replays queued
 *   requests by calling the provided `onReplay` callback for each entry.
 */
export function useBackgroundSync(
  onReplay: (gameType: string) => Promise<void>
) {
  const onReplayRef = useRef(onReplay);
  onReplayRef.current = onReplay;

  // Process the queue when we come back online
  useEffect(() => {
    const processQueue = async () => {
      const queue = getQueue();
      if (queue.length === 0) return;

      toast.info(`Processing ${queue.length} queued prediction${queue.length > 1 ? "s" : ""}...`);

      const remaining: QueuedPrediction[] = [];

      for (const item of queue) {
        try {
          await onReplayRef.current(item.gameType);
        } catch {
          // Keep failed items in queue for next retry
          remaining.push(item);
        }
      }

      setQueue(remaining);

      const processed = queue.length - remaining.length;
      if (processed > 0) {
        toast.success(`${processed} queued prediction${processed > 1 ? "s" : ""} submitted!`);
      }
      if (remaining.length > 0) {
        toast.warning(`${remaining.length} prediction${remaining.length > 1 ? "s" : ""} still pending`);
      }
    };

    window.addEventListener("online", processQueue);
    return () => window.removeEventListener("online", processQueue);
  }, []);

  /**
   * Attempt to queue a prediction for offline processing.
   * Returns `true` if the request was queued (device is offline),
   * or `false` if the device is online (caller should proceed normally).
   */
  const queuePrediction = useCallback((gameType: string): boolean => {
    if (navigator.onLine) return false;

    const entry: QueuedPrediction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      gameType,
      timestamp: Date.now(),
    };

    const queue = getQueue();
    queue.push(entry);
    setQueue(queue);

    toast.info("You're offline — prediction queued and will auto-submit when back online", {
      duration: 4000,
    });

    return true;
  }, []);

  /** Get the current queue length */
  const getQueueLength = useCallback((): number => {
    return getQueue().length;
  }, []);

  /** Clear the queue */
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  return { queuePrediction, getQueueLength, clearQueue };
}
