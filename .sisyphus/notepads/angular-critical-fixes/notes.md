Task: Fix memory leak in sign.component.ts
- Added DestroyRef injection and OnDestroy hook to clean up Hermes listeners on destroy.
- Imported takeUntilDestroyed to follow project RxJS interop conventions (prepared for future usage).
- Removed potential memory leak risk by ensuring tab-ping, sign-remote, multi-tab, participants, and tab-pong listeners are detached on destroy.
