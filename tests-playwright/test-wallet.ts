import CryptoJS from 'crypto-js';
import { checkSeed, deriveAddress, derivePublicKey, deriveSecretKey } from 'nanocurrency';

export const e2eStorageStatePath = 'test-results/.auth/e2e-wallet.json';
export const e2eWalletPassword = 'nault-e2e-wallet';

export interface E2ETestWallet {
  accounts: string[];
  storageValue: string;
  workCache: {
    version: 2;
    entries: Array<{
      account: string;
      root: string;
      work: string;
      threshold: string;
      createdAt: number;
    }>;
  };
}

const unopenedAccountFixture = {
  account: 'nano_1jgao4s3xaw546qm85gqsx841h1u37scy8gchx57sa9q1hoqg9icbud5w9d9',
  root: '45C8A8B21EA383112F330DD7CF4C203C1B0972AF19CA7F465CA0F703EB771E0A',
  work: '00000000005F2860',
  threshold: 'FFFFFE0000000000',
} as const;

export function getE2ETestWallet(): E2ETestWallet {
  const seed = process.env.NANO_TEST_SEED?.trim();
  if (!seed) {
    throw new Error('NANO_TEST_SEED must be set to a funded 64-character Nano seed before running E2E tests.');
  }
  if (!checkSeed(seed)) {
    throw new Error('NANO_TEST_SEED must be a valid 64-character hexadecimal Nano seed.');
  }

  const publicKeys = [0, 1, 2].map(index => derivePublicKey(deriveSecretKey(seed, index)));
  const accounts = publicKeys.map(publicKey => deriveAddress(publicKey, { useNanoPrefix: true }));
  if (accounts[2] !== unopenedAccountFixture.account || publicKeys[2] !== unopenedAccountFixture.root) {
    throw new Error('NANO_TEST_SEED does not match the checked-in index-2 receive/open work fixture.');
  }
  const encryptedSeed = CryptoJS.AES.encrypt(seed, e2eWalletPassword).toString();

  return {
    accounts,
    storageValue: JSON.stringify({
      type: 'seed',
      seed: encryptedSeed,
      locked: true,
      accounts: accounts.map((id, index) => ({ id, index })),
      selectedAccountId: null,
    }),
    workCache: {
      version: 2,
      entries: [{ ...unopenedAccountFixture, createdAt: 0 }],
    },
  };
}
