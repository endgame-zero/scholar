import { useResearch } from "./hooks/useResearch";
import ResearchForm from "./components/ResearchForm";
import AgentLog from "./components/AgentLog";
import PhaseTracker from "./components/PhaseTracker";
import Report from "./components/Report";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-20">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-5">
        ◆
      </div>
      <p className="text-gray-500 text-[15px] max-w-xs leading-relaxed">
        Ask a research question and three AI agents will gather evidence, evaluate its quality, and write a structured report.
      </p>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-gray-500 px-1">
      <span className="w-3.5 h-3.5 border border-gray-700 border-t-blue-400 rounded-full animate-spin flex-none" />
      {label}
    </div>
  );
}

export default function App() {
  const { state, runResearch, reset } = useResearch();
  const isRunning = state.phase === "running";
  const isDone = state.phase === "done";
  const hasActivity = state.events.length > 0;
  const lastStatus = [...state.events]
    .reverse()
    .find((e) => e.type === "status" || e.type === "tool_call");

  const spinnerLabel =
    lastStatus?.type === "tool_call"
      ? `Calling ${lastStatus.name}…`
      : lastStatus?.message ?? "Working…";

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col">
      {/* Top bar */}
      <header className="flex-none border-b border-white/[0.06] px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            R
          </div>
          <span className="font-medium text-[15px] text-gray-200">Research Assistant</span>
          <span className="text-[11px] text-gray-600 hidden sm:block">
            Llama 3.3 70B · Tavily
          </span>
        </div>

        {isDone && (
          <button
            onClick={reset}
            className="text-[13px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
          >
            ↩ New research
          </button>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <aside className="flex-none w-80 xl:w-96 border-r border-white/[0.06] flex flex-col">
          {/* Search */}
          <div className="p-4 border-b border-white/[0.06]">
            <ResearchForm onSubmit={runResearch} disabled={isRunning} />
          </div>

          {/* Phases + log (only when there's activity) */}
          {hasActivity && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest mb-3">
                  Research pipeline
                </p>
                <PhaseTracker events={state.events} />
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest mb-3">
                  Agent log
                </p>
                <AgentLog events={state.events} />
              </div>

              {isRunning && <Spinner label={spinnerLabel} />}

              {state.phase === "error" && (
                <div className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  Research failed. Check backend logs and API keys.
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Right panel — report */}
        <main className="flex-1 overflow-y-auto">
          {state.report ? (
            <div className="max-w-3xl mx-auto px-6 py-8">
              <Report content={state.report} sources={state.sources} />
            </div>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}
