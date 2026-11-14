import { InjectionToken, Injectable, Type, inject } from '@angular/core';
import {NgbModal } from '@ng-bootstrap/ng-bootstrap';

export type QRType = 'account' | 'hash' | 'mnemonic' | 'generic';
export const QR_MODAL_COMPONENT = new InjectionToken<Type<any>>('QR_MODAL_COMPONENT');

@Injectable({
  providedIn: 'root'
})
export class QrModalService {
  private modalService = inject(NgbModal);
  private qrModalComponent = inject(QR_MODAL_COMPONENT, { optional: true });


  /** Will return a promise that will only resolve if the type matches the QR string read and is valid
   *
   * @param reference Unique reference ID for example a text input
   * @param type String type to match in QR
   */
  async openQR(reference: string, type: QRType) {
    if (!this.qrModalComponent) {
      throw new Error('QR modal component is not configured');
    }
    const modalRef = this.modalService.open(this.qrModalComponent, {windowClass: 'scanner-modal'});
    modalRef.componentInstance.reference = reference;
    modalRef.componentInstance.type = type;
    return modalRef.result;
  }
}
