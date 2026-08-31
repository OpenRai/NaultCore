import { CurrencySymbolPipe } from "./currency-symbol.pipe";
import { describe, expect, it } from 'vitest';

describe("CurrencySymbolPipe", () => {
  it("create an instance", () => {
    const pipe = new CurrencySymbolPipe("en-US");
    expect(pipe).toBeTruthy();
  });
});
