import assert from "node:assert/strict";
import { test } from "node:test";

import * as stages from "../../src/stages.js";
import {
  BOUNTY_STEPS,
  bountyStatus,
  scopeApproved,
  stepHeldBy,
  stepHeldReason,
} from "../../src/stages.js";

type Bounty = {
  readonly version: number;
  readonly approval: { readonly version: number } | null;
};
type Proposal = { readonly status: string } | null;

const PRICE_SENTENCE = "Approve the scope before changing the price.";
const SANDBOX_BY_SCOPE =
  "Approve the scope and the price before changing the sandbox.";
const SANDBOX_BY_PRICE = "Approve the price before changing the sandbox.";

function expectedSentence(
  step: "price" | "sandbox",
  heldBy: "scope" | "price",
): string {
  if (step === "price") return PRICE_SENTENCE;
  return heldBy === "scope" ? SANDBOX_BY_SCOPE : SANDBOX_BY_PRICE;
}

// Extends "[happy-3] the sentence for each hold": the pairs in another order,
// repeated, each still the exact sentence (a shortcut that returns by call
// count or remembers the last step gets these wrong).
test("[happy-3] each pair gives its exact sentence in any order and on every call", () => {
  const pairs: readonly (readonly ["price" | "sandbox", "scope" | "price"])[] = [
    ["sandbox", "price"],
    ["sandbox", "scope"],
    ["price", "scope"],
    ["sandbox", "price"],
    ["price", "scope"],
    ["sandbox", "scope"],
    ["sandbox", "scope"],
    ["sandbox", "price"],
  ];
  for (let round = 0; round < 3; round++) {
    for (const [step, heldBy] of pairs) {
      assert.equal(
        stepHeldReason(step, heldBy),
        expectedSentence(step, heldBy),
        `${step} ${heldBy}`,
      );
    }
  }
});

// Extends "[happy-3] the sentences have no surrounding whitespace and the
// sandbox's vary by holder": the sandbox's sentence follows heldBy, not the
// step alone, and the price's names the scope, never the price as holder.
test("[happy-3] the sandbox's sentence follows the holder and the price's sentence is not a sandbox one", () => {
  assert.equal(stepHeldReason("sandbox", "price"), SANDBOX_BY_PRICE);
  assert.notEqual(stepHeldReason("sandbox", "price"), SANDBOX_BY_SCOPE);
  assert.equal(stepHeldReason("sandbox", "scope"), SANDBOX_BY_SCOPE);
  assert.notEqual(stepHeldReason("sandbox", "scope"), SANDBOX_BY_PRICE);
  const price = stepHeldReason("price", "scope");
  assert.equal(price, PRICE_SENTENCE);
  assert.notEqual(price, SANDBOX_BY_SCOPE);
  assert.notEqual(price, SANDBOX_BY_PRICE);
  for (const sentence of [price, stepHeldReason("sandbox", "scope"), stepHeldReason("sandbox", "price")]) {
    assert.equal(typeof sentence, "string");
    assert.equal(sentence, sentence.trim());
    assert.ok(sentence.endsWith("."));
  }
});

// The sentences come only from stepHeldReason: stages.ts exports no other
// name, and none of its exports is one of the sentences.
test("[happy-3] the sentences come only from stepHeldReason and stages.ts exports no constant for them", () => {
  assert.deepEqual(Object.keys(stages).sort(), [
    "BOUNTY_STATUSES",
    "BOUNTY_STEPS",
    "bountyStatus",
    "scopeApproved",
    "scopeVersionOf",
    "stageDrift",
    "stepHeldBy",
    "stepHeldReason",
  ]);
  const sentences = [
    stepHeldReason("price", "scope"),
    stepHeldReason("sandbox", "scope"),
    stepHeldReason("sandbox", "price"),
  ];
  assert.deepEqual(sentences, [PRICE_SENTENCE, SANDBOX_BY_SCOPE, SANDBOX_BY_PRICE]);
  for (const value of Object.values(stages)) {
    assert.ok(!(sentences as unknown[]).includes(value));
  }
});

// Extends "[unhappy-3] the price step held by "price" still gives the scope
// sentence": called after the sandbox's "price" sentence and repeatedly, it
// stays the price step's scope sentence (never the sandbox's price sentence).
test('[unhappy-3] stepHeldReason("price", "price") stays the scope sentence after other calls and on repeat', () => {
  assert.equal(stepHeldReason("sandbox", "price"), SANDBOX_BY_PRICE);
  for (let i = 0; i < 5; i++) {
    let sentence: string | undefined;
    assert.doesNotThrow(() => {
      sentence = stepHeldReason("price", "price");
    });
    assert.equal(sentence, PRICE_SENTENCE);
    assert.notEqual(sentence, SANDBOX_BY_PRICE);
    assert.equal(stepHeldReason("sandbox", "scope"), SANDBOX_BY_SCOPE);
  }
});

// Extends "[happy-4] the two functions compose into the words shown to the
// user": every held result over a grid of bounties, proposals and steps
// composes into the sentence for that step and holder.
test("[happy-4] every hold over a grid of bounties and proposals composes into its sentence", () => {
  const bounties: readonly Bounty[] = [
    { version: 0, approval: null },
    { version: 0, approval: { version: 0 } },
    { version: 3, approval: null },
    { version: 3, approval: { version: 2 } },
    { version: 3, approval: { version: 4 } },
    { version: 3, approval: { version: 3 } },
  ];
  const proposals: readonly Proposal[] = [
    null,
    { status: "proposed" },
    { status: "approved" },
    { status: "Approved" },
  ];
  let held = 0;
  for (const bounty of bounties) {
    const scopeOk = bounty.approval !== null && bounty.approval.version === bounty.version;
    for (const proposal of proposals) {
      const priceOk = proposal !== null && proposal.status === "approved";
      const priceHeld = stepHeldBy("price", bounty, proposal);
      assert.equal(priceHeld, scopeOk ? null : "scope");
      if (priceHeld !== null) {
        held++;
        assert.equal(stepHeldReason("price", priceHeld), PRICE_SENTENCE);
      }
      const sandboxHeld = stepHeldBy("sandbox", bounty, proposal);
      assert.equal(sandboxHeld, !scopeOk ? "scope" : !priceOk ? "price" : null);
      if (sandboxHeld !== null) {
        held++;
        assert.equal(
          stepHeldReason("sandbox", sandboxHeld),
          sandboxHeld === "scope" ? SANDBOX_BY_SCOPE : SANDBOX_BY_PRICE,
        );
      }
    }
  }
  assert.equal(held, 16 + 22);
});

// Extends "[happy-4] an unapproved scope composes into the scope sentence":
// a stale approval with a missing proposal composes into the sandbox's scope
// sentence, not its price sentence.
test("[happy-4] a stale scope approval and a missing proposal compose into the sandbox's scope sentence", () => {
  const bounty = { version: 4, approval: { version: 3 } };
  const heldBy = stepHeldBy("sandbox", bounty, null);
  assert.equal(heldBy, "scope");
  assert.ok(heldBy !== null);
  assert.equal(stepHeldReason("sandbox", heldBy), SANDBOX_BY_SCOPE);
});

// Extends "[happy-5] scopeApproved and bountyStatus are unchanged": a priced
// bounty still reads as priced while its sandbox stays held until the scope is
// approved again, and the steps keep their order.
test("[happy-5] bountyStatus and BOUNTY_STEPS are unchanged alongside the holds", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  const bounty = {
    version: 2,
    approval: null,
    proposal: { status: "approved" },
    sandbox: null,
  };
  assert.equal(bountyStatus(bounty, now), "priced");
  assert.equal(scopeApproved(bounty), false);
  assert.equal(stepHeldBy("sandbox", bounty, bounty.proposal), "scope");
  const scoped = {
    version: 2,
    approval: { version: 2 },
    proposal: null,
    sandbox: null,
  };
  assert.equal(bountyStatus(scoped, now), "scoped");
  assert.equal(scopeApproved(scoped), true);
  assert.equal(stepHeldBy("sandbox", scoped, scoped.proposal), "price");
  assert.deepEqual([...BOUNTY_STEPS], ["scope", "price", "sandbox"]);
  assert.equal(BOUNTY_STEPS.indexOf("price") + 1, BOUNTY_STEPS.indexOf("sandbox"));
});
