# Send and Receive: account-first transaction navigation

Research date: 9 November 2026. Audience: NaultCore product designers,
implementers and reviewers. This brief records evidence and the resulting
interaction contract. Beads tracks implementation status.

## Decision

Keep `/send` and `/receive` as dedicated pages. Expose both actions on the
wallet dashboard and on every owned account's header, at every viewport size.
Global actions ask which account to use. Account actions supply that account.
Use the same rich account identity throughout selection, preparation and review.

Do not add Send and Receive back to the sidebar. The sidebar describes places;
the actions start a transaction with a visible scope. The distinction does not
require a modal: a routed page can be an action's destination.

## What other products do

These findings come from official help material and published screenshots.
They describe documented paths, not a statistical usability study. Mobile apps,
desktop apps and browser extensions are separate implementations; their presence
does not prove that one responsive web layout behaves identically.

| Product | Entry and scope | Preparation and review | Relevance to Nano |
| --- | --- | --- | --- |
| Trezor Suite | Dashboard Send opens account selection; an account's Send action carries its context. Mobile also selects a source before preparing a payment. Receive selects an account before showing an address. | Named accounts and balances appear in the picker; the selected source remains visible in the composer before signing. | Closest documented model for repeated accounts within a wallet. Remove its asset/network layers. |
| Ledger Wallet | Desktop offers Home and account entry points; mobile uses Transfer, then Send. The flow selects an account to debit. | Asset/network/account selection precedes recipient, amount and review. Receive selects an account before address verification. | Global entry and contextual entry can converge on one transaction flow. Hardware verification is additional to preparation. |
| Exodus | Mobile offers Send from the wallet overview, then asset selection. Desktop commonly starts within an asset wallet. | Choose network when necessary, enter recipient and amount, then review. | Asset selection solves a different scope problem from choosing a Nano account. |
| MetaMask | Home Send uses the active account; account switching is available in the home dropdown. | Network/token, recipient, amount, then confirmation. | A compact active-account model is common, but hidden inherited scope is a poor fit for NaultCore's many accounts. |
| Phantom | Home Send leads to token selection and then recipient and amount. Receive exposes chain-specific deposit addresses. | Review follows editable transaction details. | Token and chain choice occupy space that Nano can devote to account identity. |
| Wise | Global Send starts a transfer; recipients, funding method and currency determine its scope. Account details are a separate receiving destination. | An editable setup precedes checking and paying. | A financial task can be a full-page flow without being a permanent sidebar location. |

Sources: [Trezor Send](https://trezor.io/guides/sending-receiving-staking-funds/sending-receiving/send-crypto-in-trezor-suite),
[Trezor Receive](https://trezor.io/guides/sending-receiving-staking-funds/sending-receiving/receive-crypto-in-trezor-suite),
[Trezor accounts](https://trezor.io/guides/trezor-suite/manage-accounts-in-trezor-suite),
[Ledger Send](https://support.ledger.com/article/4404382228753-zd?redirect=false),
[Ledger Receive](https://support.ledger.com/article/4404389453841-zd),
[Exodus Send](https://www.exodus.com/support/en/articles/8598631-how-do-i-send-bitcoin-and-crypto-from-exodus),
[MetaMask Send](https://support.metamask.io/manage-crypto/move-crypto/send/how-to-send-tokens-from-your-metamask-wallet),
[Phantom Send](https://help.phantom.com/articles/5530158379539),
[Phantom Receive](https://help.phantom.com/articles/receive-tokens-in-phantom-4406393831187),
[Wise Send](https://wise.com/help/articles/2977959/how-do-i-send-money-with-wise).

Multiple wallets, portfolios, accounts, chains and assets are not interchangeable.
For example, Exodus portfolios partition holdings inside a wallet; they are not
automatically independent recovery identities. A future NaultCore wallet switch
would sit above account selection and invalidate an in-progress transaction.
See [Exodus portfolios](https://www.exodus.com/support/en/articles/8598661-how-do-i-manage-multiple-portfolios-in-the-same-wallet).

## Why Nano needs a different emphasis

Nano has one asset and an account chain per address. Additional derived accounts
can have useful names and separate balances without a chain or token decision.
These are spending identities, not merely a rotating set of UTXO deposit
addresses. Pending funds are not yet spendable balance: publishing a receive
block is a separate operation from sharing an address.
See [Nano integration basics](https://docs.nano.org/integration-guides/the-basics/)
and [ledger design](https://docs.nano.org/protocol-design/ledger/).

The design therefore makes account recognition the first task. A short native
dropdown containing a name and balance cannot provide the full identity cues
needed here. Use application-rendered account rows with familiar identicons,
account names, derivation indices, full wrapping addresses and separate
available/pending balances. This supports recognition instead of address recall.
See [recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/).

## Interaction contract

### Entry and selection

| Entry | Result |
| --- | --- |
| Dashboard Send or Receive, multiple accounts | Show the appropriate account chooser. Sidebar selection has no effect. |
| Dashboard action, one account | Open preparation with that account visibly selected. |
| Owned account Send or Receive | Open preparation with `?account=<address>` explicitly selected. |
| Unknown explicit account | Explain the unavailable account and show the chooser; never substitute another account silently. |
| Empty wallet | Explain that an account is required and link to account management. |
| External account details | Do not offer a Send-from or Receive-to action implying ownership. |

The chooser supports search by name, index or address and keyboard operation.
Focus moves to the selected account's preparation heading after choosing a row.
Zero-balance and locked accounts remain visible and selectable. Sending checks
balance and asks for unlock at the existing signing boundary. Selecting an
account in a transaction does not change the sidebar's wallet selection.
Account changes replace the current page's account query parameter so its URL
matches the visible source or destination. They retain edited fields even when
the page was opened from a payment link with an amount and recipient.

### Send

```text
Wallet Send → Choose source → Prepare → Review → Unlock/sign/publish
Account Send ───────────────→ Prepare → Review → Unlock/sign/publish
                               ↑          │
                               └── Edit ──┘
```

Preparation displays the source identity and available balance above recipient
and amount. Change opens the same chooser. Returning preserves recipient and
amount, including raw units; it recalculates source eligibility. Own-account
transfers use the same rich chooser for their destination and exclude the source.
If a changed source equals that destination, require a new destination.

Review contains source, recipient and amount as a verification summary, without
account selectors. Edit returns to the populated preparation form. Any change
requires another review. During asynchronous preparation, controls cannot change
the draft being reviewed. Node state remains authoritative when publishing;
new balance or frontier information may legitimately make an operation fail.

Preserving answers when returning to edit follows
[GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers/).
Review/correction before a financial submission is also consistent with
[WCAG error prevention](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html).

### Receive

```text
Wallet Receive → Choose destination → Address / QR / optional requested amount
Account Receive ───────────────────→ Address / QR / optional requested amount
                    ↑                         │
                    └──────── Change ─────────┘
```

Changing destination immediately returns to the detailed list. The selected
identity, copy target, payment URI and QR image must describe the same account.
Clear stale QR content synchronously and discard late generation results.
Retain an optional requested amount when changing destination.

Keep pending receipt processing below the sharing flow as a separate section,
with explicit language about publishing receive blocks. An all-accounts pending
view is allowed; it is never a receiving address or QR destination. Preserve
merchant mode and the optional NanoNym integration.

### Responsive presentation and boundaries

Use the app's existing UIkit cards, buttons, typography and account imagery.
Account actions appear in the header in both compact and expanded layouts.
Rows wrap on narrow screens; full addresses remain available. Selection, editing
and review have the same meaning on mobile and desktop. Use native buttons and
inputs with visible labels and focus indicators rather than building a custom
ARIA listbox. Do not persist transaction drafts or change signing, derivation,
work scheduling, inbox/outbox or Nano protocol behavior for this UI change.

## Verification scenarios

| Scenario | Required observation |
| --- | --- |
| Sidebar selects B; global Send with A/B | Chooser appears; B is not silently selected. |
| Account A action; locked or zero balance | Action is visible and preparation names A. |
| Change A to B after entering recipient and amount | Inputs survive, source summary changes, review must be prepared again. |
| Account removed or invalid route address | No substitute source/destination; visible recovery to chooser. |
| Slow QR for A finishes after QR for B | Only B's URI and image can be displayed. |
| Receive chooser open | No stale address or QR can be copied. |
| Review → Edit → change → Review | New summary reflects the current draft. |
| Desktop and narrow mobile | Contextual actions and the same selection sequence remain available. |
| Feature flag enabled | Existing NanoNym preparation, receive and recovery behavior remains intact. |

The source comparison supports this design direction; it does not establish an
optimal solution for NaultCore. Observe account-choice errors, time to identify
the right account, and changes made before review in subsequent user testing.
