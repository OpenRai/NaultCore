# Testing

## Commands

```bash
# Karma unit tests
source ~/.nvm/nvm.sh && CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test

# Playwright E2E (all tests)
nvm exec pnpm run e2e:pw

# Playwright E2E (roundtrip only, sequential)
nvm exec pnpm run e2e:pw -- --grep 'roundtrip' --workers=1
```

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
