import * as NanoCurrency from 'nanocurrency';

self.addEventListener('message', async (message: MessageEvent<{
  blockHash: string;
  workerIndex: number;
  workerCount: number;
  workThreshold: string;
}>) => {
  const { blockHash, workerIndex, workerCount, workThreshold } = message.data;
  const result = await NanoCurrency.computeWork(blockHash, { workThreshold, workerIndex, workerCount });
  self.postMessage(result);
});
