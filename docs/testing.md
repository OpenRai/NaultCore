# Testing

## Commands

```bash
# Unit tests (both NaultCore and NanoNym profiles, plus inventory verification)
source ~/.nvm/nvm.sh && nvm exec pnpm test

# Playwright E2E (all tests)
source ~/.nvm/nvm.sh && nvm exec pnpm run e2e:pw

# Playwright E2E (roundtrip only, sequential)
source ~/.nvm/nvm.sh && nvm exec pnpm run e2e:pw -- --grep 'roundtrip' --workers=1
```

The unit-test inventory contract is documented in
[Unit Test Runner Migration](unit-test-migration.md). Playwright remains the
browser-level gate in CI.

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

Use the nvm wrapper as per AGENTS.md:
```bash
source ~/.nvm/nvm.sh && nvm exec pnpm test
```
