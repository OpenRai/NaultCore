import { WalletReconciliationCoordinator } from './wallet-reconciliation-coordinator';

describe('WalletReconciliationCoordinator', () => {
  it('serializes refreshes and gives each request the snapshot for its generation', async () => {
    let releaseFirst!: () => void;
    let runs = 0;
    let activeRuns = 0;
    let maxActiveRuns = 0;
    const coordinator = new WalletReconciliationCoordinator(async reason => {
      runs++;
      activeRuns++;
      maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
      if (runs === 1) await new Promise<void>(resolve => releaseFirst = resolve);
      activeRuns--;
      return { generation: runs, reason };
    });

    const first = coordinator.request('startup');
    await Promise.resolve();
    const second = coordinator.request('websocket');
    releaseFirst();

    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);

    expect(runs).toBe(2);
    expect(maxActiveRuns).toBe(1);
    expect(firstSnapshot).toEqual({ generation: 1, reason: 'startup' });
    expect(secondSnapshot).toEqual({ generation: 2, reason: 'websocket' });
  });

  it('rejects a failed generation and allows a later request to retry', async () => {
    let attempts = 0;
    const coordinator = new WalletReconciliationCoordinator(async reason => {
      attempts++;
      if (attempts === 1) throw new Error('node unavailable');
      return { reason };
    });

    await expect(coordinator.request('manual')).rejects.toThrow('node unavailable');
    await expect(coordinator.request('retry')).resolves.toEqual({ reason: 'retry' });
    expect(attempts).toBe(2);
  });
});
