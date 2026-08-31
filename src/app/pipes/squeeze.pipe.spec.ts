import { SqueezePipe } from './squeeze.pipe';
import { describe, expect, it } from 'vitest';

describe('SqueezePipe', () => {
  it('create an instance', () => {
    const pipe = new SqueezePipe();
    expect(pipe).toBeTruthy();
  });
});
