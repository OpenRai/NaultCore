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
- Without a valid query account, Send and Receive use the selected account.
- With neither a query account nor a selected account, flows use the first
  wallet account as a deterministic fallback; an empty wallet has no account
  context.
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
