// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import * as path from "node:path";

export interface ResolvedInputs {
  /** Absolute path to the workflow file to lint. */
  workflowFile: string;
  /** Path of the workflow file relative to the workspace, for annotations. */
  workflowFileRelative: string;
  /** Job ids that must not be in `all.needs`. */
  exclude: Set<string>;
}

/** An error in the action's configuration, reported without a stack trace. */
export class InputError extends Error {}

export function parseExclude(input: string): Set<string> {
  return new Set(
    input
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  );
}

/**
 * Extract the workflow file path from a GITHUB_WORKFLOW_REF value, e.g.
 * "octocat/hello-world/.github/workflows/ci.yml@refs/heads/main" yields
 * ".github/workflows/ci.yml". The ref may itself contain '@', so split at
 * the first one.
 */
export function workflowPathFromRef(workflowRef: string): string {
  const at = workflowRef.indexOf("@");
  const withoutRef = at === -1 ? workflowRef : workflowRef.slice(0, at);
  const parts = withoutRef.split("/");
  if (parts.length < 3 || parts.slice(2).some((p) => p === "")) {
    throw new InputError(
      `Could not derive a workflow path from GITHUB_WORKFLOW_REF: '${workflowRef}'`,
    );
  }
  return parts.slice(2).join("/");
}

export function resolveInputs(
  raw: { workflowFile: string; exclude: string },
  env: Record<string, string | undefined>,
): ResolvedInputs {
  let workflowFile = raw.workflowFile.trim();
  if (workflowFile === "") {
    const ref = env["GITHUB_WORKFLOW_REF"];
    if (ref === undefined || ref === "") {
      throw new InputError(
        "GITHUB_WORKFLOW_REF is not set, so the workflow file cannot be " +
          "derived automatically. Pass it explicitly via the " +
          "'workflow-file' input.",
      );
    }
    workflowFile = workflowPathFromRef(ref);
  }

  const workspace = env["GITHUB_WORKSPACE"] || process.cwd();
  const absolute = path.resolve(workspace, workflowFile);
  return {
    workflowFile: absolute,
    workflowFileRelative: path.relative(workspace, absolute),
    exclude: parseExclude(raw.exclude),
  };
}
