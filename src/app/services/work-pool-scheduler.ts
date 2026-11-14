export interface ScheduledWorkRequest {
  id: number;
  account: string | null;
  root: string;
  multiplier: number;
  priority: number;
  hinted: boolean;
}

/** Owns queue ordering, account fairness, and request requeue policy. */
export class WorkPoolScheduler<Request extends ScheduledWorkRequest> {
  private readonly requests: Request[] = [];
  private readonly lastServed = new Map<string | null, number>();
  private dispatchSequence = 0;

  get size(): number {
    return this.requests.length;
  }

  find(predicate: (request: Request) => boolean): Request | undefined {
    return this.requests.find(predicate);
  }

  enqueue(request: Request): boolean {
    const duplicate = this.requests.some(item =>
      item.root === request.root && item.account === request.account && item.multiplier === request.multiplier &&
      item.hinted === request.hinted);
    if (duplicate) return false;
    this.requests.push(request);
    this.sortByPriority();
    return true;
  }

  reprioritize(request: Request, priority: number): void {
    request.priority = priority;
    this.sortByPriority();
  }

  /** Put a failed worker request ahead of queued work for its retry. */
  retryAtFront(request: Request): void {
    this.requests.unshift(request);
  }

  /** Resume a preempted request using its original priority. */
  requeue(request: Request): void {
    this.requests.push(request);
    this.sortByPriority();
  }

  removeWhere(predicate: (request: Request) => boolean): Request[] {
    const removed: Request[] = [];
    let writeIndex = 0;
    for (const request of this.requests) {
      if (predicate(request)) {
        removed.push(request);
      } else {
        this.requests[writeIndex++] = request;
      }
    }
    this.requests.length = writeIndex;
    return removed;
  }

  clear(): Request[] {
    return this.removeWhere(() => true);
  }

  /**
   * Returns the next runnable request. Preparation may resolve a cache hit or
   * discard an expired hint; only dispatched work advances account fairness.
   */
  takeNext(prepare: (request: Request) => boolean): Request | null {
    while (this.requests.length > 0) {
      this.requests.sort((a, b) => b.priority - a.priority ||
        (this.lastServed.get(a.account) ?? 0) - (this.lastServed.get(b.account) ?? 0) || a.id - b.id);
      const candidate = this.requests.shift()!;
      if (!prepare(candidate)) continue;
      this.lastServed.set(candidate.account, ++this.dispatchSequence);
      return candidate;
    }
    return null;
  }

  private sortByPriority(): void {
    this.requests.sort((a, b) => b.priority - a.priority);
  }
}
