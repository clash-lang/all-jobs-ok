// SPDX-FileCopyrightText: 2026 QBayLogic B.V.
//
// SPDX-License-Identifier: BSD-2-Clause

import { existsSync, readFileSync } from "node:fs";

import * as core from "@actions/core";

import { InputError, resolveInputs } from "./inputs";
import { ALL_JOB, lintWorkflow } from "./lint";

export function run(): void {
  try {
    const inputs = resolveInputs(
      {
        workflowFile: core.getInput("workflow-file"),
        exclude: core.getInput("exclude"),
      },
      process.env,
    );

    if (!existsSync(inputs.workflowFile)) {
      core.setFailed(
        `Workflow file not found: ${inputs.workflowFile} — did you run ` +
          "actions/checkout first, or do you need to pass the " +
          "'workflow-file' input?",
      );
      return;
    }

    const source = readFileSync(inputs.workflowFile, "utf8");
    const result = lintWorkflow(source, inputs.exclude);

    const file = inputs.workflowFileRelative;
    for (const warning of result.warnings) {
      core.warning(warning, { file });
    }
    for (const error of result.errors) {
      core.error(error, { file });
    }

    if (result.errors.length > 0) {
      core.setFailed(
        `Found ${result.errors.length} problem(s) with the '${ALL_JOB}' ` +
          `job in ${file}`,
      );
    } else {
      core.info(`OK: '${ALL_JOB}' in ${file} depends on all other jobs`);
    }
  } catch (err) {
    if (err instanceof InputError) {
      core.setFailed(err.message);
    } else {
      core.setFailed(err instanceof Error ? err : String(err));
    }
  }
}

run();
