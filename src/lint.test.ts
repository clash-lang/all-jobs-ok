// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import { describe, expect, it } from "vitest";

import { lintWorkflow } from "./lint";

const NONE: ReadonlySet<string> = new Set();

function workflow(jobs: Record<string, string[] | null>): string {
  const lines = ["on: push", "jobs:"];
  for (const [job, needs] of Object.entries(jobs)) {
    lines.push(`  ${job}:`);
    lines.push("    runs-on: ubuntu-latest");
    if (needs !== null) {
      lines.push(`    needs: [${needs.join(", ")}]`);
    }
  }
  return lines.join("\n");
}

describe("completeness", () => {
  it("passes when needs exactly matches the other jobs", () => {
    const result = lintWorkflow(
      workflow({ a: null, b: null, c: null, all: ["a", "b", "c"] }),
      NONE,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports exactly the missing jobs", () => {
    const result = lintWorkflow(
      workflow({ a: null, b: null, c: null, all: ["a", "b"] }),
      NONE,
    );
    expect(result.errors).toEqual(["Not all jobs mentioned in all.needs: {c}"]);
  });
});

describe("soundness", () => {
  it("reports exactly the non-existing jobs", () => {
    const result = lintWorkflow(
      workflow({ a: null, all: ["a", "stale"] }),
      NONE,
    );
    expect(result.errors).toEqual([
      "Non-existing jobs found in all.needs: {stale}",
    ]);
  });

  it("reports 'all' depending on itself as non-existing", () => {
    const result = lintWorkflow(workflow({ a: null, all: ["a", "all"] }), NONE);
    expect(result.errors).toEqual([
      "Non-existing jobs found in all.needs: {all}",
    ]);
  });
});

describe("exclusion", () => {
  const exclude = new Set(["notify-slack"]);

  it("passes when the excluded job is absent from needs", () => {
    const result = lintWorkflow(
      workflow({ a: null, "notify-slack": null, all: ["a"] }),
      exclude,
    );
    expect(result.errors).toEqual([]);
  });

  it("errors when the excluded job is present in needs", () => {
    const result = lintWorkflow(
      workflow({ a: null, "notify-slack": null, all: ["a", "notify-slack"] }),
      exclude,
    );
    expect(result.errors).toEqual([
      "Excluded jobs found in all.needs: {notify-slack}",
    ]);
  });

  it("warns when an excluded job does not exist", () => {
    const result = lintWorkflow(workflow({ a: null, all: ["a"] }), exclude);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "Excluded jobs do not exist in the workflow: {notify-slack}",
    ]);
  });
});

describe("aggregation", () => {
  it("reports all violations in one run", () => {
    const exclude = new Set(["post"]);
    const result = lintWorkflow(
      workflow({ a: null, b: null, post: null, all: ["a", "post", "stale"] }),
      exclude,
    );
    expect(result.errors).toEqual([
      "Not all jobs mentioned in all.needs: {b}",
      "Excluded jobs found in all.needs: {post}",
      "Non-existing jobs found in all.needs: {stale}",
    ]);
  });
});

describe("normalization", () => {
  it("treats a scalar needs as a singleton list", () => {
    const source = [
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "  all:",
      "    needs: build",
    ].join("\n");
    expect(lintWorkflow(source, NONE).errors).toEqual([]);
  });

  it("warns on duplicate needs entries but still passes", () => {
    const result = lintWorkflow(
      workflow({ a: null, b: null, all: ["a", "b", "a"] }),
      NONE,
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(["Duplicate entries in all.needs: {a}"]);
  });
});

describe("robustness", () => {
  it("errors when the 'all' job is missing", () => {
    const result = lintWorkflow(workflow({ a: null, b: null }), NONE);
    expect(result.errors).toEqual(["Job 'all' not found in workflow file"]);
  });

  it("errors when 'all' has no needs", () => {
    const result = lintWorkflow(workflow({ a: null, all: null }), NONE);
    expect(result.errors).toEqual(["Job 'all' has no 'needs' list"]);
  });

  it("errors when there is no jobs key", () => {
    expect(lintWorkflow("on: push", NONE).errors).toEqual([
      "No 'jobs' found in workflow file",
    ]);
  });

  it("errors on an empty file", () => {
    expect(lintWorkflow("", NONE).errors).toEqual([
      "No 'jobs' found in workflow file",
    ]);
  });

  it("errors on invalid YAML without throwing", () => {
    const result = lintWorkflow("jobs:\n  a: [\n", NONE);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^Could not parse workflow file as YAML/);
  });

  it("errors when needs is a mapping", () => {
    const source = ["jobs:", "  all:", "    needs:", "      a: b"].join("\n");
    expect(lintWorkflow(source, NONE).errors).toEqual([
      "'all.needs' is neither a string nor a list",
    ]);
  });
});

describe("non-interference", () => {
  it("handles on-triggers, matrix jobs and reusable-workflow jobs", () => {
    const source = [
      "on:",
      "  push:",
      "    branches: [main]",
      "jobs:",
      "  matrix-job:",
      "    runs-on: ubuntu-latest",
      "    strategy:",
      "      matrix:",
      "        ghc: ['9.4', '9.6']",
      "  reusable:",
      "    uses: octo-org/repo/.github/workflows/x.yml@v1",
      "  all:",
      "    needs: [matrix-job, reusable]",
    ].join("\n");
    expect(lintWorkflow(source, NONE).errors).toEqual([]);
  });
});

describe("generative round-trip", () => {
  const jobNames = Array.from({ length: 8 }, (_, i) => `job-${i}`);

  it("a consistent generated workflow passes", () => {
    const jobs = Object.fromEntries(jobNames.map((j) => [j, null]));
    expect(
      lintWorkflow(workflow({ ...jobs, all: jobNames }), NONE).errors,
    ).toEqual([]);
  });

  it.each(jobNames)("dropping %s from needs names exactly it", (dropped) => {
    const jobs = Object.fromEntries(jobNames.map((j) => [j, null]));
    const needs = jobNames.filter((j) => j !== dropped);
    expect(
      lintWorkflow(workflow({ ...jobs, all: needs }), NONE).errors,
    ).toEqual([`Not all jobs mentioned in all.needs: {${dropped}}`]);
  });

  it("adding a bogus need names exactly it", () => {
    const jobs = Object.fromEntries(jobNames.map((j) => [j, null]));
    const needs = [...jobNames, "bogus"];
    expect(
      lintWorkflow(workflow({ ...jobs, all: needs }), NONE).errors,
    ).toEqual(["Non-existing jobs found in all.needs: {bogus}"]);
  });
});
