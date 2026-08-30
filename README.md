# NaultCore

NaultCore modernizes the original [Nault](https://github.com/Nault/Nault) Nano wallet. It preserves Nault-compatible wallet behavior and the Nano protocol boundary.

It is for people who want a maintained web wallet for Nano. Contributors can improve the Nault codebase without changing normal wallet storage, block signing, or seed recovery.

## What NaultCore includes

- Standard Nano wallet workflows: create or import a wallet, manage accounts, send, receive, and recover from a seed.
- Browser and desktop build targets from the Nault codebase.
- Angular 22 modernization of the web app, with aligned build, test, and browser-automation tooling.
- Node 22 and pnpm tooling for ongoing maintenance.

## NanoNyms

NaultCore keeps a NanoNyms integration behind a disabled feature flag. NaultCore does not enable it for normal development, builds, or E2E tests.

The NanoNym design and protocol are documented elsewhere. Do not enable or remove this integration unless a task explicitly targets it.

## Develop

NaultCore uses Node 22 and pnpm. On macOS, run pnpm through nvm.

```bash
source ~/.nvm/nvm.sh
nvm exec pnpm install
FEATURE_NANONYMS=false nvm exec pnpm exec ng serve --configuration naultcore-dev
```

Open `http://localhost:4200/`.

## Test

Karma unit tests require Brave on macOS:

```bash
source ~/.nvm/nvm.sh
CHROME_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" nvm exec pnpm test
```

See [AGENTS.md](AGENTS.md) for repository rules and the canonical commands.

## Contributing

Keep changes compatible with Nault wallet behavior. In particular, wallet recovery must remain deterministic: the same seed and account index must always derive the same keys.

Use the repository pnpm and test conventions. Do not commit or publish changes unless the task explicitly authorizes it.
