import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuery,
  matchesTerm
} from "../src/core/skill-resolver.js";

test("single-word terms only match whole words", () => {
  const q = buildQuery("reach the goal before go-live");

  assert.equal(matchesTerm(q, "goal"), true);
  assert.equal(matchesTerm(q, "go"), true);
  assert.equal(matchesTerm(q, "goa"), false);

  const q2 = buildQuery("use django with reactivity");

  assert.equal(matchesTerm(q2, "go"), false);
  assert.equal(matchesTerm(q2, "react"), false);
});

test("light plural fold", () => {
  const q = buildQuery("add regression tests for the worker");

  assert.equal(matchesTerm(q, "test"), true);
  assert.equal(matchesTerm(q, "regression"), true);
});

test("hyphenated and path terms need a word boundary", () => {
  assert.equal(
    matchesTerm(
      buildQuery("run systematic-debugging now"),
      "systematic-debugging"
    ),
    true
  );

  assert.equal(
    matchesTerm(
      buildQuery("presystematic-debugging notes"),
      "systematic-debugging"
    ),
    false
  );

  assert.equal(
    matchesTerm(
      buildQuery("apply global/tdd here"),
      "global/tdd"
    ),
    true
  );
});
