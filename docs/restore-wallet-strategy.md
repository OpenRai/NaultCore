# Restore Wallet Strategy

Status: design reference for `NaultCore-u0c` recovery import work.

This document defines stable identifiers for Restore Wallet detection paths. Use
these identifiers in issues, tests, reviews, and user-interface discussions.

## User-facing rule

Restore Wallet identifies compatible recovery interpretations before asking the
user to choose one. It probes every compatible interpretation without creating,
replacing, or persisting a wallet.

The result view shows each interpretation's spendable balance and receivable
amount separately. It preselects the interpretation with the greatest combined
amount. The user can select another completed interpretation before continuing.

For a tie, preselect the canonical Nano secret recovery seed interpretation.

## Detection paths

```text
0.0 Enter recovery material
|
+- 1.1 Unrecognized or malformed material
|  `- Mark the material invalid. Do not probe accounts.
|
+- 1.2 64-character hexadecimal string
|  |
|  +- 1.2.1 Nano secret recovery seed
|  |  +- Derive accounts 0 through 9.
|  |  +- Probe each account for spendable balance, receivables, and history.
|  |  `- Report one aggregate for 10 checked accounts.
|  |
|  `- 1.2.2 Nano private key
|     +- Derive exactly one account and address.
|     +- Probe that account for spendable balance, receivables, and history.
|     `- Report one aggregate for one checked account.
|
+- 1.3 128-character expanded private key
|  `- 1.3.1 Expanded private key
|     +- Derive exactly one account and address.
|     +- Probe that account for spendable balance, receivables, and history.
|     `- Report one aggregate for one checked account.
|
`- 1.4 Valid BIP-39 mnemonic
   |
   +- 1.4.1 Nano mnemonic interpreted as a Nano secret recovery seed
   |  +- Derive accounts 0 through 9.
   |  `- Probe and aggregate the same evidence as 1.2.1.
   |
   `- 1.4.2 BIP-39 mnemonic with optional BIP-39 passphrase
      +- Derive accounts 0 through 9 from the BIP-39-derived seed.
      `- Probe and aggregate the same evidence as 1.2.1.
```

## Result-view contract

The result view MUST start all compatible probes automatically. Show a separate
spinner for each incomplete interpretation. Do not show the interpretation
radio group until all compatible probes complete.

Each completed interpretation MUST report:

- Number of checked accounts.
- Spendable balance, meaning funds already pocketed into account chains.
- Receivable amount, meaning funds in confirmed send blocks that are not yet
  pocketed by receive blocks.
- Count of accounts with balance, receivables, or history evidence.
- Combined amount used only to choose the initial radio selection.

The view MUST preselect the interpretation with the largest combined amount.
If two or more totals match, it MUST prefer the canonical Nano secret recovery
seed interpretation. The radio group remains available for an explicit user
override after probing completes.

## Safety boundary

Detection and probing are read-only. Recovery material and optional BIP-39
passphrases remain in memory only. The wallet is persisted only after the user
selects an interpretation and completes the later password step.

## Verification

Add a non-E2E test for every recognized or rejected material shape introduced
during this review. Test the path identifier, account-derivation range,
aggregate calculation, automatic default selection, tie behavior, and
passphrase clearing when material leaves path 1.4.
