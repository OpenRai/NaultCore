# NanoNymNault Agent Instructions

**Target agent:** Claude Code, Gemini, any AI assistant  
**Project:** Privacy-preserving Nano wallet using stealth addresses + Nostr notifications  
**Constraint:** No changes to Nano protocol (pure wallet/off-chain coordination)

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

## Documentation Map

All architectural decisions, protocol details, and implementation notes are in separate files:

- **[docs/project-context.md](docs/project-context.md)** - WHY: Architectural decisions, privacy model, design rationale
- **[docs/protocol-specification.md](docs/protocol-specification.md)** - WHAT: Address format, workflows, account model
- **[docs/implementation-notes.md](docs/implementation-notes.md)** - HOW: Cryptography, key derivation, technical details
- **[docs/coding-standards.md](docs/coding-standards.md)** - HOW: TypeScript patterns, testing conventions
- **[docs/roadmap.md](docs/roadmap.md)** - STATUS: Implementation status and next steps
- **[docs/testing.md](docs/testing.md)** - Testing strategy and instructions

---

## Quick Reference

- **Live preview:** https://cbrunnkvist.github.io/NanoNymNault/
- **Test suite (macOS):** `source ~/.nvm/nvm.sh && CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test`
- **Dev server:** `nvm exec pnpm start` → http://localhost:4200/
- **See docs/README.md for full documentation index**

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
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

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
