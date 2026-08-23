import CryptoJS from 'crypto-js';
import { checkSeed, deriveAddress, derivePublicKey, deriveSecretKey } from 'nanocurrency';

export const e2eStorageStatePath = 'test-results/.auth/e2e-wallet.json';
export const e2eWalletPassword = 'nault-e2e-wallet';

export interface E2ETestWallet {
  accounts: string[];
  storageValue: string;
}

export function getE2ETestWallet(): E2ETestWallet {
  const seed = process.env.NANO_TEST_SEED?.trim();
  if (!seed) {
    throw new Error('NANO_TEST_SEED must be set to a funded 64-character Nano seed before running E2E tests.');
  }
  if (!checkSeed(seed)) {
    throw new Error('NANO_TEST_SEED must be a valid 64-character hexadecimal Nano seed.');
  }

  const accounts = [0, 1].map(index =>
    deriveAddress(derivePublicKey(deriveSecretKey(seed, index)), { useNanoPrefix: true }),
  );
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
  };
}
