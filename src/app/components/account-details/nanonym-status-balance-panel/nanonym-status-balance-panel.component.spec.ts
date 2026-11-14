import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NanonymStatusBalancePanelComponent } from './nanonym-status-balance-panel.component';

describe('NanonymStatusBalancePanelComponent', () => {
  let fixture: ComponentFixture<NanonymStatusBalancePanelComponent>;
  let component: NanonymStatusBalancePanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NanonymStatusBalancePanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NanonymStatusBalancePanelComponent);
    component = fixture.componentInstance;
    component.nanoNym = { status: 'active', balance: '1000', paymentCount: 1 };
    component.balanceFiatText = 'USD 12.5';
    component.statusTitle = 'Status';
    component.activeLabel = 'Active';
    component.archivedLabel = 'Archived';
    component.archiveActionLabel = 'Archive';
    component.reactivateActionLabel = 'Reactivate';
    component.balanceTitle = 'Balance';
    fixture.detectChanges();
  });

  it('renders the current status, balance, and singular payment count', () => {
    expect(fixture.nativeElement.querySelector('.status-active')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.status-text').textContent.trim()).toBe('Active');
    expect(fixture.nativeElement.querySelector('.account-amounts-converted').textContent.trim()).toBe('USD 12.5');
    expect(fixture.nativeElement.querySelector('.payment-count-summary').textContent).toContain('1 payment');
  });

  it('renders archived status and emits a request to toggle it', () => {
    fixture.componentRef.setInput('nanoNym', { status: 'archived', balance: '0', paymentCount: 2 });
    fixture.detectChanges();

    let requested = false;
    component.toggleStatus.subscribe(() => requested = true);
    expect(fixture.nativeElement.querySelector('.status-archived')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button').textContent.trim()).toBe('Reactivate');
    fixture.nativeElement.querySelector('button').click();
    expect(requested).toBe(true);
    expect(fixture.nativeElement.querySelector('.payment-count-summary').textContent).toContain('2 payments');
  });

  it('keeps the balance hidden while loading', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.account-amounts-primary')).toBeNull();
    expect(fixture.nativeElement.querySelector('.payment-count-summary')).toBeNull();
    expect(fixture.nativeElement.querySelector('[uk-spinner]')).toBeTruthy();
  });
});
