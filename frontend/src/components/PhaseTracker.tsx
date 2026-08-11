import { ResearchEvent } from "../types";

type Phase = "idle" | "active" | "done";

interface PhaseState {
  gather: Phase;
  judge: Phase;
  write: Phase;
}

function derivePhases(events: ResearchEvent[]): PhaseState {
  const types = events.map((e) => e.type);
  const hasJudgment = types.includes("judgment");
  const hasReport = types.includes("report");
  const hasManagerDone = types.includes("manager_done");
  const hasAnyTool = types.some((t) => t === "tool_call" || t === "tool_result");

  const judgeActive =
    hasJudgment ||
    (hasManagerDone &&
      events.some(
        (e) => e.type === "status" && e.message?.toLowerCase().includes("evaluat")
      ));

  const writeActive =
    hasReport ||
    events.some((e) => e.type === "status" && e.message?.toLowerCase().includes("analyst"));

  return {
    gather: hasManagerDone || hasJudgment ? "done" : hasAnyTool ? "active" : "idle",
    judge: hasReport ? "done" : judgeActive ? "active" : "idle",
    write: hasReport ? "done" : writeActive ? "active" : "idle",
  };
}

function Step({
  label,
  icon,
  phase,
}: {
  label: string;
  icon: string;
  phase: Phase;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-none transition-all ${
          phase === "done"
            ? "bg-emerald-500/15 text-emerald-400"
            : phase === "active"
            ? "bg-blue-500/15 text-blue-400"
            : "bg-white/5 text-gray-600"
        }`}
      >
        {phase === "done" ? "✓" : phase === "active" ? <span className="pulse-dot">{icon}</span> : icon}
      </div>
      <span
        className={`text-sm transition-colors ${
          phase === "done"
            ? "text-emerald-400"
            : phase === "active"
            ? "text-blue-300 font-medium"
            : "text-gray-600"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export default function PhaseTracker({ events }: { events: ResearchEvent[] }) {
  const phases = derivePhases(events);
  return (
    <div className="space-y-2 px-1">
      <Step icon="⬡" label="Manager — gathering evidence" phase={phases.gather} />
      <div className="w-px h-3 bg-white/10 ml-3.5" />
      <Step icon="◈" label="Judge — evaluating quality" phase={phases.judge} />
      <div className="w-px h-3 bg-white/10 ml-3.5" />
      <Step icon="✦" label="Analyst — writing report" phase={phases.write} />
    </div>
  );
}
