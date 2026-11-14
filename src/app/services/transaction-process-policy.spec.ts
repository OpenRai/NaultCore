import { TxType } from './util.service';
import { processTransactionBlock } from './transaction-process-policy';

describe('processTransactionBlock', () => {
  it('returns the hash when the node accepts a block', async () => {
    const processor = { process: vi.fn().mockResolvedValue({ hash: 'ABC123' }) };
    await expect(processTransactionBlock(processor, { type: 'state' }, TxType.send)).resolves.toEqual({
      kind: 'accepted', hash: 'ABC123', response: { hash: 'ABC123' },
    });
  });

  it('keeps an explicit node rejection distinct from a transport failure', async () => {
    const processor = { process: vi.fn().mockResolvedValue({ error: 'Old block' }) };
    await expect(processTransactionBlock(processor, {}, TxType.receive)).resolves.toEqual({
      kind: 'rejected', reason: 'Old block', response: { error: 'Old block' },
    });
  });

  it('reports an empty response as rejection and a thrown error as failure', async () => {
    const emptyResponse = { process: vi.fn().mockResolvedValue(undefined) };
    const offline = new Error('offline');
    const transportFailure = { process: vi.fn().mockRejectedValue(offline) };

    await expect(processTransactionBlock(emptyResponse, {}, TxType.open)).resolves.toMatchObject({
      kind: 'rejected', reason: 'Node returned an error', response: undefined,
    });
    await expect(processTransactionBlock(transportFailure, {}, TxType.open)).resolves.toMatchObject({
      kind: 'failed', error: offline,
    });
  });
});
