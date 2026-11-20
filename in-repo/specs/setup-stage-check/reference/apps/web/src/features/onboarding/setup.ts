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
export function setupStage(facts: SetupFacts): SetupStage {
  const jira = jiraConnected(facts);
  const github = githubConnected(facts);
  if (jira && github) return "both";
  if (jira) return "jira";
  if (github) return "github";
  return "barebone";
}

/** A count is present only when it is greater than zero; NaN and negatives are absent. */
function present(count: number): boolean {
  return count > 0;
}

function jiraConnected(facts: SetupFacts): boolean {
  return present(facts.jira.connected);
}

function githubConnected(facts: SetupFacts): boolean {
  return present(facts.github.connected) || present(facts.github.repositories);
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
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const order: readonly SetupStepId[] =
    setupStage(facts) === "github" ? ["github", "size", "jira"] : ["jira", "github", "size"];
  const listed = order.filter(
    (id) =>
      (id !== "jira" || facts.jira.available) && (id !== "github" || facts.github.available),
  );
  let currentTaken = false;
  return listed.map((id) => {
    const done = stepDone(id, facts);
    const current = !done && !currentTaken;
    if (current) currentTaken = true;
    return { id, done, current };
  });
}

function stepDone(id: SetupStepId, facts: SetupFacts): boolean {
  switch (id) {
    case "jira":
      return present(facts.jira.connected);
    case "github":
      return present(facts.github.repositories);
    case "size":
      return present(facts.proposals);
  }
}

/** Whether every listed checklist step is done. */
export function setupComplete(facts: SetupFacts): boolean {
  return setupSteps(facts).every((step) => step.done);
}
