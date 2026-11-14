type ReconciliationWaiter<T> = {
  generation: number;
  resolve: (snapshot: T) => void;
  reject: (error: unknown) => void;
};

/** Coalesces overlapping wallet refresh requests while preserving follow-up invalidations. */
export class WalletReconciliationCoordinator<T> {
  private requestedGeneration = 0;
  private completedGeneration = 0;
  private reconciliationPromise: Promise<void> | null = null;
  private reconciliationReason = 'initialization';
  private waiters: ReconciliationWaiter<T>[] = [];

  constructor(private readonly reconcile: (reason: string) => Promise<T>) {}

  request(reason: string): Promise<T> {
    const generation = ++this.requestedGeneration;
    this.reconciliationReason = reason;
    const result = new Promise<T>((resolve, reject) => {
      this.waiters.push({ generation, resolve, reject });
    });

    this.start();

    return result;
  }

  private start(): void {
    if (this.reconciliationPromise) return;
    this.reconciliationPromise = Promise.resolve()
      .then(() => this.run())
      .finally(() => {
        this.reconciliationPromise = null;
        // A waiter continuation can request another refresh as the previous
        // run settles. Make sure that request is picked up after teardown.
        if (this.completedGeneration < this.requestedGeneration) this.start();
      });
  }

  private async run(): Promise<void> {
    while (this.completedGeneration < this.requestedGeneration) {
      const generation = this.requestedGeneration;
      const reason = this.reconciliationReason;

      try {
        const snapshot = await this.reconcile(reason);
        this.completedGeneration = generation;
        this.resolveWaiters(generation, snapshot);
      } catch (error) {
        this.completedGeneration = generation;
        this.rejectWaiters(generation, error);
      }
    }
  }

  private resolveWaiters(generation: number, snapshot: T): void {
    const remaining: ReconciliationWaiter<T>[] = [];
    this.waiters.forEach(waiter => {
      if (waiter.generation <= generation) waiter.resolve(snapshot);
      else remaining.push(waiter);
    });
    this.waiters = remaining;
  }

  private rejectWaiters(generation: number, error: unknown): void {
    const remaining: ReconciliationWaiter<T>[] = [];
    this.waiters.forEach(waiter => {
      if (waiter.generation <= generation) waiter.reject(error);
      else remaining.push(waiter);
    });
    this.waiters = remaining;
  }
}
