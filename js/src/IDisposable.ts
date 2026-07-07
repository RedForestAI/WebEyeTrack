/**
 * Interface for objects that manage resources requiring explicit cleanup.
 * Implement this interface for classes managing TensorFlow.js tensors,
 * event listeners, timers, media streams, or other resources that need disposal.
 */
export interface IDisposable {
  /**
   * Releases all resources held by this object.
   * After calling dispose(), the object should not be used.
   */
  dispose(): void;

  /**
   * Indicates whether dispose() has been called on this object.
   */
  readonly isDisposed: boolean;
}

/**
 * Abstract base class providing default disposal pattern implementation.
 * Prevents double-disposal and provides template method for cleanup logic.
 */
export abstract class DisposableResource implements IDisposable {
  private _disposed = false;

  /**
   * Public disposal method. Ensures cleanup happens only once.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this.onDispose();
    this._disposed = true;
  }

  /**
   * Override this method to implement cleanup logic.
   * This will be called exactly once when dispose() is invoked.
   */
  protected abstract onDispose(): void;

  /**
   * Returns true if dispose() has been called.
   */
  get isDisposed(): boolean {
    return this._disposed;
  }
}
