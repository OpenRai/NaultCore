declare module "*/nanoidenticons.min.js" {
  export function createIcon(options: { seed: string; scale: number }): HTMLCanvasElement;
}

declare module "pbkdf2/browser" {
  export function pbkdf2Sync(password: Uint8Array, salt: Uint8Array, iterations: number, keylen: number, digest: string): Buffer;
}
