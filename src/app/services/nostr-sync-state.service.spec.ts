import { NostrSyncStateService, NostrSyncState } from "./nostr-sync-state.service";

const featureDescribe = FEATURE_NANONYMS ? describe : (globalThis as any).xdescribe;

function fakeTimers<T extends (...args: any[]) => any>(work: T): (...args: Parameters<T>) => ReturnType<T> {
  return (...args: Parameters<T>) => {
    vi.useFakeTimers();
    try {
      return work(...args);
    } finally {
      vi.useRealTimers();
    }
  };
}

featureDescribe("NostrSyncStateService", () => {
  let service: NostrSyncStateService;

  beforeEach(() => {
    localStorage.clear();
    // This service has no injected dependencies, so direct construction keeps
    // each test's in-memory cache isolated across runners.
    service = new NostrSyncStateService();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("getState", () => {
    it("should return null for non-existent state", () => {
      const state = service.getState(0);
      expect(state).toBeNull();
    });

    it("should load state from localStorage", () => {
      const storedState: NostrSyncState = {
        lastSeenTimestamp: 1700000000,
        lastSeenEventId: "abc123",
        processedEventIds: ["abc123", "def456"],
        updatedAt: 1700000001000,
      };
      localStorage.setItem("nostr_sync_0", JSON.stringify(storedState));

      const state = service.getState(0);

      expect(state).not.toBeNull();
      expect(state!.lastSeenTimestamp).toBe(1700000000);
      expect(state!.lastSeenEventId).toBe("abc123");
      expect(state!.processedEventIds.length).toBe(2);
    });

    it("should cache state after first load", () => {
      const storedState: NostrSyncState = {
        lastSeenTimestamp: 1700000000,
        lastSeenEventId: "abc123",
        processedEventIds: ["abc123"],
        updatedAt: 1700000001000,
      };
      localStorage.setItem("nostr_sync_0", JSON.stringify(storedState));

      const getItemSpy = vi.spyOn(Storage.prototype, "getItem");

      service.getState(0);
      service.getState(0);

      expect(getItemSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateState", () => {
    it("should create new state for fresh NanoNym", fakeTimers(() => {
      service.updateState(0, "event123", 1700000000);
      vi.advanceTimersByTime(1100);

      const savedState = JSON.parse(localStorage.getItem("nostr_sync_0")!);
      expect(savedState.lastSeenTimestamp).toBe(1700000000);
      expect(savedState.lastSeenEventId).toBe("event123");
      expect(savedState.processedEventIds).toContain("event123");
    }));

    it("should update lastSeen only for newer events", fakeTimers(() => {
      service.updateState(0, "older", 1700000000);
      vi.advanceTimersByTime(1100);
      service.updateState(0, "newer", 1700000100);
      vi.advanceTimersByTime(1100);

      const state = service.getState(0);
      expect(state!.lastSeenTimestamp).toBe(1700000100);
      expect(state!.lastSeenEventId).toBe("newer");
    }));

    it("should not update lastSeen for older events", fakeTimers(() => {
      service.updateState(0, "newer", 1700000100);
      vi.advanceTimersByTime(1100);
      service.updateState(0, "older", 1700000000);
      vi.advanceTimersByTime(1100);

      const state = service.getState(0);
      expect(state!.lastSeenTimestamp).toBe(1700000100);
      expect(state!.lastSeenEventId).toBe("newer");
    }));

    it("should add event to processedEventIds", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      service.updateState(0, "event2", 1700000001);
      vi.advanceTimersByTime(1100);

      const state = service.getState(0);
      expect(state!.processedEventIds).toContain("event1");
      expect(state!.processedEventIds).toContain("event2");
    }));

    it("should not duplicate event IDs", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      service.updateState(0, "event1", 1700000000);
      vi.advanceTimersByTime(1100);

      const state = service.getState(0);
      const count = state!.processedEventIds.filter((id) => id === "event1").length;
      expect(count).toBe(1);
    }));

    it("should enforce rolling window of 1000 event IDs", fakeTimers(() => {
      for (let i = 0; i < 1005; i++) {
        service.updateState(0, `event${i}`, 1700000000 + i);
      }
      vi.advanceTimersByTime(1100);

      const state = service.getState(0);
      expect(state!.processedEventIds.length).toBe(1000);
      expect(state!.processedEventIds).not.toContain("event0");
      expect(state!.processedEventIds).not.toContain("event4");
      expect(state!.processedEventIds).toContain("event5");
      expect(state!.processedEventIds).toContain("event1004");
    }));

    it("should debounce persistence", fakeTimers(() => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      service.updateState(0, "event1", 1700000000);
      service.updateState(0, "event2", 1700000001);
      service.updateState(0, "event3", 1700000002);

      expect(setItemSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1100);

      expect(setItemSpy).toHaveBeenCalledTimes(1);
    }));
  });

  describe("isEventProcessed", () => {
    it("should return false for non-existent state", () => {
      expect(service.isEventProcessed(0, "event123")).toBe(false);
    });

    it("should return false for unprocessed event", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      vi.advanceTimersByTime(1100);

      expect(service.isEventProcessed(0, "event2")).toBe(false);
    }));

    it("should return true for processed event", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      vi.advanceTimersByTime(1100);

      expect(service.isEventProcessed(0, "event1")).toBe(true);
    }));
  });

  describe("getLastSeenTimestamp", () => {
    it("should return null for non-existent state", () => {
      expect(service.getLastSeenTimestamp(0)).toBeNull();
    });

    it("should return timestamp for existing state", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      vi.advanceTimersByTime(1100);

      expect(service.getLastSeenTimestamp(0)).toBe(1700000000);
    }));
  });

  describe("clearState", () => {
    it("should remove state from cache and localStorage", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      vi.advanceTimersByTime(1100);

      const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");
      service.clearState(0);

      expect(service.getState(0)).toBeNull();
      expect(removeItemSpy).toHaveBeenCalledWith("nostr_sync_0");
    }));
  });

  describe("clearAll", () => {
    it("should clear all states", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      service.updateState(1, "event2", 1700000001);
      vi.advanceTimersByTime(1100);

      service.clearAll();

      expect(localStorage.getItem("nostr_sync_0")).toBeNull();
      expect(localStorage.getItem("nostr_sync_1")).toBeNull();
    }));
  });

  describe("persistNow", () => {
    it("should persist immediately without debounce", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

      service.updateState(0, "event1", 1700000000);
      service.persistNow(0);

      const persistedCall = setItemSpy.mock.calls.find(
        ([key, value]) => key === "nostr_sync_0" && typeof value === "string",
      );
      expect(persistedCall).toBeDefined();
      expect(localStorage.getItem("nostr_sync_0")).toBeTruthy();
    });
  });

  describe("per-NanoNym isolation", () => {
    it("should maintain separate state per NanoNym", fakeTimers(() => {
      service.updateState(0, "event0", 1700000000);
      service.updateState(1, "event1", 1700000100);
      vi.advanceTimersByTime(1100);

      expect(service.getLastSeenTimestamp(0)).toBe(1700000000);
      expect(service.getLastSeenTimestamp(1)).toBe(1700000100);
      expect(service.isEventProcessed(0, "event0")).toBe(true);
      expect(service.isEventProcessed(0, "event1")).toBe(false);
      expect(service.isEventProcessed(1, "event0")).toBe(false);
      expect(service.isEventProcessed(1, "event1")).toBe(true);
    }));
  });

  describe("Integration: Cross-Session Persistence", () => {
    it("should persist state to localStorage and survive service recreation", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      service.updateState(0, "event2", 1700000100);
      vi.advanceTimersByTime(1100);

      const storedJson = localStorage.getItem("nostr_sync_0");
      expect(storedJson).toBeTruthy();

      const newService = new NostrSyncStateService();

      const restoredState = newService.getState(0);
      expect(restoredState).not.toBeNull();
      expect(restoredState!.lastSeenTimestamp).toBe(1700000100);
      expect(restoredState!.lastSeenEventId).toBe("event2");
      expect(restoredState!.processedEventIds).toContain("event1");
      expect(restoredState!.processedEventIds).toContain("event2");
    }));

    it("should maintain dedup across service restarts", fakeTimers(() => {
      service.updateState(0, "event_abc", 1700000000);
      vi.advanceTimersByTime(1100);

      const newService = new NostrSyncStateService();

      expect(newService.isEventProcessed(0, "event_abc")).toBe(true);
      expect(newService.isEventProcessed(0, "event_xyz")).toBe(false);
    }));

    it("should correctly restore lastSeenTimestamp for cold recovery calculations", fakeTimers(() => {
      const baseTimestamp = 1700000000;
      service.updateState(0, "first", baseTimestamp);
      service.updateState(0, "second", baseTimestamp + 100);
      service.updateState(0, "third", baseTimestamp + 200);
      vi.advanceTimersByTime(1100);

      const newService = new NostrSyncStateService();

      const lastSeen = newService.getLastSeenTimestamp(0);
      expect(lastSeen).toBe(baseTimestamp + 200);
    }));

    it("should handle cache invalidation correctly", fakeTimers(() => {
      service.updateState(0, "event1", 1700000000);
      vi.advanceTimersByTime(1100);

      expect(service.isEventProcessed(0, "event1")).toBe(true);

      service.clearState(0);

      expect(service.getState(0)).toBeNull();
      expect(service.isEventProcessed(0, "event1")).toBe(false);

      const newService = new NostrSyncStateService();
      expect(newService.getState(0)).toBeNull();
    }));

    it("should preserve rolling window state across restarts", fakeTimers(() => {
      for (let i = 0; i < 50; i++) {
        service.updateState(0, `event_${i}`, 1700000000 + i);
      }
      vi.advanceTimersByTime(1100);

      const newService = new NostrSyncStateService();
      const restoredState = newService.getState(0);

      expect(restoredState!.processedEventIds.length).toBe(50);
      expect(restoredState!.processedEventIds).toContain("event_0");
      expect(restoredState!.processedEventIds).toContain("event_49");
    }));
  });
});
