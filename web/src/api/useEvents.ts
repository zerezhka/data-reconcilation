import { useEffect, useRef } from 'react';

export function useSSE(onEvent: (event: string, data: unknown) => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/events');

      es.addEventListener('check-result', (e) => {
        try {
          const data = JSON.parse(e.data);
          callbackRef.current('check-result', data);
        } catch { /* ignore parse errors */ }
      });

      es.addEventListener('ping', () => {
        // connection alive
      });

      es.onerror = () => {
        es?.close();
        // reconnect after 3s
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, []);
}
