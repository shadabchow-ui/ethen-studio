// Agent Console Implementation Pattern — common interfaces and helpers
// Extracted from the project-work-agent implementation.
//
// Each agent console follows this pattern:
//   lib/agents/workbenches/<slug>/state.ts      — domain types + state interface
//   lib/agents/workbenches/<slug>/fixture.ts     — createInitialState() with realistic fixture
//   lib/agents/workbenches/<slug>/actions.ts     — pure action handlers returning { state, event } or { state, event, artifact }
//   lib/agents/workbenches/<slug>/__tests__/     — state transition + artifact tests
//   components/workspaces/functional/consoles/   — custom console component

export interface ActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  summary: string;
  linkedItemIds?: string[];
  artifactId?: string;
}

export interface GeneratedArtifact {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  sourceAction: string;
  preview: string;
  content: string;
  linkedItemIds?: string[];
}

export interface ActionResult<TState> {
  state: TState;
  event: ActivityEvent;
}

export interface ActionWithArtifactResult<TState> {
  state: TState;
  event: ActivityEvent;
  artifact: GeneratedArtifact;
}

let _globalCounter = 1000;

export function nextId(prefix: string): string {
  _globalCounter += 1;
  return `${prefix}-${_globalCounter}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function createEvent(
  action: string,
  summary: string,
  linkedItemIds: string[],
  artifactId?: string,
  actor = "agent",
): ActivityEvent {
  return {
    id: nextId("evt"),
    timestamp: nowISO(),
    actor,
    action,
    summary,
    linkedItemIds,
    artifactId,
  };
}
