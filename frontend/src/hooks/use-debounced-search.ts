import { useState, useEffect, useRef } from "react";

export function useDebouncedSearch(delay = 400) {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSearchQuery(searchInput), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchInput, delay]);

  return { searchInput, searchQuery, setSearchInput };
}
