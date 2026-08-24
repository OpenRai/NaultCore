# Build-time branding

`branding.json` is the single source for product-facing names and links. The
`version` script selects the `naultcore` profile by default, or the `nanonyms`
profile when `FEATURE_NANONYMS=true`, and generates the ignored TypeScript
outputs consumed by the Angular and Electron applications.

The static NaultCore splash and PWA metadata are intentionally checked in as
the default web profile. The Angular application and Electron shell use the
selected build profile after startup.

Some Nault identifiers are compatibility contracts and are not branding:

- the private package name `nault` and Electron app ID `cc.nault`;
- the `nault` Electron storage/log directory;
- Nault artifact names (kept explicitly in electron-builder) and the
  `nault/nault` container repository;
- `nault.cc`, Nano protocol URLs, upstream help links, import/export test
  fixtures, and historical “Based on Nault” attribution.

These references preserve existing installs, update behavior, stored settings,
and links to the upstream Nault protocol-compatible project.
