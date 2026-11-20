/**
 * Which home a workspace sees, and what the getting-started checklist above
 * it says, from what the workspace has connected. Pure: it only computes
 * from the counts `useWorkspaceSetup` hands it; same facts, same answer.
 */

/** Which home a workspace sees, by whether Jira and GitHub are connected. */
export type SetupStage = "barebone" | "jira" | "github" | "both";

/** The counts a workspace's setup is decided from. */
export interface SetupFacts {
  readonly jira: {
    readonly available: boolean;
    readonly connected: number;
    readonly broken: number;
    readonly boards: number;
  };
  readonly github: {
    readonly available: boolean;
    readonly connected: number;
    readonly repositories: number;
  };
  readonly proposals: number;
  readonly bounties: number;
  readonly canManage: boolean;
}

/**
 * The stage of a workspace: Jira is connected when `jira.connected > 0`,
 * GitHub when `github.connected > 0 || github.repositories > 0`.
 */
export function setupStage(_facts: SetupFacts): SetupStage {
  throw new Error("not implemented");
}

/** A step of the getting-started checklist. */
export type SetupStepId = "jira" | "github" | "size";

/** One checklist step: whether it is done, and whether it is the current one. */
export interface SetupStep {
  readonly id: SetupStepId;
  readonly done: boolean;
  readonly current: boolean;
}

/**
 * The getting-started checklist in its listed order, leaving out the step of
 * a tool the server does not offer; the first not-done step is current.
 * Returns a new array of new step objects on every call.
 */
export function setupSteps(_facts: SetupFacts): SetupStep[] {
  throw new Error("not implemented");
}

/** Whether every listed checklist step is done. */
export function setupComplete(_facts: SetupFacts): boolean {
  throw new Error("not implemented");
}
