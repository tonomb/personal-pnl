import { useEffect, useRef, useState } from "react";

/**
 * Keyboard highlight for a filterable list: an index clamped to the list, reset
 * to the first item whenever `resetKey` (the search text) changes, with the
 * highlighted item kept in view. Mark the highlighted element with
 * `data-highlighted="true"` inside the element `listRef` is attached to.
 */
export function useListHighlight(count: number, resetKey: unknown) {
  const [rawIndex, setRawIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRawIndex(0);
  }, [resetKey]);

  const index = count === 0 ? -1 : Math.min(rawIndex, count - 1);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-highlighted="true"]');
    el?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  function move(delta: number) {
    if (count === 0) return;
    setRawIndex(Math.max(0, Math.min(index + delta, count - 1)));
  }

  return { index, move, listRef };
}
