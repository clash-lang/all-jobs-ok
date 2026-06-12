// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import { describe, expect, it } from "vitest";

import { checkNeedsResults } from "./results";

function needs(results: Record<string, string>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(results).map(([jobId, result]) => [
        jobId,
        { result, outputs: {} },
      ]),
    ),
  );
}

describe("checkNeedsResults", () => {
  it("passes when all needed jobs succeeded", () => {
    expect(
      checkNeedsResults(needs({ build: "success", test: "success" })),
    ).toEqual([]);
  });

  it("passes when some jobs were skipped but one succeeded", () => {
    expect(
      checkNeedsResults(needs({ build: "success", docs: "skipped" })),
    ).toEqual([]);
  });

  it("fails when a needed job failed", () => {
    expect(
      checkNeedsResults(needs({ build: "failure", test: "success" })),
    ).toEqual(["Needed jobs failed: {build}"]);
  });

  it("lists every failed job", () => {
    expect(
      checkNeedsResults(
        needs({ test: "failure", build: "failure", docs: "success" }),
      ),
    ).toEqual(["Needed jobs failed: {build, test}"]);
  });

  it("fails when no needed job succeeded", () => {
    expect(checkNeedsResults(needs({ build: "skipped" }))).toEqual([
      "No needed job succeeded (build: skipped)",
    ]);
  });

  it("reports both problems when a job failed and none succeeded", () => {
    expect(
      checkNeedsResults(needs({ build: "failure", docs: "skipped" })),
    ).toEqual([
      "Needed jobs failed: {build}",
      "No needed job succeeded (build: failure, docs: skipped)",
    ]);
  });

  it("fails on an empty needs context", () => {
    expect(checkNeedsResults("{}")).toEqual([
      "No needed job succeeded (the needs context is empty)",
    ]);
  });

  it("treats a malformed entry as an unknown result", () => {
    expect(
      checkNeedsResults(JSON.stringify({ build: null, test: {} })),
    ).toEqual(["No needed job succeeded (build: unknown, test: unknown)"]);
  });

  it("rejects input that is not valid JSON", () => {
    const errors = checkNeedsResults("${{ toJSON(needs) }}");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Could not parse the 'needs' input as JSON");
    expect(errors[0]).toContain("needs: ${{ toJSON(needs) }}");
  });

  it("rejects JSON that is not an object", () => {
    const errors = checkNeedsResults('["success"]');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("The 'needs' input is not a JSON object");
  });
});
