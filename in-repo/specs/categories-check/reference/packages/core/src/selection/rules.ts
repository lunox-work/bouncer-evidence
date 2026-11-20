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
export function all(...rules: Rule[]): Rule {
  return { all: rules };
}

/** A rule that matches when at least one child matches; an empty `any` does not. */
export function any(...rules: Rule[]): Rule {
  return { any: rules };
}

/** The same signal, keeping its id and test, but describing nothing. */
export function silent(signal: Signal): Signal {
  return { id: signal.id, test: signal.test, describe: () => null };
}

/** Builds a Signal from its parts. */
export function signal(id: string, test: Signal["test"], describe: Signal["describe"]): Signal {
  return { id, test, describe };
}

/** Whether a rule matched, and its reason clauses in depth-first order. */
export interface Evaluation {
  readonly matched: boolean;
  readonly clauses: readonly string[];
}

function noMatch(): Evaluation {
  return { matched: false, clauses: [] };
}

/** Evaluates `rule` against `facts`; an unmatched rule has no clauses. */
export function evaluate(rule: Rule, facts: IssueFacts): Evaluation {
  if ("all" in rule) {
    // Every child is evaluated, even after one fails.
    const results = rule.all.map((child) => evaluate(child, facts));
    return results.every((result) => result.matched)
      ? { matched: true, clauses: results.flatMap((result) => result.clauses) }
      : noMatch();
  }
  if ("any" in rule) {
    const matches = rule.any.map((child) => evaluate(child, facts)).filter((result) => result.matched);
    return matches.length > 0
      ? { matched: true, clauses: matches.flatMap((result) => result.clauses) }
      : noMatch();
  }
  if (!rule.test(facts)) return noMatch();
  const clause = rule.describe(facts);
  return { matched: true, clauses: clause === null ? [] : [clause] };
}
