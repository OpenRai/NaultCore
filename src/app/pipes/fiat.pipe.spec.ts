import { FiatPipe } from "./fiat.pipe";
import { describe, expect, it } from 'vitest';

describe("FiatPipe", () => {
  it("create an instance", () => {
    const pipe = new FiatPipe("en-US");
    expect(pipe).toBeTruthy();
  });
});
