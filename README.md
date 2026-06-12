# all-jobs-ok

Check that a job called `all` depends on every other job in the workflow, so
branch protection only needs a single required status check.

## Why

GitHub branch protection wants an explicit list of required status checks.
Keeping that list in sync with your CI jobs is tedious, so a common pattern is
a single gate job that `needs:` everything:

```yaml
all:
  name: All jobs finished
  if: ${{ !cancelled() }}
  needs: [build, lint, test]
  runs-on: ubuntu-slim
  steps:
    - run: |
        if ${{ contains(needs.*.result, 'failure') }}; then exit 1; fi
        if ! ${{ contains(needs.*.result, 'success') }}; then exit 1; fi
```

Branch protection then only requires `all`. But now the `needs:` list is the
thing that silently rots: add a job, forget to list it, and the new job no
longer gates merges. This action fails CI when that happens.

## Usage

Add an 'all' job in the workflow, after checking out the repository:

```yaml
all:
  name: All jobs finished
  if: ${{ !cancelled() }}
  needs: [your-job-1, your-job-2]
  runs-on: ubuntu-slim
  steps:
    - uses: actions/checkout@v6
    - uses: clash-lang/all-jobs-ok@v2
      with:
        needs: ${{ toJSON(needs) }}
```

The action checks that the workflow it runs in has a job called `all` whose
`needs:` lists exactly every other job. Given the `needs` input, it also
performs the result check from the shell snippet above, so no extra `run:`
step is needed: the action fails when any needed job failed, or when none
succeeded (e.g. all were skipped). It fails with one error per problem:

- `Not all jobs mentioned in all.needs: {...}` — jobs missing from the gate
- `Non-existing jobs found in all.needs: {...}` — stale entries
- `Excluded jobs found in all.needs: {...}` — excluded jobs that are listed
  anyway
- `Needed jobs failed: {...}` — a job the gate depends on failed
- `No needed job succeeded (...)` — nothing failed, but nothing succeeded
  either

Errors are annotated on the workflow file in pull requests.

## Inputs

| Input           | Default                         | Description                                                                                                                      |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-file` | the workflow of the current run | Path to the workflow file to check, relative to the repository root.                                                             |
| `exclude`       | _empty_                         | Newline-separated job ids that must **not** be in `all.needs`, e.g. jobs that run after `all` to react to its result.            |
| `needs`         | _empty_                         | The `needs` context, passed verbatim as `${{ toJSON(needs) }}`. When set, the action also checks the results of the needed jobs. |

Example with all of them:

```yaml
- uses: clash-lang/all-jobs-ok@v2
  with:
    workflow-file: .github/workflows/ci.yml
    exclude: |
      notify-slack
    needs: ${{ toJSON(needs) }}
```

## Notes

- The gate job must be called `all`. This is deliberate: a convention, not a
  configuration knob.
- Without the `needs` input, this action only checks the `needs:` list, and
  the `all` job itself must still fail when a dependency fails — see the
  `contains(needs.*.result, ...)` pattern above. With the `needs` input, the
  action does that check itself. Either way, give the job
  `if: ${{ !cancelled() }}` so it also runs when a dependency failed.
- `dist/index.js` is a bundle of our BSD-2-Clause code together with the npm
  packages [`@actions/core`](https://github.com/actions/toolkit) (MIT) and
  [`yaml`](https://github.com/eemeli/yaml) (ISC).

## Developing

A [Nix](https://nixos.org/) flake provides the development environment:

```bash
nix develop
npm ci
npm test
npm run build   # refresh dist/index.js (committed; CI checks it is current)
```

## Acknowledgements

This action grew out of the `all_check.py` script in
[bittide-hardware](https://github.com/bittide/bittide-hardware), originally
written for Google LLC.

## License

[BSD-2-Clause](LICENSES/BSD-2-Clause.txt). This repository is
[REUSE](https://reuse.software/) compliant.
