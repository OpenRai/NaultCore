import { TestBed } from '@angular/core/testing';
import { RecoveryDisclosureComponent } from './recovery-disclosure.component';
import { ChevronComponent } from '../chevron/chevron.component';

describe('shared recovery presentation', () => {
  it('renders independent native disclosures closed initially', async () => {
    const first = TestBed.createComponent(RecoveryDisclosureComponent);
    const second = TestBed.createComponent(RecoveryDisclosureComponent);
    first.componentRef.setInput('summary', 'Recovery phrase');
    first.componentRef.setInput('guidance', 'Keep it private');
    first.componentRef.setInput('mnemonic', true);
    await first.whenStable();
    await second.whenStable();
    const details = first.nativeElement.querySelector('details');
    expect(details.open).toBe(false);
    expect(details.classList.contains('backup-mnemonic')).toBe(true);
    expect(details.querySelector('summary').textContent).toBe('Recovery phrase');
    expect(details.querySelector('p').textContent).toBe('Keep it private');
    details.open = true;
    expect(second.nativeElement.querySelector('details').open).toBe(false);
  });

  it('renders a decorative chevron that follows expanded state', async () => {
    const fixture = TestBed.createComponent(ChevronComponent);
    await fixture.whenStable();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.classList.contains('expanded')).toBe(false);
    fixture.componentRef.setInput('expanded', true);
    await fixture.whenStable();
    expect(svg.classList.contains('expanded')).toBe(true);
  });
});
