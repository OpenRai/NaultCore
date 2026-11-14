import { TestBed } from '@angular/core/testing';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { QR_MODAL_COMPONENT, QrModalService, type QRType } from './qr-modal.service';

describe('QrModalService', () => {
  let service: QrModalService;
  let modalService: { open: ReturnType<typeof vi.fn> };
  let openedComponent: unknown;
  let openedOptions: unknown;
  let modalRef: {
    componentInstance: { reference?: string; type?: QRType };
    result: Promise<unknown>;
  };

  beforeEach(() => {
    modalRef = {
      componentInstance: {},
      result: Promise.resolve('decoded value'),
    };
    openedComponent = undefined;
    openedOptions = undefined;
    modalService = {
      open: vi.fn((component: unknown, options: unknown) => {
        openedComponent = component;
        openedOptions = options;
        return modalRef;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        QrModalService,
        { provide: NgbModal, useValue: modalService },
        { provide: QR_MODAL_COMPONENT, useValue: class TestQrModal {} },
      ],
    });
    service = TestBed.inject(QrModalService);
  });

  it('opens the configured component and resolves the scanned value', async () => {
    const value = await service.openQR('reference', 'account');

    expect(value).toBe('decoded value');
    expect(modalService.open).toHaveBeenCalled();
    expect(openedComponent).toBeTruthy();
    expect(openedOptions).toEqual({ windowClass: 'scanner-modal' });
    expect(modalRef.componentInstance.reference).toBe('reference');
    expect(modalRef.componentInstance.type).toBe('account');
  });

  it('propagates modal dismissal as a rejected result', async () => {
    modalRef.result = Promise.reject('QR scanner dismissed');

    await expect(service.openQR('reference', 'account')).rejects.toBe('QR scanner dismissed');
  });

  it('preserves an optional modal result', async () => {
    modalRef.result = Promise.resolve(undefined);

    await expect(service.openQR('reference', 'account')).resolves.toBeUndefined();
  });

  it('rejects when the QR modal is not configured', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        QrModalService,
        { provide: NgbModal, useValue: modalService },
        { provide: QR_MODAL_COMPONENT, useValue: null },
      ],
    });
    service = TestBed.inject(QrModalService);

    await expect(service.openQR('reference', 'account')).rejects.toThrow('QR modal component is not configured');
  });
});
