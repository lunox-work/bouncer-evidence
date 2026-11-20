import assert from "node:assert/strict";
import { test } from "node:test";

import { scopeApproved, stepHeldBy } from "../../src/stages.js";

type Bounty = {
  readonly version: number;
  readonly approval: { readonly version: number } | null;
};
type Proposal = { readonly status: string } | null;
type Held = "scope" | "price" | null;

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

const PROPOSALS: readonly Proposal[] = [
  null,
  { status: "proposed" },
  { status: "approved" },
  { status: "Approved" },
  { status: "" },
  { status: "published" },
];

// Extends "[happy-1] the price is held by the scope until the scope's current
// version is approved": other versions, and every proposal on each side.
test("[happy-1] the price is held by the scope at other versions and released at each version once approved", () => {
  for (const version of [0, 1, 7, 42, 1000]) {
    for (const proposal of PROPOSALS) {
      checkRows("price", [
        [{ version, approval: null }, proposal, "scope"],
        [{ version, approval: { version } }, proposal, null],
      ]);
    }
  }
});

// Extends "[happy-1] an approved scope releases the price as null": a shortcut
// that releases the price on any non-null approval gets these wrong.
test("[happy-1] the price is released only when the approval is at the scope's current version", () => {
  checkRows("price", [
    [{ version: 2, approval: { version: 1 } }, { status: "approved" }, "scope"],
    [{ version: 2, approval: { version: 2 } }, { status: "approved" }, null],
    [{ version: 9, approval: { version: 8 } }, { status: "proposed" }, "scope"],
    [{ version: 9, approval: { version: 9 } }, { status: "proposed" }, null],
  ]);
});

// Extends "[boundary-1] the price step ignores the proposal while the scope is
// unapproved": other versions and other statuses, all still held by the scope.
test("[boundary-1] the price step ignores every proposal at other unapproved versions", () => {
  for (const bounty of [
    { version: 0, approval: null },
    { version: 1, approval: null },
    { version: 12, approval: null },
    { version: 5, approval: { version: 4 } },
    { version: 4, approval: { version: 5 } },
  ]) {
    for (const proposal of PROPOSALS) {
      assert.equal(
        stepHeldBy("price", bounty, proposal),
        "scope",
        `${JSON.stringify(bounty)} ${JSON.stringify(proposal)}`,
      );
    }
  }
});

// Extends "[boundary-1] the price step ignores the proposal while the scope is
// unapproved": with the scope approved, no proposal makes the price held
// (never "price", which would mean reading the proposal for the price step).
test("[boundary-1] no proposal status makes the price step held by the price", () => {
  const bounty = { version: 3, approval: { version: 3 } };
  for (const status of [
    "proposed",
    "approved",
    "draft",
    "rejected",
    "unapproved",
    "APPROVED",
    "",
  ]) {
    assert.equal(stepHeldBy("price", bounty, { status }), null, status);
  }
});

// Extends "[boundary-2] a missing proposal never holds the price step": other
// approved versions.
test("[boundary-2] a missing proposal never holds the price step at any approved version", () => {
  for (const version of [2, 3, 10, 999, Number.MAX_SAFE_INTEGER]) {
    const held = stepHeldBy("price", { version, approval: { version } }, null);
    assert.notEqual(held, undefined);
    assert.equal(held, null, String(version));
  }
});

// Extends "[unhappy-1] an approval of any other version leaves the scope
// unapproved": more mismatches, in both directions, near and far, including 0.
test("[unhappy-1] approvals one above, one below or far from the version leave the price held by the scope", () => {
  checkRows("price", [
    [{ version: 1, approval: { version: 0 } }, null, "scope"],
    [{ version: 0, approval: { version: 1 } }, null, "scope"],
    [{ version: 10, approval: { version: 9 } }, null, "scope"],
    [{ version: 9, approval: { version: 10 } }, null, "scope"],
    [{ version: 100, approval: { version: 1 } }, null, "scope"],
    [{ version: 1, approval: { version: 100 } }, null, "scope"],
    [{ version: 100, approval: { version: 100 } }, null, null],
    [{ version: 7, approval: { version: 7 } }, null, null],
  ]);
});

// Extends "[unhappy-1] a stale scope approval holds the sandbox by the scope
// even with an approved price": other versions, and every proposal.
test("[unhappy-1] a stale scope approval holds the sandbox by the scope whatever the proposal", () => {
  for (const bounty of [
    { version: 1, approval: { version: 0 } },
    { version: 0, approval: { version: 1 } },
    { version: 8, approval: { version: 7 } },
    { version: 7, approval: { version: 8 } },
  ]) {
    for (const proposal of PROPOSALS) {
      assert.equal(
        stepHeldBy("sandbox", bounty, proposal),
        "scope",
        `${JSON.stringify(bounty)} ${JSON.stringify(proposal)}`,
      );
    }
  }
});

// Extends "[happy-2] the sandbox is held by the earliest step that is not
// approved": the full table at other versions.
test("[happy-2] the sandbox's holder follows the table at other versions", () => {
  for (const version of [0, 1, 3, 50]) {
    checkRows("sandbox", [
      [{ version, approval: null }, null, "scope"],
      [{ version, approval: null }, { status: "proposed" }, "scope"],
      [{ version, approval: null }, { status: "approved" }, "scope"],
      [{ version, approval: { version: version + 1 } }, { status: "approved" }, "scope"],
      [{ version, approval: { version } }, null, "price"],
      [{ version, approval: { version } }, { status: "proposed" }, "price"],
      [{ version, approval: { version } }, { status: "approved" }, null],
    ]);
  }
});

// Extends "[happy-2] with both scope and price unapproved the scope is
// reported": a shortcut that checks the price first reports "price" here.
test("[happy-2] with both unapproved the scope is reported, whatever makes the price unapproved", () => {
  for (const bounty of [
    { version: 2, approval: null },
    { version: 2, approval: { version: 1 } },
    { version: 2, approval: { version: 3 } },
  ]) {
    for (const proposal of [
      null,
      { status: "proposed" },
      { status: "Approved" },
      { status: "" },
      { status: "published" },
    ]) {
      assert.equal(
        stepHeldBy("sandbox", bounty, proposal),
        "scope",
        `${JSON.stringify(bounty)} ${JSON.stringify(proposal)}`,
      );
    }
  }
});

// Extends "[happy-2] the sandbox is held by the earliest step that is not
// approved": an approved price is not checked against the current scope
// version, so other fields on the proposal do not hold the sandbox.
test("[happy-2] an approved price releases the sandbox whatever else the proposal carries", () => {
  const bounty = { version: 6, approval: { version: 6 } };
  const sizedFromOlderScope = { status: "approved", scopeVersion: 2, version: 1 };
  assert.equal(stepHeldBy("sandbox", bounty, sizedFromOlderScope), null);
  const unknownScope = { status: "approved", scopeVersion: null };
  assert.equal(stepHeldBy("sandbox", bounty, unknownScope), null);
  const proposedButFlagged = { status: "proposed", approved: true };
  assert.equal(stepHeldBy("sandbox", bounty, proposedButFlagged), "price");
});

// Extends "[happy-2]": a missing proposal holds only the sandbox, never the
// price, with "price" as the holder.
test("[happy-2] a missing proposal holds the sandbox by the price at each approved version", () => {
  for (const version of [0, 1, 5, 321]) {
    const bounty = { version, approval: { version } };
    assert.equal(stepHeldBy("sandbox", bounty, null), "price");
    assert.equal(stepHeldBy("price", bounty, null), null);
  }
});

// Extends "[unhappy-2] only the exact status "approved" counts": statuses that
// contain, start with or end with "approved", or differ only in case or
// spacing, are caught by includes/startsWith/endsWith/lowercase/trim shortcuts.
test('[unhappy-2] statuses that merely contain "approved" leave the price unapproved', () => {
  const bounty = { version: 4, approval: { version: 4 } };
  for (const status of [
    "unapproved",
    "disapproved",
    "approvedx",
    "approved!",
    "not approved",
    "approved approved",
    "aPproved",
    "\tapproved",
    "approve",
    "approve d",
    "APPROVED ",
    "proposed",
    "rejected",
    "null",
    "true",
  ]) {
    assert.equal(
      stepHeldBy("sandbox", bounty, { status }),
      "price",
      JSON.stringify(status),
    );
  }
  assert.equal(stepHeldBy("sandbox", bounty, { status: "approved" }), null);
});

// Extends "[unhappy-2] trailing whitespace or upper case in the status": the
// same exact-match rule at another scope version.
test('[unhappy-2] the exact status "approved" releases the sandbox at other versions and near-misses do not', () => {
  for (const version of [0, 1, 17]) {
    const bounty = { version, approval: { version } };
    checkRows("sandbox", [
      [bounty, { status: "approved" }, null],
      [bounty, { status: "Approved" }, "price"],
      [bounty, { status: "approved " }, "price"],
      [bounty, { status: "unapproved" }, "price"],
    ]);
  }
});

// Extends "[boundary-3] the proposal is read only from the third argument": a
// fallback to bounty.proposal, at other versions and with a null third argument.
test("[boundary-3] an approved proposal on the bounty never releases the sandbox from a null third argument", () => {
  for (const version of [0, 2, 9]) {
    const bounty = {
      version,
      approval: { version },
      proposal: { status: "approved" },
      status: "priced",
    };
    assert.equal(stepHeldBy("sandbox", bounty, null), "price", String(version));
  }
});

// Extends "[boundary-3] a proposal field on the bounty neither holds nor
// releases the sandbox": an approved bounty.proposal with a near-miss third
// argument, and a null bounty.proposal with an approved third argument.
test("[boundary-3] the third argument decides the sandbox whatever the bounty's own proposal field says", () => {
  const withApproved = {
    version: 3,
    approval: { version: 3 },
    proposal: { status: "approved" },
  };
  assert.equal(stepHeldBy("sandbox", withApproved, { status: "Approved" }), "price");
  assert.equal(stepHeldBy("sandbox", withApproved, { status: "" }), "price");
  const withNull = { version: 3, approval: { version: 3 }, proposal: null };
  assert.equal(stepHeldBy("sandbox", withNull, { status: "approved" }), null);
});

// Extends "[boundary-4] the result depends only on the earlier steps": other
// versions and the step's own state carried on the bounty in other forms.
test("[boundary-4] the price step's result ignores its own proposal state at other versions", () => {
  for (const version of [1, 4, 30]) {
    const bounty = { version, approval: { version } };
    for (const status of ["proposed", "approved", "draft"]) {
      assert.equal(stepHeldBy("price", bounty, { status }), null);
    }
  }
});

// Extends "[boundary-4] a published sandbox on the bounty does not release the
// sandbox hold": the sandbox's own state never adds a hold either.
test("[boundary-4] the sandbox's own state neither releases nor adds a hold", () => {
  const sandboxes = [
    null,
    { status: "draft" },
    { status: "published", expiresAt: null },
    { status: "published", expiresAt: "2000-01-01T00:00:00Z" },
    { status: "unpublished" },
  ];
  for (const sandbox of sandboxes) {
    const approved = { version: 5, approval: { version: 5 }, sandbox };
    assert.equal(stepHeldBy("sandbox", approved, { status: "approved" }), null);
    assert.equal(stepHeldBy("sandbox", approved, { status: "proposed" }), "price");
    const unscoped = { version: 5, approval: null, sandbox };
    assert.equal(stepHeldBy("sandbox", unscoped, { status: "approved" }), "scope");
  }
});

// Extends "[boundary-5] calls keep no state between them and change no
// argument": the same objects changed between calls must give the new result,
// so no result is cached per bounty or per proposal.
test("[boundary-5] the same objects changed between calls give the result for their state now", () => {
  const bounty: { version: number; approval: { version: number } | null } = {
    version: 1,
    approval: null,
  };
  const proposal = { status: "proposed" };
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "scope");
  assert.equal(stepHeldBy("price", bounty, proposal), "scope");
  bounty.approval = { version: 1 };
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "price");
  assert.equal(stepHeldBy("price", bounty, proposal), null);
  proposal.status = "approved";
  assert.equal(stepHeldBy("sandbox", bounty, proposal), null);
  bounty.version = 2;
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "scope");
  assert.equal(stepHeldBy("price", bounty, proposal), "scope");
  bounty.approval = { version: 2 };
  assert.equal(stepHeldBy("sandbox", bounty, proposal), null);
  proposal.status = "proposed";
  assert.equal(stepHeldBy("sandbox", bounty, proposal), "price");
});

// Extends "[boundary-5] frozen arguments are accepted and repeated interleaved
// calls give the same results": many calls in reverse order, then forward, and
// deep-frozen arguments left exactly as they were.
test("[boundary-5] many interleaved calls in either order give the same results and leave deep-frozen arguments unchanged", () => {
  const cases: readonly (readonly ["price" | "sandbox", Bounty, Proposal, Held])[] = [
    ["sandbox", Object.freeze({ version: 1, approval: null }), null, "scope"],
    [
      "sandbox",
      Object.freeze({ version: 1, approval: Object.freeze({ version: 1 }) }),
      Object.freeze({ status: "approved" }),
      null,
    ],
    [
      "sandbox",
      Object.freeze({ version: 2, approval: Object.freeze({ version: 2 }) }),
      Object.freeze({ status: "proposed" }),
      "price",
    ],
    [
      "price",
      Object.freeze({ version: 3, approval: Object.freeze({ version: 2 }) }),
      Object.freeze({ status: "approved" }),
      "scope",
    ],
    [
      "price",
      Object.freeze({ version: 3, approval: Object.freeze({ version: 3 }) }),
      null,
      null,
    ],
  ];
  const snapshot = JSON.stringify(cases);
  for (let round = 0; round < 20; round++) {
    const order = round % 2 === 0 ? cases : [...cases].reverse();
    for (const [step, bounty, proposal, expected] of order) {
      assert.equal(stepHeldBy(step, bounty, proposal), expected);
    }
  }
  assert.equal(JSON.stringify(cases), snapshot);
});

// Extends "[boundary-5]": a call that releases the sandbox does not carry over
// to a later call with an unapproved bounty, in the opposite order from the
// public test (released first, then held).
test("[boundary-5] a released call first does not release a later held one", () => {
  const b = { version: 1, approval: { version: 1 } };
  const a = { version: 1, approval: null };
  const proposal = { status: "approved" };
  assert.equal(stepHeldBy("sandbox", b, proposal), null);
  assert.equal(stepHeldBy("sandbox", a, proposal), "scope");
  assert.equal(stepHeldBy("sandbox", b, null), "price");
  assert.equal(stepHeldBy("sandbox", b, proposal), null);
  assert.deepEqual(a, { version: 1, approval: null });
  assert.deepEqual(b, { version: 1, approval: { version: 1 } });
  assert.deepEqual(proposal, { status: "approved" });
});

// Extends "[happy-5] scopeApproved and bountyStatus are unchanged": the price
// is held by the scope exactly when scopeApproved is false, over many bounties.
test("[happy-5] scopeApproved still decides the scope, and the price is held by the scope exactly when it is false", () => {
  const bounties: readonly Bounty[] = [
    { version: 0, approval: null },
    { version: 0, approval: { version: 0 } },
    { version: 1, approval: { version: 0 } },
    { version: 2, approval: { version: 2 } },
    { version: 3, approval: { version: 2 } },
    { version: 2, approval: { version: 3 } },
    { version: 11, approval: { version: 11 } },
  ];
  const expectedApproved = [false, true, false, true, false, false, true];
  bounties.forEach((bounty, i) => {
    assert.equal(scopeApproved(bounty), expectedApproved[i]);
    assert.equal(
      stepHeldBy("price", bounty, null),
      expectedApproved[i] ? null : "scope",
      JSON.stringify(bounty),
    );
  });
});
