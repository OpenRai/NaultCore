import init, { generate_work } from 'nano-rspow-web';

let initialized = null;

function ensureInitialized() {
  // Pass a runtime URL because Angular's worker build rewrites dependency
  // import.meta.url values to the source checkout path.
  initialized = initialized || init(new URL('./assets/lib/nano_rspow_web_bg.wasm', self.location.href));
  return initialized;
}

self.onmessage = async (event) => {
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
