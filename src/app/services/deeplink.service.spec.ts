import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DeeplinkService } from './deeplink.service';
import { NotificationService } from './notification.service';
import { RemoteSignService } from './remote-sign.service';
import { UtilService } from './util.service';
import { WalletContextService } from './wallet-context.service';
import { WalletService } from './wallet.service';

describe('DeeplinkService', () => {
  let service: DeeplinkService;
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        DeeplinkService,
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: { sendWarning: vi.fn() } },
        {
          provide: UtilService,
          useValue: {
            account: { isValidAccount: vi.fn(value => value === 'nano_1recipient') },
            nano: {
              isValidSeed: vi.fn(() => false),
              rawToMnano: vi.fn(value => value),
              isValidHash: vi.fn(() => false),
            },
          },
        },
        { provide: WalletService, useValue: { walletState: { accounts: [{ id: 'nano_1source' }] } } },
        {
          provide: WalletContextService,
          useValue: {
            resolveTransactionContext: vi.fn(() => ({
              intent: 'send', accountId: 'nano_1source', source: 'selected', explicit: false,
            })),
          },
        },
        { provide: RemoteSignService, useValue: {} },
      ],
    });
    service = TestBed.inject(DeeplinkService);
  });

  it('adds the selected account to a scanned recipient route', () => {
    expect(service.navigate('nano_1recipient')).toBe(true);

    expect(router.navigate).toHaveBeenCalledWith(['send'], {
      queryParams: { to: 'nano_1recipient', account: 'nano_1source' },
    });
  });

  it('accepts Nano payment URIs and preserves the requested amount', () => {
    expect(service.navigate('nano:nano_1recipient?amount=1000000000000000000000000')).toBe(true);

    expect(router.navigate).toHaveBeenCalledWith(['send'], {
      queryParams: {
        to: 'nano_1recipient',
        amount: '1000000000000000000000000',
        account: 'nano_1source',
      },
    });
  });

  it('rejects an unsupported HTTPS payload so the scanner can show feedback', () => {
    expect(service.navigate('https://example.com/not-a-wallet-route')).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
