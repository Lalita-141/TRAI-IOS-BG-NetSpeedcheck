import { NativeModules, Platform } from 'react-native';

/**
 * Who requested a network test. Background monitoring, manual "Test Now",
 * continuous sessions and scheduled runs are independent features that can be
 * active at the same time, but only ONE network test may run at any moment:
 * two parallel download/upload tests would share the radio and corrupt each
 * other's throughput numbers.
 */
export type TestOwner = 'monitor' | 'manual' | 'continuous' | 'scheduled';

export interface CoordinatorStatus {
  activeOwner: TestOwner | null;
  queuedCount: number;
}

type CoordinatorListener = (status: CoordinatorStatus) => void;

// Upper bound for one JS test. The native iOS monitor skips its own tests while
// this lease is held; if JS gets suspended mid-test the lease simply expires.
const NATIVE_LEASE_SECONDS = 120;

function setNativeLease(seconds: number) {
  if (Platform.OS !== 'ios') return;
  const bridge = NativeModules.NativeMonitorBridge;
  if (bridge && typeof bridge.setJsTestLease === 'function') {
    bridge.setJsTestLease(seconds).catch(() => {});
  }
}

class TestCoordinator {
  private queue: Promise<void> = Promise.resolve();
  private activeOwner: TestOwner | null = null;
  private queuedCount = 0;
  private lastFullTestAt = 0;
  private lastFullTestOwner: TestOwner | null = null;
  private listeners: Set<CoordinatorListener> = new Set();

  isBusy(): boolean {
    return this.activeOwner !== null || this.queuedCount > 0;
  }

  getActiveOwner(): TestOwner | null {
    return this.activeOwner;
  }

  /**
   * Runs `fn` exclusively. If another test is in progress the call waits (FIFO)
   * until it finishes.
   */
  run<T>(owner: TestOwner, fn: () => Promise<T>): Promise<T> {
    this.queuedCount++;
    this.notify();
    const result = this.queue.then(async () => {
      this.queuedCount--;
      this.activeOwner = owner;
      this.notify();
      setNativeLease(NATIVE_LEASE_SECONDS);
      try {
        return await fn();
      } finally {
        this.activeOwner = null;
        setNativeLease(0);
        this.notify();
      }
    });
    this.queue = result.then(
      () => {},
      () => {}
    );
    return result;
  }

  /**
   * Records that a full speed test (ping + download + upload) just completed.
   * Other features use this to collapse duplicate tests.
   */
  markFullTestCompleted(owner: TestOwner) {
    this.lastFullTestAt = Date.now();
    this.lastFullTestOwner = owner;
  }

  getLastFullTest(): { at: number; owner: TestOwner | null } {
    return { at: this.lastFullTestAt, owner: this.lastFullTestOwner };
  }

  subscribe(listener: CoordinatorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const status: CoordinatorStatus = {
      activeOwner: this.activeOwner,
      queuedCount: this.queuedCount,
    };
    this.listeners.forEach(fn => {
      try {
        fn(status);
      } catch (e) {
        console.warn('Listener error in TestCoordinator:', e);
      }
    });
  }
}

export const testCoordinator = new TestCoordinator();
