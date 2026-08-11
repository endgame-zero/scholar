import { useState, useCallback } from "react";
import { ResearchEvent, ResearchState } from "../types";

export function useResearch() {
  const [state, setState] = useState<ResearchState>({
    phase: "idle",
    events: [],
    report: null,
    sources: [],
  });

  const runResearch = useCallback(async (query: string) => {
    setState({ phase: "running", events: [], report: null, sources: [] });

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event: ResearchEvent = JSON.parse(line.slice(6));

              if (event.type === "done") {
                setState((prev) => ({ ...prev, phase: "done" }));
              } else if (event.type === "report") {
                setState((prev) => ({
                  ...prev,
                  report: event.content ?? null,
                  sources: event.sources ?? [],
                  events: [...prev.events, event],
                }));
              } else {
                setState((prev) => ({
                  ...prev,
                  events: [...prev.events, event],
                }));
              }
            } catch {
              // skip malformed events
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        phase: "error",
        events: [
          ...prev.events,
          { type: "status", message: `Error: ${message}` },
        ],
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ phase: "idle", events: [], report: null, sources: [] });
  }, []);

  return { state, runResearch, reset };
}
