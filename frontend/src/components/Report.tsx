import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  sources: string[];
}

function SourceCard({ url }: { url: string }) {
  let host = url;
  try { host = new URL(url).hostname.replace("www.", ""); } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] rounded-xl transition-colors group"
    >
      <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center text-[10px] text-gray-500 flex-none mt-0.5">
        ↗
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-gray-400 group-hover:text-gray-200 transition-colors truncate">{host}</p>
        <p className="text-[11px] text-gray-700 truncate mt-0.5">{url}</p>
      </div>
    </a>
  );
}

export default function Report({ content, sources }: Props) {
  const [copied, setCopied] = useState(false);

  function copyReport() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Report */}
      <div className="relative">
        <button
          onClick={copyReport}
          className="absolute top-4 right-4 z-10 px-2.5 py-1 bg-white/[0.05] hover:bg-white/10 border border-white/10 rounded-lg text-[12px] text-gray-500 hover:text-gray-300 transition-all"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl p-7 prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest mb-3 px-1">
            Sources · {sources.length}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sources.map((src) => (
              <SourceCard key={src} url={src} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
