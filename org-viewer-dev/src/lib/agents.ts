export interface AgentConfig {
  id: string;
  label: string;
  launchCmd: string;
  printArgs: string[];
  promptQuote: "single" | "double";
  submitKey?: "enter" | "shift+enter";
}

export interface AgentRegistry {
  defaultAgent: string;
  agents: Record<string, Omit<AgentConfig, "id">>;
}

export const CLAUDE_FALLBACK: AgentConfig = {
  id: "claude",
  label: "Claude",
  launchCmd: "claude",
  printArgs: ["--print"],
  promptQuote: "single",
};

export function resolveAgent(agentId: string | undefined, registry: AgentRegistry | null): AgentConfig {
  const id = agentId ?? registry?.defaultAgent ?? "claude";
  const entry = registry?.agents[id];
  if (!entry) return { ...CLAUDE_FALLBACK, id };
  return { id, ...entry };
}
