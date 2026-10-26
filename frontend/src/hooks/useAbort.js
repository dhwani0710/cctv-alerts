import { useRef, useEffect, useCallback } from 'react';

export default function useAbort() {
  const ref = useRef(null);
  const next = useCallback(() => {
    ref.current?.abort();
    ref.current = new AbortController();
    return ref.current.signal;
  }, []);
  const abort = useCallback(() => {
    ref.current?.abort();
    ref.current = null;
  }, []);
  useEffect(() => () => ref.current?.abort(), []);
  return { next, abort };
}