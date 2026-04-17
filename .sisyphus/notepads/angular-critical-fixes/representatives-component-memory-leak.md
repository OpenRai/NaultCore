Title: Fix memory leak in RepresentativesComponent via takeUntilDestroyed

Summary:
- Replaced a standalone subscription to router.queryParams with a takeUntilDestroyed-based pattern to prevent memory leaks when the component is destroyed.
- Injected DestroyRef and imported takeUntilDestroyed from @angular/core/rxjs-interop.
- Preserved existing callback logic and did not modify voting/delegation logic.

What changed:
- Import { DestroyRef } from '@angular/core' and import { takeUntilDestroyed } from '@angular/core/rxjs-interop'.
- Inject DestroyRef in the component constructor.
- Wrap router.queryParams subscription with .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(...).

Rationale:
- This follows the established memory-leak-fix pattern used across the codebase for Angular components.
- Ensures subscriptions are automatically unsubscribed when the component is destroyed without requiring manual ngOnDestroy boilerplate.

Verification steps:
- Verified that router.queryParams subscription uses takeUntilDestroyed(this.destroyRef).
- No other subscriptions exist in RepresentativesComponent that require wrapping; grep confirmed only one subscription was present.
- Manually smoke-tested by navigating away from the page to confirm no memory leaks in CSR lifecycle (no lingering subscriptions).
- Voting logic and delegation calculations were left unchanged.

Status: all subtasks completed.

Plan alignment:
- This aligns with the last memory-leak fix in the series and does not alter business logic.
