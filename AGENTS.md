# NaultCore Agent Instructions

**Target agent:** Claude Code, Gemini, any AI assistant  
**Project:** NaultCore, a direct fork of Nault
**Constraint:** Preserve Nault-compatible wallet behavior and the Nano protocol boundary

## Project Identity (CRITICAL)

- NaultCore originated from NanoNymNault, but it is not focused on NanoNyms.
- Treat NaultCore as a more or less direct fork of Nault itself.
- NanoNyms may remain as a disabled feature-flagged integration for future use; do not remove the feature merely because it is not part of the current product direction.
- Do not display or test NanoNymNault branding when running the NaultCore configuration.
- Default development, builds, and E2E tests to the NaultCore configuration with NanoNym features disabled unless a task explicitly targets the NanoNym integration.

---

## Prime Directives

## Read First: Critical Preflight

Before running commands, check this block first.

- **Karma unit tests require Brave on macOS** via `CHROME_BIN`.
- **Canonical unit test command:**
  ```bash
  source ~/.nvm/nvm.sh && CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test
  ```
- **All pnpm commands on macOS must run via** `source ~/.nvm/nvm.sh && nvm exec pnpm ...`
- If command examples in docs disagree, follow this AGENTS.md preflight block.

### 1. Critical Invariant (NEVER BREAK)

The core path must always work:

```
Send to NanoNym → Receive via Nostr → Stealth funds spendable and recoverable from seed alone
```

This workflow must remain correct, test-covered, and never broken by any changes.

### 2. Determinism Requirement

**Key derivation MUST be deterministic:**
- Same seed + same index → identical keys (always)
- Test with both hex seeds (64-char hex) and BIP-39 mnemonics
- Any deviation breaks recovery

### 3. Build Environment

- **Package manager:** pnpm (declared in `package.json` `"packageManager"` field)
- **Node version:** v22 (via nvm - see .nvmrc)
- **Python version:** 3.11 (for native module compilation)
- **Install:**
  ```bash
  nvm exec pnpm install
  ```
- **Workspace packages** (`@nanonyms/*`): always use `pnpm --filter` commands, never npm

### 4. pnpm Usage (STRICT RULE - NO EXCEPTIONS)

**NEVER use `npm` or `npx` for ANYTHING in this repo.**
**ALWAYS** use `nvm exec pnpm [args]` for all commands.

This includes: installing deps, running scripts, publishing, executing workspace commands, adding/removing packages, running tests, linting, building, etc. If you're thinking "should I run this with npm?", the answer is NO — use pnpm.

Root-level scripts use pnpm internally. Do not invoke npm/npx directly.

**Examples of CORRECT pnpm usage:**
```bash
# Install dependencies
nvm exec pnpm install

# Run workspace scripts
nvm exec pnpm run build:packages
nvm exec pnpm run test:packages

# Run pnpm directly with filters
nvm exec pnpm --recursive --filter @nanonyms/* build
nvm exec pnpm --filter @nanonyms/core test
nvm exec pnpm --recursive --filter @nanonyms/* publish
```

**Workspace publishing** (`@nanonyms/*` packages): Use the dedicated scripts in root `package.json` which call pnpm internally:
```bash
nvm exec pnpm run publish:packages
```

Alternatively use pnpm directly with custom flags:
```bash
nvm exec pnpm --recursive --filter @nanonyms/* publish -- --access public --tag stable
```

### 5. macOS pnpm Invocation Constraint

- On macOS, ALL pnpm interactions for all tasks (build, test, serve, e2e) MUST be executed via `nvm exec pnpm ...`. Enforce this in all automation scripts and in manual commands.
- CI workflows use pnpm and the root `pnpm-lock.yaml`.

### 6. Commit Message Format

- **Subject line:** WHAT you intend to change and WHY it matters (the purpose/problem)
- **NOT:** Which files were modified
- **Focus:** The intent and value of the code change
- **Example:**
  ```
  Fix stealth account opening race condition
  
  The immediate opening phase was failing when wallet was locked,
  causing notifications to be lost. Add pending queue with unlock
  subscriber to ensure all notifications are processed.
  ```

---

## Documentation

The code, tests, and this file are the current NaultCore source of truth. Historical NanoNym design material is maintained outside this checkout and in Git history.

---

## Quick Reference

- **Test suite (macOS):** `source ~/.nvm/nvm.sh && CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test`
- **Dev server:** `source ~/.nvm/nvm.sh && FEATURE_NANONYMS=false nvm exec pnpm exec ng serve --configuration naultcore` → http://localhost:4200/
- **E2E test IDs:** `docs/E2E-TEST-IDS.md`

---

## Shared Ecosystem: nano-rspow Release Process

When releasing a new version of the **`nano-rspow`** library/bindings:

1. **Bump Version Numbers**:
   - Bump version in root `Cargo.toml` (`[workspace.package] version = "X.Y.Z"`).
   - Bump version in `nano-rspow-node/package.json` (`"version": "X.Y.Z"`).
   - Python bindings dynamically read version from `Cargo.toml`.
2. **Synchronize Lockfile**:
   - Run `cargo check` to automatically rebuild the lockfile with the new versions.
3. **Commit and Tag**:
   - Commit version changes: `git commit -m "chore(release): bump version to X.Y.Z"`
   - **CRITICAL**: Create and push the Git tag explicitly! `git push --follow-tags` does NOT push lightweight tags properly.
     ```bash
     git tag vX.Y.Z
     git push origin vX.Y.Z
     ```
4. **Triggered Workflows**:
   - **Node.js Bindings** (`node-publish.yml`): Compiles matrix bindings (macOS x86/arm, Windows, Linux) and publishes to NPM with `--provenance`.
   - **Python Wheels** (`python-publish.yml`): Compiles wheels via `maturin` matrix (macOS x86/arm, Windows, Linux) + sdist, then publishes to PyPI via trusted publishing.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
