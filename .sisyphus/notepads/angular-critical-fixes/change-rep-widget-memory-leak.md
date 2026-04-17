Task: Fix memory leak in src/app/components/change-rep-widget/change-rep-widget.component.ts

What I did:
- Imported DestroyRef from @angular/core and takeUntilDestroyed from @angular/core/rxjs-interop.
- Injected DestroyRef in the component constructor.
- Replaced five subscriptions in ngOnInit with takeUntilDestroyed(this.destroyRef):
  1) repService.walletReps$.subscribe
  2) walletService.wallet.selectedAccount$.subscribe
  3) walletService.wallet.newWallet$.subscribe
  4) blockService.newOpenBlock$.subscribe
  5) repService.changeableReps$.subscribe
- Preserved all existing callback logic and order of ngOnInit; no behavioral changes.

Why this matters:
- Prevents memory leaks by ensuring subscriptions are automatically unsubscribed when the component is destroyed, without needing ngOnDestroy.

Verification you can perform:
- grep has takeUntilDestroyed occurrences in the file: ensure 5 subscriptions are wrapped.
- Ensure DestroyRef is imported from @angular/core and used in constructor.
- Build/tests should pass with no behavioral changes.

Notes:
- This follows Angular 16+ DestroyRef + takeUntilDestroyed pattern as per Angular docs.
- No changes were made to existing subscription callbacks beyond wrapping with the lifecycle operator.

Changed file references:
- src/app/components/change-rep-widget/change-rep-widget.component.ts

Commit context (for traceability):
- Angular memory leak fix: use takeUntilDestroyed with DestroyRef for 5 subscriptions.
