import { useEffect, useRef } from "react";
import { ResearchEvent } from "../types";

function EventRow({ event, index }: { event: ResearchEvent; index: number }) {
  const base = "slide-in flex items-start gap-2.5 text-[13px] leading-5";

  switch (event.type) {
    case "status":
      return (
        <div className={base} style={{ animationDelay: `${index * 20}ms` }}>
          <span className="mt-0.5 text-blue-400 flex-none text-[10px]">◆</span>
          <span className="text-gray-400">{event.message}</span>
        </div>
      );

    case "tool_call": {
      const argStr =
        event.args && Object.keys(event.args).length
          ? Object.entries(event.args)
              .map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`)
              .join(" ")
          : "";
      return (
        <div className={base} style={{ animationDelay: `${index * 20}ms` }}>
          <span className="mt-0.5 text-amber-400 flex-none text-[10px]">→</span>
          <div className="min-w-0">
            <span className="text-amber-300 font-mono font-medium">{event.name}</span>
            {argStr && (
              <span className="text-gray-600 font-mono ml-1.5 break-all">{argStr}</span>
            )}
          </div>
        </div>
      );
    }

    case "tool_result":
      return (
        <div className={base} style={{ animationDelay: `${index * 20}ms` }}>
          <span className="mt-0.5 text-emerald-400 flex-none text-[10px]">✓</span>
          <span className="text-gray-500">
            {event.name === "search_web"
              ? `Retrieved ${event.count ?? 0} results`
              : `Scraped ${event.url ? new URL(event.url).hostname : "page"}`}
          </span>
        </div>
      );

    case "tool_error":
      return (
        <div className={base} style={{ animationDelay: `${index * 20}ms` }}>
          <span className="mt-0.5 text-red-400 flex-none text-[10px]">✗</span>
          <span className="text-red-400">
            {event.name}: {event.error}
          </span>
        </div>
      );

    case "manager_done":
      return (
        <div className={base} style={{ animationDelay: `${index * 20}ms` }}>
          <span className="mt-0.5 text-blue-400 flex-none text-[10px]">◉</span>
          <span className="text-gray-500 italic line-clamp-2">{event.summary}</span>
        </div>
      );

    case "judgment": {
      const pct = Math.round((event.score ?? 0) * 100);
      const bar = Math.round(pct / 10);
      const color =
        pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-red-400";
      const barColor =
        pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
      return (
        <div
          className={`${base} flex-col items-start gap-1.5`}
          style={{ animationDelay: `${index * 20}ms` }}
        >
          <div className="flex items-center gap-2.5">
            <span className="mt-0.5 text-purple-400 flex-none text-[10px]">⊕</span>
            <span className={`font-semibold ${color}`}>Quality score: {pct}%</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-sm ${i < bar ? barColor : "bg-white/10"}`}
                />
              ))}
            </div>
          </div>
          {event.reasoning && (
            <p className="text-gray-500 text-[12px] pl-5 leading-4">{event.reasoning}</p>
          )}
        </div>
      );
    }

    case "report":
      return (
        <div className={base} style={{ animationDelay: `${index * 20}ms` }}>
          <span className="mt-0.5 text-emerald-400 flex-none text-[10px]">★</span>
          <span className="text-emerald-400 font-medium">Report complete</span>
        </div>
      );

    default:
      return null;
  }
}

export default function AgentLog({ events }: { events: ResearchEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  const visible = events.filter((e) => e.type !== "report");
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
      {visible.map((event, i) => (
        <EventRow key={i} event={event} index={i} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
