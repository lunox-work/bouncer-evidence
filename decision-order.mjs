#!/usr/bin/env node
// Does `confirm`'s order (bin/decisions.mjs `byMissRate`) put the drafted
// decisions a person changes ahead of the ones they keep? On the 295
// hand-labelled drafted decisions (evidence/default-match.json), no model:
// the keyword rule's agreement with the hand kind, and, within each of the 18
// drafts, the share of changed decisions in the first half of the list in
// spec order against `confirm`'s order. Writes evidence/decision-order.json.
//
//   node evidence/decision-order.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { byMissRate, kindOf } from "../bin/decisions.mjs";

const ROOT = join(import.meta.dirname, "..");
const { items } = JSON.parse(readFileSync(join(ROOT, "evidence", "default-match.json"), "utf8"));
const decided = items.filter((item) => item.match === "yes" || item.match === "no");
const agree = decided.filter((item) => kindOf(item.drafted).kind === item.kind).length;
const drafts = [...new Set(decided.map((item) => `${item.source}/${item.pair}`))];
let changed = 0;
let firstHalfSpec = 0;
let firstHalfOrdered = 0;
let firstQuarterSpec = 0;
let firstQuarterOrdered = 0;
const perDraft = drafts.map((draft) => {
  const list = decided.filter((item) => `${item.source}/${item.pair}` === draft).sort((a, b) => a.n - b.n).map((item) => ({ ...item, text: item.drafted }));
  const ordered = byMissRate(list).map(({ item }) => item);
  const misses = (rows, share) => rows.slice(0, Math.ceil(rows.length * share)).filter((item) => item.match === "no").length;
  const total = list.filter((item) => item.match === "no").length;
  changed += total;
  firstHalfSpec += misses(list, 0.5);
  firstHalfOrdered += misses(ordered, 0.5);
  firstQuarterSpec += misses(list, 0.25);
  firstQuarterOrdered += misses(ordered, 0.25);
  return { draft, decisions: list.length, changed: total, firstHalf: { spec: misses(list, 0.5), ordered: misses(ordered, 0.5) } };
});
const out = {
  at: new Date().toISOString(),
  about: "bin/decisions.mjs byMissRate on evidence/default-match.json's drafted decisions that were kept or changed (243), no model",
  kindAgreement: { agree, of: decided.length },
  changed,
  inFirstHalf: { specOrder: firstHalfSpec, missRateOrder: firstHalfOrdered },
  inFirstQuarter: { specOrder: firstQuarterSpec, missRateOrder: firstQuarterOrdered },
  perDraft,
};
writeFileSync(join(ROOT, "evidence", "decision-order.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, perDraft: undefined }, null, 2));
