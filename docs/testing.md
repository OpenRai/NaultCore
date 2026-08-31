# Testing

## Commands

```bash
# Vitest unit tests (NaultCore profile)
source ~/.nvm/nvm.sh && nvm exec pnpm run test:vitest

# Vitest unit tests (NanoNym profile)
source ~/.nvm/nvm.sh && nvm exec pnpm run test:vitest:nanonyms

# Temporary Karma parity gate (Brave on macOS)
source ~/.nvm/nvm.sh && CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test

# Playwright E2E (all tests)
source ~/.nvm/nvm.sh && nvm exec pnpm run e2e:pw

# Playwright E2E (roundtrip only, sequential)
source ~/.nvm/nvm.sh && nvm exec pnpm run e2e:pw -- --grep 'roundtrip' --workers=1
```

The Vitest migration inventory and Karma retirement gate are documented in
[Unit Test Runner Migration](unit-test-migration.md). Karma remains in CI until
the three-consecutive-run gate passes.

## Environment

- `.env.test` (gitignored) — contains `NANO_TEST_SEED` (64-char hex)
- `.env.test.example` — template, committed
- CI: uses GitHub Actions secret `NANO_TEST_SEED` via `${{ secrets.NANO_TEST_SEED }}`

## Stealth Account Fund Safety Principle

**CRITICAL: Any test that creates or credits stealth accounts MUST sweep remaining
funds back to nano_ account #0 before the test ends.**

Rationale:
- Stealth funds without Tier 2 event storage (Arweave/Ceramic) are fragile
- Nostr notifications are ephemeral — once lost, stealth funds may be unrecoverable
- We must not leave XNO stranded in stealth accounts between test runs

Implementation:
- Each nanonym E2E test calls `sweepStealthToAccount0(page)` at the end
- The sweep function sends the MAX balance from every stealth account back to account #0
- If the sweep itself fails, the test should FAIL (not silently continue)

## pnpm-driven tasks on macOS

Use the nvm wrapper as per AGENTS.md. For Karma unit tests, set `CHROME_BIN` to Brave:
```bash
source ~/.nvm/nvm.sh && CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test
```
