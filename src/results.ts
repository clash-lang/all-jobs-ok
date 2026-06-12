// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import { fmtSet } from "./lint";

const PASS_IT_VERBATIM =
  "pass the needs context verbatim: needs: ${{ toJSON(needs) }}";

/**
 * Check the results of the needed jobs, mirroring the shell gate this action
 * replaces:
 *
 *     if ${{ contains(needs.*.result, 'failure') }}; then exit 1; fi
 *     if ! ${{ contains(needs.*.result, 'success') }}; then exit 1; fi
 *
 * @param needsJson The `needs` context as JSON, i.e. `toJSON(needs)`.
 * @returns One error per problem; empty when no needed job failed and at
 *   least one succeeded.
 */
export function checkNeedsResults(needsJson: string): string[] {
  let needs: unknown;
  try {
    needs = JSON.parse(needsJson);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      `Could not parse the 'needs' input as JSON: ${message} — ` +
        PASS_IT_VERBATIM,
    ];
  }
  if (typeof needs !== "object" || needs === null || Array.isArray(needs)) {
    return [`The 'needs' input is not a JSON object — ${PASS_IT_VERBATIM}`];
  }

  const results = new Map<string, string>();
  for (const [jobId, job] of Object.entries(needs)) {
    const result =
      typeof job === "object" && job !== null
        ? (job as Record<string, unknown>)["result"]
        : undefined;
    results.set(jobId, typeof result === "string" ? result : "unknown");
  }

  const errors: string[] = [];

  const failed = [...results]
    .filter(([, result]) => result === "failure")
    .map(([jobId]) => jobId);
  if (failed.length > 0) {
    errors.push(`Needed jobs failed: ${fmtSet(failed)}`);
  }

  const anySuccess = [...results.values()].some((r) => r === "success");
  if (!anySuccess) {
    const summary =
      [...results]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([jobId, result]) => `${jobId}: ${result}`)
        .join(", ") || "the needs context is empty";
    errors.push(`No needed job succeeded (${summary})`);
  }

  return errors;
}
