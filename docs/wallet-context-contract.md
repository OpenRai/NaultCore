# Wallet navigation and account-context contract

`WalletService` is the only owner of the current regular-wallet account. Its
replayed `walletState$` snapshot is the authority consumed by UI components.
`WalletContextService` is a stateless adapter: it validates route account
parameters, delegates selection to `WalletService`, and describes navigation
targets. It must not introduce another selected-account subject or persist a
transaction form's temporary source as wallet selection.

## Context rules

- No selected account means the wallet aggregate context.
- A selected account is valid only when its ID is present in
  `walletState.accounts`.
- A valid `?account=<id>` parameter is an explicit transaction context.
- Global Send and Receive actions show an account chooser when multiple accounts
  exist. They do not inherit sidebar selection or choose the first funded account.
- A global action may select the sole account when exactly one exists.
- An invalid explicit account opens the chooser with an explanation, even when
  there is only one other account. An empty wallet has no transaction context.
- Draft account changes never modify shared wallet selection. Preparation retains
  recipient and amount; review requires a fresh preparation after changes.
- Invalid account parameters never clear a valid selected account.
- Persisted selection is restored only when that account still exists.
- Removing the selected account selects the remaining lowest derivation index,
  or the aggregate context when no accounts remain.
- Locking and unlocking do not change account selection. They only change the
  lifecycle and signing capability exposed by the wallet snapshot.

## Route rules

| Route | Meaning | Account behavior |
| --- | --- | --- |
| `/wallet` | Wallet account-context workspace | No transaction account is implied by the route itself. |
| `/accounts` | Account management workspace | Selecting an account updates the shared WalletService authority. |
| `/send` | Send transaction flow | Optional `?account=<id>` names the source explicitly. |
| `/receive` | Receive transaction flow | Optional `?account=<id>` names the destination explicitly. |
| `/qr-scan` | Global QR utility | Dispatch must pass an explicit account context to the resulting flow. |

The existing `/send` and `/receive` paths remain valid for bookmarks and
browser history. The `account` query parameter is the compatibility bridge
until all entry points use the Wallet workspace directly.

The full interaction and research rationale is in
[the transaction navigation brief](transaction-navigation-design-brief.md).
