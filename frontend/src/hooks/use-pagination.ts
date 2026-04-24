import { useState, useCallback } from "react";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function usePagination(initialPageSize = 25) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const reset = useCallback(() => setPage(0), []);
  const next = useCallback(() => setPage(p => p + 1), []);
  const prev = useCallback(() => setPage(p => Math.max(0, p - 1)), []);
  const goTo = useCallback((p: number) => setPage(p), []);
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(0);
  }, []);

  return {
    page,
    pageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    from: page * pageSize,
    to: (page + 1) * pageSize - 1,
    reset,
    next,
    prev,
    goTo,
    setPage,
    setPageSize,
  };
}
