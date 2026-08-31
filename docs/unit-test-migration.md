# Unit Test Runner Migration

This repository is migrating Angular unit tests from Karma/Jasmine to Vitest.
The migration keeps the NaultCore and NanoNym feature profiles separate while
the two runners provide a temporary parity gate.

## Current inventory

At commit `4dc8fca`:

- `src/**/*.spec.ts` contains 68 spec files.
- 28 files contain active `it(...)` or `test(...)` declarations.
- Every active spec file is included by one of the Vitest targets in
  `angular.json`.
- The remaining 40 files contain no active test declarations. They are
  placeholder, `xit(...)`-only, or integration-only files and are not part of
  the Vitest targets.

The `include` arrays in `angular.json` are the migration inventory. Use an
anchored declaration search when auditing coverage; a loose `it(` search also
matches skipped `xit(...)` tests.

```bash
for file in $(rg --files src -g '*.spec.ts'); do
  rg -q '^\s*(it|test)\s*\(' "$file" && printf '%s\n' "$file"
done
```

## Local runners

Run both feature profiles through Vitest:

```bash
source ~/.nvm/nvm.sh
nvm exec pnpm run test:vitest
nvm exec pnpm run test:vitest:nanonyms
nvm exec pnpm run verify:test-inventory
```

`verify:test-inventory` fails if an `it(...)` or `test(...)` declaration appears
outside the configured Vitest targets or if a configured target file is missing.
CI runs this guard before the temporary Karma parity suite.

Karma remains enabled as a temporary parity runner. On macOS, run it with
Brave:

```bash
source ~/.nvm/nvm.sh
CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  nvm exec pnpm test
```

The GitHub Actions unit job runs both Vitest targets and Karma. Playwright is
the browser-level gate and runs after that unit job.

## Retirement gate

Do not remove Karma until all of these conditions hold:

1. The active-spec inventory remains fully represented by the Vitest targets.
2. Both Vitest profiles pass locally and in CI with meaningful assertions.
3. The unit job passes on three consecutive current `main` or pull-request
   runs.
4. The Playwright job passes on the same current head.

After the gate passes, remove the Karma packages, Angular Karma target,
`karma.conf.js`, and obsolete Karma scripts and workflow references in one
reviewable change. Keep the Vitest targets and Playwright workflow as the
replacement validation paths.
