import { ReceiveComponent } from './receive.component';
import * as QRCode from 'qrcode';

vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));

function receiveContext(): any {
  const component = Object.create(ReceiveComponent.prototype);
  Object.assign(component, {
    route: { navigate: vi.fn() }, activatedRoute: {}, focusDestination: vi.fn(),
    qrRevision: 0, qrAccount: '', qrAmount: null, qrCodeUri: null, qrCodeImage: null,
    spendableAccounts: [{ id: 'nano_A' }, { id: 'nano_B' }],
    pendingAccountModel: 'nano_A', amountNano: '0.5', amountFiat: '1',
    walletService: { getWalletAccount: vi.fn(id => ({ id })), selectAccount: vi.fn() },
    util: { account: { isValidAmount: () => true } },
    notificationService: { sendError: vi.fn() },
    addressBook: { getAccountName: vi.fn(() => null) }, getAccountLabel: vi.fn(() => 'Account'),
    filterPendingBlocksForDestinationAccount: vi.fn(),
  });
  return component;
}

describe('Receive account and QR consistency', () => {
  beforeEach(() => vi.mocked(QRCode.toDataURL).mockReset());

  it('discards a late QR result for the previous destination', async () => {
    let finishA: (value: string) => void;
    vi.mocked(QRCode.toDataURL).mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockResolvedValueOnce('image_B');
    const component = receiveContext();
    const previous = component.changeQRAccount('nano_A');
    await component.changeQRAccount('nano_B');
    finishA!('image_A');
    await previous;
    expect(component.qrCodeUri).toBe('nano:nano_B');
    expect(component.qrCodeImage).toBe('image_B');
  });

  it('clears copy and QR content immediately when Change opens the chooser, retaining the amount', async () => {
    let finish: (value: string) => void;
    vi.mocked(QRCode.toDataURL).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const component = receiveContext();
    const pending = component.changeQRAccount('nano_A');
    component.changeAccount();
    expect(component.qrCodeUri).toBeNull();
    expect(component.qrAccount).toBe('');
    expect(component.choosingAccount).toBe(true);
    expect(component.amountNano).toBe('0.5');
    finish!('stale_image');
    await pending;
    expect(component.qrCodeImage).toBeNull();
  });

  it('applies only the latest amount QR for the same account', async () => {
    let finish: (value: string) => void;
    vi.mocked(QRCode.toDataURL).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce('new_amount');
    const component = receiveContext();
    component.qrAccount = 'nano_A';
    const old = component.changeQRAmount('1');
    await component.changeQRAmount('2');
    finish!('old_amount');
    await old;
    expect(component.qrCodeUri).toBe('nano:nano_A?amount=2');
    expect(component.qrCodeImage).toBe('new_amount');
  });

  it('changes the local destination without mutating sidebar selection', () => {
    vi.mocked(QRCode.toDataURL).mockResolvedValue('image');
    const component = receiveContext();
    component.chooseAccount('nano_B');
    expect(component.pendingAccountModel).toBe('nano_B');
    expect(component.qrAccount).toBe('nano_B');
    expect(component.walletService.selectAccount).not.toHaveBeenCalled();
    component.chooseAccount('nano_missing');
    expect(component.pendingAccountModel).toBe('nano_B');
  });
});
