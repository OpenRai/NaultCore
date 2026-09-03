# Unit Test Architecture

NaultCore runs Angular unit tests with Vitest. The test targets keep the
NaultCore and NanoNym feature profiles separate, while Playwright covers
browser-level workflows.

## Inventory contract

The `include` arrays in `angular.json` are the active-unit-test inventory.
`pnpm run verify:test-inventory` verifies that every spec file containing an
active `it(...)` or `test(...)` declaration belongs to one of those targets.
Skipped or archived placeholders are intentionally excluded.

Audit the active inventory with an anchored declaration search so skipped tests
are not counted as active:

```bash
for file in $(rg --files src -g '*.spec.ts'); do
  rg -q '^\s*(it|test)\s*\(' "$file" && printf '%s\n' "$file"
done
```

## Local validation

Run the complete unit-test path with one command:

```bash
source ~/.nvm/nvm.sh
nvm exec pnpm test
```

This runs the NaultCore Vitest target, the NanoNym-enabled Vitest target, and
the inventory guard. Run Playwright separately for browser-level validation as
documented in [Testing](testing.md).

## Retirement record

The legacy browser harness and its assertion framework were removed after the
active inventory was represented by Vitest and both feature profiles had local
unit and browser-level validation. New tests should use Vitest APIs such as
`vi.fn`, `vi.spyOn`, fake timers, and `expect.objectContaining`.
