// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

// Tests the built bundle through the actions-runner contract: inputs arrive
// as INPUT_* environment variables, errors leave as '::error' workflow
// commands on stdout, and the exit code decides the step outcome.

import { execSync, spawnSync } from "node:child_process";
import * as path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const root = process.cwd();
const bundle = path.join(root, "dist", "index.js");
const fixtures = path.join(root, "src", "__fixtures__");

interface RunOptions {
  workflowFile?: string;
  exclude?: string;
  workflowRef?: string;
  needs?: string;
}

function runAction(opts: RunOptions) {
  const env: Record<string, string> = {
    PATH: process.env["PATH"] ?? "",
    GITHUB_WORKSPACE: fixtures,
  };
  if (opts.workflowFile !== undefined) {
    env["INPUT_WORKFLOW-FILE"] = opts.workflowFile;
  }
  if (opts.exclude !== undefined) {
    env["INPUT_EXCLUDE"] = opts.exclude;
  }
  if (opts.needs !== undefined) {
    env["INPUT_NEEDS"] = opts.needs;
  }
  if (opts.workflowRef !== undefined) {
    env["GITHUB_WORKFLOW_REF"] = opts.workflowRef;
  }
  return spawnSync("node", [bundle], { encoding: "utf8", env });
}

beforeAll(() => {
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}, 60_000);

describe("runner contract", () => {
  it("exits 0 on a consistent workflow", () => {
    const result = runAction({
      workflowFile: "ok.yml",
      exclude: "notify-slack",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK: 'all' in ok.yml");
  });

  it("exits non-zero on a broken workflow, with a file annotation", () => {
    const result = runAction({ workflowFile: "broken.yml" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error file=broken.yml");
    expect(result.stdout).toContain(
      "Not all jobs mentioned in all.needs: {test}",
    );
  });

  it("hints at actions/checkout when the workflow file is missing", () => {
    const result = runAction({ workflowFile: "does-not-exist.yml" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("did you run actions/checkout first");
  });

  it("derives the workflow file from GITHUB_WORKFLOW_REF", () => {
    const result = runAction({
      exclude: "notify-slack",
      workflowRef: "octocat/hello-world/ok.yml@refs/heads/main",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK: 'all' in ok.yml");
  });

  it("errors when neither GITHUB_WORKFLOW_REF nor workflow-file is set", () => {
    const result = runAction({});
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("GITHUB_WORKFLOW_REF is not set");
  });

  it("exits 0 when all needed jobs succeeded", () => {
    const result = runAction({
      workflowFile: "ok.yml",
      exclude: "notify-slack",
      needs: JSON.stringify({
        build: { result: "success", outputs: {} },
        test: { result: "success", outputs: {} },
      }),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "OK: no needed job failed and at least one succeeded",
    );
  });

  it("exits non-zero when a needed job failed", () => {
    const result = runAction({
      workflowFile: "ok.yml",
      exclude: "notify-slack",
      needs: JSON.stringify({
        build: { result: "failure", outputs: {} },
        test: { result: "success", outputs: {} },
      }),
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Needed jobs failed: {build}");
  });

  it("exits non-zero when no needed job succeeded", () => {
    const result = runAction({
      workflowFile: "ok.yml",
      exclude: "notify-slack",
      needs: JSON.stringify({
        build: { result: "skipped", outputs: {} },
        test: { result: "skipped", outputs: {} },
      }),
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("No needed job succeeded");
  });

  it("exits non-zero when the needs input is not valid JSON", () => {
    const result = runAction({
      workflowFile: "ok.yml",
      exclude: "notify-slack",
      needs: "not json",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "Could not parse the 'needs' input as JSON",
    );
  });

  it("accepts bittide-hardware's real ci.yml (regression)", () => {
    const result = runAction({
      workflowFile: "bittide-ci.yml",
      exclude: "notify-slack",
    });
    expect(result.status).toBe(0);
  });
});
