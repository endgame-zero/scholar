export type EventType =
  | "status"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "judgment"
  | "manager_done"
  | "report"
  | "done";

export interface ResearchEvent {
  type: EventType;
  // status
  message?: string;
  // tool_call
  name?: string;
  args?: Record<string, unknown>;
  // tool_result
  count?: number;
  url?: string;
  // tool_error
  error?: string;
  // judgment
  score?: number;
  reasoning?: string;
  sufficient?: boolean;
  // manager_done
  summary?: string;
  // report
  content?: string;
  sources?: string[];
}

export interface ResearchState {
  phase: "idle" | "running" | "done" | "error";
  events: ResearchEvent[];
  report: string | null;
  sources: string[];
}
