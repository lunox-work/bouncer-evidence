import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOUNTY_STEPS,
  bountyStatus,
  scopeApproved,
  stepHeldBy,
  stepHeldReason,
} from "../src/stages.js";

type Bounty = {
  readonly version: number;
  readonly approval: { readonly version: number } | null;
};
type Proposal = { readonly status: string } | null;
type Held = "scope" | "price" | null;

const PRICE_SENTENCE = "Approve the scope before changing the price.";
const SANDBOX_BY_SCOPE =
  "Approve the scope and the price before changing the sandbox.";
const SANDBOX_BY_PRICE = "Approve the price before changing the sandbox.";

function checkRows(
  step: "price" | "sandbox",
  rows: readonly (readonly [Bounty, Proposal, Held])[],
): void {
  for (const [bounty, proposal, expected] of rows) {
    assert.equal(
      stepHeldBy(step, bounty, proposal),
      expected,
      `stepHeldBy(${JSON.stringify(step)}, ${JSON.stringify(bounty)}, ${JSON.stringify(proposal)})`,
    );
  }
}

// --- @happy 1: the price is held by the scope until its current version is approved

test("[happy-1] the price is held by the scope until the scope's current version is approved", () => {
  checkRows("price", [
    [{ version: 2, approval: null }, null, "scope"],
    [{ version: 2, approval: { version: 2 } }, null, null],
    [{ version: 2, approval: { version: 2 } }, { status: "proposed" }, null],
    [{ version: 2, approval: { version: 2 } }, { status: "approved" }, null],
  ]);
});

test("[happy-1] an approved scope releases the price as null, never undefined, whatever the proposal says", () => {
  const bounty = { version: 2, approval: { version: 2 } };
  for (const proposal of [
    null,
    { status: "Approved" },
    { status: "" },
    { status: "published" },
  ]) {
    const held = stepHeldBy("price", bounty, proposal);
    assert.notEqual(held, undefined);
    assert.equal(held, null, JSON.stringify(proposal));
  }
});

// --- @boundary 1: the price step ignores the proposal argument entirely

test("[boundary-1] the price step ignores the proposal while the scope is unapproved", () => {
  const bounty = { version: 3, approval: null };
  checkRows("price", [
    [bounty, null, "scope"],
    [bounty, { status: "proposed" }, "scope"],
    [bounty, { status: "approved" }, "scope"],
  ]);
});

test("[boundary-1] an approved proposal does not release the price over a stale scope approval", () => {
  checkRows("price", [
    [{ version: 3, approval: { version: 2 } }, { status: "approved" }, "scope"],
    [{ version: 3, approval: { version: 2 } }, { status: "" }, "scope"],
  ]);
});

// --- @boundary 2: a missing proposal never holds the price step

test("[boundary-2] a missing proposal never holds the price step", () => {
  assert.equal(
    stepHeldBy("price", { version: 1, approval: { version: 1 } }, null),
    null,
  );
});

test("[boundary-2] a missing proposal does not hold the price at scope version 0 approved at 0", () => {
  assert.equal(
    stepHeldBy("price", { version: 0, approval: { version: 0 } }, null),
    null,
  );
});

// --- @unhappy 1: an approval of any other version leaves the scope unapproved

test("[unhappy-1] an approval of any other version leaves the scope unapproved", () => {
  checkRows("price", [
    [{ version: 3, approval: { version: 2 } }, null, "scope"],
    [{ version: 2, approval: { version: 3 } }, null, "scope"],
    [{ version: 1, approval: { version: 1 } }, null, null],
    [{ version: 0, approval: { version: 0 } }, null, null],
  ]);
});

test("[unhappy-1] a stale scope approval holds the sandbox by the scope even with an approved price", () => {
  checkRows("sandbox", [
    [{ version: 3, approval: { version: 2 } }, { status: "approved" }, "scope"],
    [{ version: 2, approval: { version: 3 } }, { status: "approved" }, "scope"],
  ]);
});

// --- @happy 2: the sandbox is held by the earliest step that is not approved

test("[happy-2] the sandbox is held by the earliest step that is not approved", () => {
  checkRows("sandbox", [
    [{ version: 2, approval: null }, null, "scope"],
    [{ version: 2, approval: null }, { status: "proposed" }, "scope"],
    [{ version: 2, approval: null }, { status: "approved" }, "scope"],
    [{ version: 2, approval: { version: 1 } }, { status: "approved" }, "scope"],
    [{ version: 2, approval: { version: 2 } }, null, "price"],
    [{ version: 2, approval: { version: 2 } }, { status: "proposed" }, "price"],
    [{ version: 2, approval: { version: 2 } }, { status: "approved" }, null],
  ]);
});

test("[happy-2] with both scope and price unapproved the scope is reported, and a released sandbox is null", () => {
  checkRows("sandbox", [
    [{ version: 0, approval: null }, { status: "Approved" }, "scope"],
    [{ version: 5, approval: { version: 4 } }, null, "scope"],
  ]);
  const released = stepHeldBy(
    "sandbox",
    { version: 0, approval: { version: 0 } },
    { status: "approved" },
  );
  assert.notEqual(released, undefined);
  assert.equal(released, null);
});

// --- @unhappy 2: only the exact status "approved" counts as an approved price

test('[unhappy-2] only the exact status "approved" counts as an approved price', () => {
  const bounty = { version: 4, approval: { version: 4 } };
  checkRows("sandbox", [
    [bounty, { status: "approved" }, null],
    [bounty, { status: "Approved" }, "price"],
    [bounty, { status: " approved" }, "price"],
    [bounty, { status: "published" }, "price"],
    [bounty, { status: "" }, "price"],
  ]);
});

test("[unhappy-2] trailing whitespace or upper case in the status leaves the price unapproved", () => {
  const bounty = { version: 4, approval: { version: 4 } };
  checkRows("sandbox", [
    [bounty, { status: "approved " }, "price"],
    [bounty, { status: "APPROVED" }, "price"],
    [bounty, { status: "approved\n" }, "price"],
  ]);
});

// --- @boundary 3: the proposal is read only from the third argument

test("[boundary-3] the proposal is read only from the third argument", () => {
  const bounty = {
    version: 1,
    approval: { version: 1 },
    proposal: { status: "approved" },
  };
  assert.equal(stepHeldBy("sandbox", bounty, null), "price");
});

test("[boundary-3] a proposal field on the bounty neither holds nor releases the sandbox", () => {
  const unapprovedOnBounty = {
    version: 1,
    approval: { version: 1 },
    proposal: { status: "proposed" },
  };
  assert.equal(
    stepHeldBy("sandbox", unapprovedOnBounty, { status: "approved" }),
    null,
  );
  const approvedOnBounty = {
    version: 1,
    approval: { version: 1 },
    proposal: { status: "approved" },
  };
  assert.equal(
    stepHeldBy("sandbox", approvedOnBounty, { status: "proposed" }),
    "price",
  );
});

// --- @boundary 4: the result depends only on the earlier steps

test("[boundary-4] the result depends only on the earlier steps, never on the step's own state", () => {
  const bounty = { version: 5, approval: { version: 5 } };
  const proposal = { status: "proposed" };
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "price");
  assert.equal(stepHeldBy("price", bounty, proposal), null);
});

test("[boundary-4] a published sandbox on the bounty does not release the sandbox hold", () => {
  const bounty = {
    version: 5,
    approval: { version: 5 },
    sandbox: { status: "published", expiresAt: null },
  };
  assert.equal(stepHeldBy("sandbox", bounty, { status: "proposed" }), "price");
  assert.equal(stepHeldBy("sandbox", bounty, null), "price");
});

// --- @boundary 5: calls keep no state between them

test("[boundary-5] calls keep no state between them and change no argument", () => {
  const a = { version: 1, approval: null };
  const b = { version: 1, approval: { version: 1 } };
  const proposal = { status: "approved" };
  assert.equal(stepHeldBy("sandbox", a, null), "scope");
  assert.equal(stepHeldBy("sandbox", b, proposal), null);
  assert.equal(stepHeldBy("sandbox", a, null), "scope");
  assert.deepEqual(a, { version: 1, approval: null });
  assert.deepEqual(b, { version: 1, approval: { version: 1 } });
  assert.deepEqual(proposal, { status: "approved" });
});

test("[boundary-5] frozen arguments are accepted and repeated interleaved calls give the same results", () => {
  const a = Object.freeze({ version: 1, approval: null });
  const b = Object.freeze({
    version: 1,
    approval: Object.freeze({ version: 1 }),
  });
  const proposal = Object.freeze({ status: "approved" });
  for (let round = 0; round < 3; round++) {
    assert.equal(stepHeldBy("price", b, proposal), null);
    assert.equal(stepHeldBy("sandbox", a, proposal), "scope");
    assert.equal(stepHeldBy("price", a, null), "scope");
    assert.equal(stepHeldBy("sandbox", b, proposal), null);
    assert.equal(stepHeldBy("sandbox", b, null), "price");
  }
});

// --- @happy 3: the sentence for each hold

test("[happy-3] the sentence for each hold", () => {
  assert.equal(stepHeldReason("price", "scope"), PRICE_SENTENCE);
  assert.equal(stepHeldReason("sandbox", "scope"), SANDBOX_BY_SCOPE);
  assert.equal(stepHeldReason("sandbox", "price"), SANDBOX_BY_PRICE);
});

test("[happy-3] the sentences have no surrounding whitespace and the sandbox's vary by holder", () => {
  const sentences = [
    stepHeldReason("price", "scope"),
    stepHeldReason("sandbox", "scope"),
    stepHeldReason("sandbox", "price"),
  ];
  for (const sentence of sentences) {
    assert.equal(sentence, sentence.trim());
  }
  assert.equal(new Set(sentences).size, 3);
  // The same pair gives the same sentence every time.
  assert.equal(stepHeldReason("sandbox", "price"), sentences[2]);
});

// --- @unhappy 3: the price step held by "price" still gives the scope sentence

test('[unhappy-3] the price step held by "price" still gives the scope sentence', () => {
  assert.equal(stepHeldReason("price", "price"), PRICE_SENTENCE);
});

test('[unhappy-3] stepHeldReason("price", "price") does not throw and matches the price step\'s scope sentence', () => {
  let sentence: string | undefined;
  assert.doesNotThrow(() => {
    sentence = stepHeldReason("price", "price");
  });
  assert.equal(sentence, stepHeldReason("price", "scope"));
});

// --- @happy 4: the two functions compose into the words shown to the user

test("[happy-4] the two functions compose into the words shown to the user", () => {
  const bounty = { version: 2, approval: { version: 2 } };
  const proposal = { status: "proposed" };
  const heldBy = stepHeldBy("sandbox", bounty, proposal);
  assert.equal(heldBy, "price");
  assert.ok(heldBy !== null);
  assert.equal(stepHeldReason("sandbox", heldBy), SANDBOX_BY_PRICE);
});

test("[happy-4] an unapproved scope composes into the scope sentence for each step", () => {
  const bounty = { version: 2, approval: null };
  const proposal = { status: "approved" };
  const sandboxHeldBy = stepHeldBy("sandbox", bounty, proposal);
  assert.equal(sandboxHeldBy, "scope");
  assert.ok(sandboxHeldBy !== null);
  assert.equal(stepHeldReason("sandbox", sandboxHeldBy), SANDBOX_BY_SCOPE);
  const priceHeldBy = stepHeldBy("price", bounty, proposal);
  assert.equal(priceHeldBy, "scope");
  assert.ok(priceHeldBy !== null);
  assert.equal(stepHeldReason("price", priceHeldBy), PRICE_SENTENCE);
});

// --- @happy 5: scopeApproved and bountyStatus are unchanged

test("[happy-5] scopeApproved and bountyStatus are unchanged", () => {
  assert.equal(scopeApproved({ version: 3, approval: { version: 2 } }), false);
  assert.equal(scopeApproved({ version: 2, approval: { version: 2 } }), true);
  assert.equal(
    bountyStatus(
      {
        version: 2,
        approval: null,
        proposal: { status: "approved" },
        sandbox: null,
      },
      new Date("2026-10-10T00:00:00Z"),
    ),
    "priced",
  );
  assert.deepEqual([...BOUNTY_STEPS], ["scope", "price", "sandbox"]);
});

test("[happy-5] a missing approval and a stale one still read as unapproved and new", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  assert.equal(scopeApproved({ version: 2, approval: null }), false);
  assert.equal(scopeApproved({ version: 2, approval: { version: 3 } }), false);
  assert.equal(
    bountyStatus(
      { version: 2, approval: { version: 1 }, proposal: null, sandbox: null },
      now,
    ),
    "new",
  );
  assert.equal(
    bountyStatus(
      {
        version: 2,
        approval: { version: 2 },
        proposal: { status: "proposed" },
        sandbox: null,
      },
      now,
    ),
    "scoped",
  );
});
