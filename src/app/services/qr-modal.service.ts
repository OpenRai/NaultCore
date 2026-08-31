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
  openQR(reference: string, type: QRType) {
    const response = this.getDeferredPromise();
    if (!this.qrModalComponent) {
      response.reject(new Error('QR modal component is not configured'));
      return response.promise;
    }

    const modalPromise = Promise.resolve().then(() =>
      this.modalService.open(this.qrModalComponent, {windowClass: 'scanner-modal'}));
    modalPromise.then((modalRef) => {
      modalRef.componentInstance.reference = reference;
      modalRef.componentInstance.type = type;
      modalRef.result.then((data) => {
        response.resolve(data);
      }, () => {
        response.reject();
      });
    }, () => {
      response.reject();
    });
    return response.promise;
  }

  // Helper for returning a deferred promise that we can resolve when QR is ready
  private getDeferredPromise() {
    const defer = {
      promise: null,
      resolve: null,
      reject: null,
    };

    defer.promise = new Promise((resolve, reject) => {
      defer.resolve = resolve;
      defer.reject = reject;
    });

    return defer;
  }
}
