# Typography

NaultCore follows the supplied Nano typography guide:

- Montserrat: headings and titles, weights 500, 600 and 700.
- Open Sans: body text, controls, labels, navigation and amounts, weights 400,
  600 and 700.
- Roboto Mono: addresses, hashes and alias identifiers.

The shared scale lives in `src/less/components/typography.less`. Use its CSS
properties in component styles and templates instead of introducing local sizes.

| Token | Size | Role |
| --- | --- | --- |
| `--text-xs` | .75rem | Compact metadata and badges |
| `--text-sm` | .875rem | Labels, buttons and secondary text |
| `--text-base` | 1rem | Body text and inputs |
| `--text-lg` | 1.25rem | Subheadings and lead text |
| `--text-xl` | 1.5rem | Card titles and small amount displays |
| `--text-2xl` | 2rem | Page headings and prominent amounts |
| `--text-3xl` | 2.5rem | Large headings |
| `--text-display` | 3rem | Exceptional display text |

Responsive displays may use `clamp()` with scale tokens as bounds. Contextual
fractions may retain percentage sizing. Layout dimensions and icon geometry are
not text sizes. Keep the root font size user-controlled.

Fonts are self-hosted in `src/assets/fonts`; no Google Fonts request is made at
runtime. Montserrat and Open Sans Latin and Latin Extended WOFF2 subsets were
obtained from the [Google Fonts CSS API](https://developers.google.com/fonts/docs/css2).
Their OFL licenses are bundled alongside the files. Font declarations are in
`src/less/components/font.less`.
