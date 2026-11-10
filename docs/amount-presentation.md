# Amount presentation

Scientific notation is never an amount display format in the wallet UI.
The source value remains an exact integer raw amount. Signing, accounting and
copying must not use a rounded display value.

Each widget selects its precision through `app-nano-amount`:

- `precision="summary"` (default): ordinary XNO values use a short decimal
  preview. Nonzero values below one rai show `<0.000001 XNO`; values below
  one million raw can show a localized raw count instead. Summaries do not
  expand exact decimal tails or append a raw-remainder row.
- `precision="raw-detail"`: show XNO to whole rai (up to six decimal places),
  followed by a smaller, muted row containing the localized remaining raw.
  For example `0.001 XNO` followed by `+86,118,708,102,050 raw`.
  Integer splitting uses BigInt, not floating-point conversion or rounding.

Balances being inspected and payments being authorized opt into raw detail.
Transaction headers are summaries. The Block details section contains the
exact decimal XNO amount in a selectable field and an explicit copy button.
That copy value has no unit suffix and includes every raw atom.

Do not append another legacy raw row to a detailed amount widget. Components
that offer editable raw adjustments may keep those controls separate from the
read-only amount presentation.
