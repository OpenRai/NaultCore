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
    result: Promise<string>;
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
});
