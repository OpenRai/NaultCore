# NaultCore developer preview

## Applicability

This procedure applies only to `https://naultcore-dev.openrai.org`.

GitHub Pages hosts the preview. The preview build uses `FEATURE_NANONYMS=false`.

The preview is not the production wallet origin. Do not direct users to store production funds there.

## Required GitHub Pages and DNS state

1. Set the repository Pages custom domain to `naultcore-dev.openrai.org`.
2. Create `naultcore-dev.openrai.org CNAME openrai.github.io` in Cloudflare.
3. Keep the record DNS-only until GitHub provisions the certificate.
4. Enable Enforce HTTPS after GitHub reports a valid certificate.

GitHub Pages uses the custom-domain setting for this Actions-based deployment. A repository `CNAME` file is not required.

## Deployment and verification

1. Merge the preview changes to `main`.
2. Wait for the `Build and Deploy` workflow to finish successfully.
3. Run `curl -fsSIL https://naultcore-dev.openrai.org/`.
4. Confirm a successful HTTPS response and `strict-transport-security`.
5. Open the site in a clean Chromium profile.
6. Confirm `manifest.webmanifest` resolves at the origin root.
7. Confirm the service worker scope is `https://naultcore-dev.openrai.org/`.
8. Install the PWA and reload it after disabling network access.

The workflow runs `pnpm run verify:pwa:preview` before it uploads the Pages artifact.

## GitHub Pages security limit

GitHub Pages supplies HTTPS and HSTS. This repository cannot configure the following response headers on GitHub Pages:

- Content-Security-Policy
- Permissions-Policy
- Referrer-Policy
- X-Frame-Options or CSP `frame-ancestors`
- Cross-Origin-Opener-Policy

Move the wallet to a header-capable host before you declare a custom domain a production wallet origin.

Start CSP as report-only.

Test legacy inline scripts before you enforce CSP.

Test WebUSB, WebHID, WebBluetooth, and camera flows before you enforce CSP.
