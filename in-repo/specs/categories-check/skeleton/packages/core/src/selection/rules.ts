/**
 * The small rule language: a rule is a named `Signal`, or an `all` or `any`
 * of rules. Evaluating a rule gives "matched" plus the reason clauses.
 */

import type { IssueFacts } from "./facts.js";

/** A named test on the facts, with the reason clause it contributes. */
export interface Signal {
  readonly id: string;
  readonly test: (facts: IssueFacts) => boolean;
  readonly describe: (facts: IssueFacts) => string | null;
}

/** A named `Signal`, or an `all` or `any` of rules. */
export type Rule = Signal | { readonly all: readonly Rule[] } | { readonly any: readonly Rule[] };

/** A rule that matches when every child matches; an empty `all` matches. */
export function all(..._rules: Rule[]): Rule {
  throw new Error("not implemented");
}

/** A rule that matches when at least one child matches; an empty `any` does not. */
export function any(..._rules: Rule[]): Rule {
  throw new Error("not implemented");
}

/** The same signal, keeping its id and test, but describing nothing. */
export function silent(_signal: Signal): Signal {
  throw new Error("not implemented");
}

/** Builds a Signal from its parts. */
export function signal(_id: string, _test: Signal["test"], _describe: Signal["describe"]): Signal {
  throw new Error("not implemented");
}

/** Whether a rule matched, and its reason clauses in depth-first order. */
export interface Evaluation {
  readonly matched: boolean;
  readonly clauses: readonly string[];
}

/** Evaluates `rule` against `facts`; an unmatched rule has no clauses. */
export function evaluate(_rule: Rule, _facts: IssueFacts): Evaluation {
  throw new Error("not implemented");
}
