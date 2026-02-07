// src/hooks/useThreadSuggestion.ts
import { useEffect, useState } from "react";
import { getLastThread } from "../src/core/threading/ThreadEngine";
import { computeThreadSuggestion } from "../src/core/threading/computeThreadSuggestion";
import { ThreadSuggestion } from "../src/core/threading/threadTypes";

export function useThreadSuggestion() {
  const [suggestion, setSuggestion] = useState<ThreadSuggestion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const sig = await getLastThread();
        if (!isMounted) return;

        if (!sig) {
          setSuggestion(null);
        } else {
          const next = computeThreadSuggestion(sig);
          setSuggestion(next);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return { suggestion, loading };
}