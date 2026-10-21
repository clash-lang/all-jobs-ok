// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import { fmtSet } from "./lint";

const PASS_IT_VERBATIM =
  "pass the needs context verbatim: needs: ${{ toJSON(needs) }}";

/**
 * Results a needed job may have without failing the gate. Everything else
 * fails it: besides the documented 'failure' and 'cancelled', GitHub also
 * reports undocumented results such as 'abandoned', for a job that no runner
 * picked up.
 */
const OK_RESULTS: ReadonlySet<string> = new Set(["success", "skipped"]);

/**
 * Check the results of the needed jobs. This is stricter than the shell gate
 * this action replaces, which only catches 'failure':
 *
 *     if ${{ contains(needs.*.result, 'failure') }}; then exit 1; fi
 *     if ! ${{ contains(needs.*.result, 'success') }}; then exit 1; fi
 *
 * @param needsJson The `needs` context as JSON, i.e. `toJSON(needs)`.
 * @returns One error per problem; empty when every needed job succeeded or
 *   was skipped, and at least one succeeded.
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

  const notOk = [...results]
    .filter(([, result]) => !OK_RESULTS.has(result))
    .map(([jobId, result]) => `${jobId}: ${result}`);
  if (notOk.length > 0) {
    errors.push(`Needed jobs did not succeed: ${fmtSet(notOk)}`);
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
