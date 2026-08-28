# Build-time branding

`branding.json` is the single source for product-facing names and links. The
`version` script selects the `naultcore` profile by default, or the `nanonyms`
profile when `FEATURE_NANONYMS=true`, and generates the ignored TypeScript and
translation outputs consumed by the Angular and Electron applications.

The static NaultCore splash and PWA metadata are intentionally checked in as
the default web profile. The Angular application and Electron shell use the
selected build profile after startup.

## Current NaultCore artwork

The interim canonical application mark is the approved ex-3 artwork in
`src/assets/logo_source/naultcore-ex-3.png`, copied to
`src/assets/img/naultcore-logo.png` for runtime use. The same source is used
for the splash screen, welcome screen, receive-mode artwork, and the generated
favicon/PWA raster set. `scripts/verify-branding.js` checks that those files,
their declared dimensions, and the manifest references remain consistent.

The older `nault-logo*.svg` files remain in the repository as upstream/source
compatibility assets; NaultCore application surfaces must reference the
canonical ex-3 mark instead.

The remaining literal `Nault` occurrences are intentional exceptions: upstream
Nault documentation links and titles, the visible `Based on Nault` attribution,
legacy wallet/address-book export filenames, NanoNym-only messaging, test
infrastructure comments, package/Electron identifiers, and historical
documentation. They do not identify the default NaultCore application. All
other display prose is resolved through `branding.json` and the generated
translation catalogue.

Some Nault identifiers are compatibility contracts and are not branding:

- the private package name `nault` and Electron app ID `cc.nault`;
- the `nault` Electron storage/log directory;
- Nault artifact names (kept explicitly in electron-builder) and the
  `nault/nault` container repository;
- `nault.cc`, Nano protocol URLs, upstream help links, import/export test
  fixtures, and historical “Based on Nault” attribution.

These references preserve existing installs, update behavior, stored settings,
and links to the upstream Nault protocol-compatible project. The checked-in
`src/assets/i18n/en.json` is the upstream translation template; the generated
`en.branding.json` rewrites display prose to the selected profile while leaving
URLs and compatibility identifiers unchanged.
