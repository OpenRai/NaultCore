import init, { generate_work } from 'nano-rspow-web';

let initialized: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  // Keep the WASM URL relative to the deployed worker. The app can be hosted
  // below a path prefix, so a source-relative import.meta URL would escape it.
  initialized ??= init(new URL('./assets/lib/nano_rspow_web_bg.wasm', self.location.href));
  return initialized;
}

self.onmessage = async (event: MessageEvent<{ id: number; root: string; threshold: string }>) => {
  const { id, root, threshold } = event.data;
  try {
    await ensureInitialized();
    const result = await generate_work(root, threshold);
    const work = result.nonce;
    if (result.free) result.free();
    self.postMessage({ id, ok: true, work });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
