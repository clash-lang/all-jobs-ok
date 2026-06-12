// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import { describe, expect, it } from "vitest";

import {
  InputError,
  parseExclude,
  resolveInputs,
  workflowPathFromRef,
} from "./inputs";

describe("workflowPathFromRef", () => {
  it("parses a branch ref", () => {
    expect(
      workflowPathFromRef(
        "octocat/hello-world/.github/workflows/ci.yml@refs/heads/main",
      ),
    ).toBe(".github/workflows/ci.yml");
  });

  it("parses a tag ref", () => {
    expect(
      workflowPathFromRef(
        "octocat/hello-world/.github/workflows/ci.yml@refs/tags/v1.0.0",
      ),
    ).toBe(".github/workflows/ci.yml");
  });

  it("splits at the first '@' so refs may contain '@'", () => {
    expect(
      workflowPathFromRef(
        "octocat/hello-world/.github/workflows/ci.yml@refs/heads/feat@2x",
      ),
    ).toBe(".github/workflows/ci.yml");
  });

  it("rejects refs without a path component", () => {
    expect(() =>
      workflowPathFromRef("octocat/hello-world@refs/heads/main"),
    ).toThrow(InputError);
  });
});

describe("parseExclude", () => {
  it("splits on newlines, trims, and drops blank lines", () => {
    expect(parseExclude("  notify-slack  \n\n other-job \n")).toEqual(
      new Set(["notify-slack", "other-job"]),
    );
  });

  it("returns an empty set for empty input", () => {
    expect(parseExclude("")).toEqual(new Set());
  });
});

describe("resolveInputs", () => {
  const env = {
    GITHUB_WORKFLOW_REF:
      "octocat/hello-world/.github/workflows/ci.yml@refs/heads/main",
    GITHUB_WORKSPACE: "/workspace",
  };

  it("derives the workflow file from GITHUB_WORKFLOW_REF", () => {
    const inputs = resolveInputs({ workflowFile: "", exclude: "" }, env);
    expect(inputs.workflowFile).toBe("/workspace/.github/workflows/ci.yml");
    expect(inputs.workflowFileRelative).toBe(".github/workflows/ci.yml");
  });

  it("lets an explicit workflow-file input override the env", () => {
    const inputs = resolveInputs(
      { workflowFile: ".github/workflows/other.yml", exclude: "" },
      env,
    );
    expect(inputs.workflowFile).toBe("/workspace/.github/workflows/other.yml");
  });

  it("errors when GITHUB_WORKFLOW_REF is missing and no input is given", () => {
    expect(() => resolveInputs({ workflowFile: "", exclude: "" }, {})).toThrow(
      InputError,
    );
  });
});
