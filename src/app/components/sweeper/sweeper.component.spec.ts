import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import * as nanocurrency from 'nanocurrency';

import { SweeperComponent } from './sweeper.component';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { ModalService } from '../../services/modal.service';
import { ApiService } from '../../services/api.service';
import { WorkPoolService } from '../../services/work-pool.service';
import { AppSettingsService } from '../../services/app-settings.service';
import { NanoBlockService } from '../../services/nano-block.service';
import { UtilService } from '../../services/util.service';
import { Router } from '@angular/router';
import { LegacyComponentTestModule } from '../../testing/legacy-component-test.module';

describe('SweeperComponent', () => {
  let notification: { sendInfo: ReturnType<typeof vi.fn> };
  let api: { accountInfo: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notification = { sendInfo: vi.fn() };
    api = { accountInfo: vi.fn() };
    TestBed.configureTestingModule({
      imports: [LegacyComponentTestModule],
      providers: [
        { provide: WalletService, useValue: {
          walletState: { accounts: [], selectedAccount: null },
          walletState$: new BehaviorSubject({ accounts: [] }),
          selectedAccountState$: new BehaviorSubject(null),
        } },
        { provide: NotificationService, useValue: notification },
        { provide: ModalService, useValue: {} },
        { provide: ApiService, useValue: api },
        { provide: WorkPoolService, useValue: { getWork: vi.fn(), suppressPrecomputation: vi.fn() } },
        { provide: AppSettingsService, useValue: { settings: {} } },
        { provide: NanoBlockService, useValue: { getRandomRepresentative: vi.fn() } },
        { provide: UtilService, useValue: {} },
        { provide: Router, useValue: { getCurrentNavigation: () => ({ extras: { state: {} } }) } },
      ],
    });
  });

  for (const derivation of ['blake2b', 'bip39/44']) {
    for (const state of ['funded', 'empty', 'unopened']) {
      it(`logs the address after the ${derivation} index only when the ${state} account has a balance`, async () => {
        const component = TestBed.runInInjectionContext(() => new SweeperComponent());
        const privateKey = '1'.repeat(64);
        const address = nanocurrency.deriveAddress(nanocurrency.derivePublicKey(privateKey), { useNanoPrefix: true });
        const raw = '313370000000000000000000000000';
        api.accountInfo.mockResolvedValue(state === 'unopened'
          ? { error: 'Account not found' }
          : { frontier: 'A'.repeat(64), balance: state === 'funded' ? raw : '0', representative: address });
        const convert = vi.fn().mockReturnValue('0.31337');
        Object.assign(TestBed.inject(UtilService), { nano: { rawToMnano: convert } });
        component.destinationAccount = 'destination';
        component.logArea = { nativeElement: { scrollTop: 0, scrollHeight: 0 } } as ElementRef;
        vi.spyOn(component, 'sleep').mockResolvedValue(undefined);
        let finish: () => void;
        const completed = new Promise<void>(resolve => finish = resolve);
        vi.spyOn(component, 'createPendingBlocks').mockImplementation(async (_key, _address, _balance, _previous, _type, _send, done) => {
          done();
          finish!();
        });

        await component.processIndexRecursive([[privateKey, derivation, 3]], 0);
        await completed;

        expect(api.accountInfo).toHaveBeenCalledWith(address);
        expect(component.output.split('\n')).toEqual([
          `Checking source account index 3 (${derivation} derivation).`,
          ...(state === 'funded' ? [`Found balance of 0.31337 XNO in source account ${address}.`] : []),
          'Sweep complete: all selected source accounts have been checked.',
          'Total sent to destination account destination: Ӿ0.',
        ]);
        if (state === 'funded') expect(convert).toHaveBeenCalledWith(raw);
        else expect(convert).not.toHaveBeenCalled();
      });
    }
  }

  it('logs the exact source address for pending-only funds after the derivation and index', async () => {
    const component = TestBed.runInInjectionContext(() => new SweeperComponent());
    const privateKey = '1'.repeat(64);
    const address = nanocurrency.deriveAddress(nanocurrency.derivePublicKey(privateKey), { useNanoPrefix: true });
    api.accountInfo.mockResolvedValue({ error: 'Account not found' });
    const blocks = { ['A'.repeat(64)]: { amount: '313370000000000000000000000000' } };
    const pending = vi.fn().mockResolvedValue({ blocks });
    Object.assign(api, { pending });
    Object.assign(TestBed.inject(UtilService), {
      big: { add: (a, b) => (BigInt(a) + BigInt(b)).toString() },
      nano: { rawToMnano: vi.fn().mockReturnValue('0.31337') },
    });
    component.destinationAccount = 'destination';
    component.logArea = { nativeElement: { scrollTop: 0, scrollHeight: 0 } } as ElementRef;
    vi.spyOn(component, 'sleep').mockResolvedValue(undefined);
    let finish: () => void;
    const completed = new Promise<void>(resolve => finish = resolve);
    vi.spyOn(component, 'processPending').mockImplementation(async () => { finish!(); });

    await component.processIndexRecursive([[privateKey, 'blake2b', 0]], 0);
    await completed;

    expect(pending).toHaveBeenCalledWith(address, component.maxIncoming);
    expect(component.output.split('\n')).toEqual([
      'Checking source account index 0 (blake2b derivation).',
      `Found 1 pending transfer(s) totaling 0.31337 XNO in source account ${address}.`,
    ]);
  });

  it('advances the source frontier before requesting the final send after a receive', async () => {
    const component = TestBed.runInInjectionContext(() => new SweeperComponent());
    const privateKey = '1'.repeat(64);
    const destination = nanocurrency.deriveAddress(nanocurrency.derivePublicKey('2'.repeat(64)), { useNanoPrefix: true });
    const source = nanocurrency.deriveAddress(nanocurrency.derivePublicKey(privateKey), { useNanoPrefix: true });
    const raw = '1000000000000000000000000000000';
    const process = vi.fn().mockImplementation(block => Promise.resolve({ hash: nanocurrency.hashBlock(block) }));
    Object.assign(api, { pending: vi.fn().mockResolvedValue({ blocks: { ['A'.repeat(64)]: { amount: raw } } }), process });
    Object.assign(notification, { sendWarning: vi.fn(), sendError: vi.fn() });
    Object.assign(TestBed.inject(UtilService), {
      big: { add: (a, b) => (BigInt(a) + BigInt(b)).toString() },
      nano: { rawToMnano: () => '1' },
    });
    const pool = TestBed.inject(WorkPoolService);
    Object.assign(pool, { updateAccountFrontier: vi.fn() });
    vi.mocked(pool.getWork).mockResolvedValue('0'.repeat(16));
    component.pubKey = nanocurrency.derivePublicKey(privateKey);
    component.representative = destination;
    component.destinationAccount = destination;
    component.validDestination = true;
    component.logArea = { nativeElement: { scrollTop: 0, scrollHeight: 0 } } as ElementRef;
    let finish: () => void;
    const completed = new Promise<void>(resolve => finish = resolve);
    await component.createPendingBlocks(privateKey, source, '0', null, 'open',
      previous => void component.processSend(privateKey, previous, finish!), finish!);
    await completed;
    const receiveHash = nanocurrency.hashBlock(process.mock.calls[0][0]);
    expect(pool.updateAccountFrontier).toHaveBeenCalledWith(source, receiveHash);
    expect(pool.getWork).toHaveBeenNthCalledWith(2, receiveHash, 1, source, true);
    expect(process.mock.calls[1][0].previous).toBe(receiveHash);
    expect(component.totalSwept).toBe('1');
    const sendHash = nanocurrency.hashBlock(process.mock.calls[1][0]);
    expect(component.output.split('\n')).toEqual([
      `Found 1 pending transfer(s) totaling 1 XNO in source account ${source}.`,
      'Preparing a receive block for pending funds (proof of work)...',
      `Pending receive accepted by the node. Receive block: ${receiveHash}`,
      'All pending funds received; preparing the final transfer.',
      `Sending funds from source account ${source} to destination account ${destination}.`,
      `Transfer accepted by the node: Ӿ1 sent from source account ${source} to destination account ${destination}. Block: ${sendHash}`,
    ]);
  }, 15000);

  for (const failure of ['node rejection', 'work cancellation']) {
    it(`logs an unsuccessful transfer accurately after ${failure}`, async () => {
      const component = TestBed.runInInjectionContext(() => new SweeperComponent());
      const privateKey = '1'.repeat(64);
      const source = nanocurrency.deriveAddress(nanocurrency.derivePublicKey(privateKey), { useNanoPrefix: true });
      const destination = nanocurrency.deriveAddress(nanocurrency.derivePublicKey('2'.repeat(64)), { useNanoPrefix: true });
      const pool = TestBed.inject(WorkPoolService);
      const cancelled = failure === 'work cancellation';
      if (cancelled) vi.mocked(pool.getWork).mockRejectedValue(new Error('PoW request invalidated by frontier change'));
      else vi.mocked(pool.getWork).mockResolvedValue('0'.repeat(16));
      const process = vi.fn().mockResolvedValue({ error: 'Fork' });
      Object.assign(api, { process });
      Object.assign(notification, { sendWarning: vi.fn() });
      component.destinationAccount = destination;
      component.representative = destination;
      component.validDestination = true;
      component.logArea = { nativeElement: { scrollTop: 0, scrollHeight: 0 } } as ElementRef;
      const done = vi.fn();

      await component.processSend(privateKey, 'A'.repeat(64), done);

      expect(component.output.split('\n')).toEqual([
        `Sending funds from source account ${source} to destination account ${destination}.`,
        cancelled
          ? `Transfer could not be completed for source account ${source}: PoW request invalidated by frontier change`
          : `The node rejected the transfer from source account ${source}: Fork`,
      ]);
      expect(process).toHaveBeenCalledTimes(cancelled ? 0 : 1);
      expect(component.totalSwept).toBe('0');
      expect(done).toHaveBeenCalledTimes(1);
    });
  }

  it('skips a source account that is already the destination', async () => {
    const component = TestBed.runInInjectionContext(() => new SweeperComponent());
    const privateKey = '1'.repeat(64);
    const destination = nanocurrency.deriveAddress(nanocurrency.derivePublicKey(privateKey), { useNanoPrefix: true });
    component.destinationAccount = destination;
    component.logArea = { nativeElement: { scrollTop: 0, scrollHeight: 0 } } as ElementRef;
    const done = vi.fn();

    await component.processAccount(privateKey, done);

    expect(api.accountInfo).not.toHaveBeenCalled();
    expect(notification.sendInfo).toHaveBeenCalledWith(
      `Skipped source account ${destination}: it is already the sweep destination.`,
      { length: 10000 },
    );
    expect(component.output).toContain('already the sweep destination');
    expect(done).toHaveBeenCalledTimes(1);
  });
});
