// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import * as YAML from "yaml";

/** The job that must depend on every other job in the workflow. */
export const ALL_JOB = "all";

export interface LintResult {
  errors: string[];
  warnings: string[];
}

function fmtSet(items: Iterable<string>): string {
  return `{${[...items].sort().join(", ")}}`;
}

/**
 * Check that the `all` job's `needs:` lists exactly every other job in the
 * workflow, except for excluded jobs (which must not be listed at all).
 */
export function lintWorkflow(
  source: string,
  exclude: ReadonlySet<string>,
): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let doc: unknown;
  try {
    doc = YAML.parse(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      errors: [`Could not parse workflow file as YAML: ${message}`],
      warnings,
    };
  }

  const jobs =
    typeof doc === "object" && doc !== null
      ? (doc as Record<string, unknown>)["jobs"]
      : undefined;
  if (typeof jobs !== "object" || jobs === null) {
    return { errors: ["No 'jobs' found in workflow file"], warnings };
  }

  const jobIds = Object.keys(jobs);
  const missingExcludes = [...exclude].filter((j) => !jobIds.includes(j));
  if (missingExcludes.length > 0) {
    warnings.push(
      `Excluded jobs do not exist in the workflow: ${fmtSet(missingExcludes)}`,
    );
  }

  if (!jobIds.includes(ALL_JOB)) {
    errors.push(`Job '${ALL_JOB}' not found in workflow file`);
    return { errors, warnings };
  }

  const allJob = (jobs as Record<string, unknown>)[ALL_JOB];
  const needsRaw =
    typeof allJob === "object" && allJob !== null
      ? (allJob as Record<string, unknown>)["needs"]
      : undefined;
  if (needsRaw === undefined || needsRaw === null) {
    errors.push(`Job '${ALL_JOB}' has no 'needs' list`);
    return { errors, warnings };
  }

  let needsList: string[];
  if (typeof needsRaw === "string") {
    needsList = [needsRaw];
  } else if (Array.isArray(needsRaw)) {
    needsList = needsRaw.map(String);
  } else {
    errors.push(`'${ALL_JOB}.needs' is neither a string nor a list`);
    return { errors, warnings };
  }

  const duplicates = needsList.filter(
    (job, index) => needsList.indexOf(job) !== index,
  );
  if (duplicates.length > 0) {
    warnings.push(
      `Duplicate entries in ${ALL_JOB}.needs: ${fmtSet(new Set(duplicates))}`,
    );
  }

  const allJobs = new Set(
    jobIds.filter((j) => j !== ALL_JOB && !exclude.has(j)),
  );
  const allNeeds = new Set(needsList);

  const missing = [...allJobs].filter((j) => !allNeeds.has(j));
  if (missing.length > 0) {
    errors.push(
      `Not all jobs mentioned in ${ALL_JOB}.needs: ${fmtSet(missing)}`,
    );
  }

  const excludedInNeeds = [...allNeeds].filter((j) => exclude.has(j));
  if (excludedInNeeds.length > 0) {
    errors.push(
      `Excluded jobs found in ${ALL_JOB}.needs: ${fmtSet(excludedInNeeds)}`,
    );
  }

  const unknown = [...allNeeds].filter(
    (j) => !allJobs.has(j) && !exclude.has(j),
  );
  if (unknown.length > 0) {
    errors.push(
      `Non-existing jobs found in ${ALL_JOB}.needs: ${fmtSet(unknown)}`,
    );
  }

  return { errors, warnings };
}
