import { useState, FormEvent, KeyboardEvent } from "react";

interface Props {
  onSubmit: (query: string) => void;
  disabled: boolean;
}

const EXAMPLES = [
  "Latest breakthroughs in quantum computing",
  "How does CRISPR gene editing work?",
  "Current state of fusion energy research",
  "Impact of AI on software engineering",
];

export default function ResearchForm({ onSubmit, disabled }: Props) {
  const [query, setQuery] = useState("");

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q && !disabled) onSubmit(q);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to research?"
          rows={3}
          disabled={disabled}
          className="w-full bg-white/[0.03] border border-white/10 hover:border-white/20 focus:border-blue-500/60 focus:ring-0 rounded-xl px-4 pt-3 pb-12 text-[15px] text-gray-100 placeholder-gray-600 resize-none outline-none transition-colors disabled:opacity-40"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <span className="text-[11px] text-gray-700">⏎ to search</span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !query.trim()}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-1.5"
          >
            {disabled ? (
              <>
                <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                Working
              </>
            ) : (
              <>Research</>
            )}
          </button>
        </div>
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuery(ex)}
              className="text-[12px] px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-full text-gray-500 hover:text-gray-300 transition-all"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
