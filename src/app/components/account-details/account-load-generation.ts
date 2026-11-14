export class AccountLoadGeneration {
  private generation = 0;
  private accountID: string | null = null;

  begin(accountID: string): number {
    this.accountID = accountID;
    return ++this.generation;
  }

  invalidate(): void {
    this.accountID = null;
    this.generation++;
  }

  isCurrent(generation: number, accountID: string): boolean {
    return generation === this.generation && accountID === this.accountID;
  }
}
