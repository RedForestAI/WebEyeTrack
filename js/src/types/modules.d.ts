/**
 * Type declarations for webpack module loaders and external modules.
 * This file provides TypeScript support for non-standard module imports.
 */

/**
 * Declaration for worker-loader with query parameters.
 * Supports webpack worker-loader syntax like: worker-loader?inline=no-fallback!./Worker.ts
 *
 * @see https://github.com/webpack-contrib/worker-loader
 */
declare module 'worker-loader?*' {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}

/**
 * Fallback declaration for standard worker-loader imports.
 */
declare module 'worker-loader!*' {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}

/**
 * Worker global scope declarations.
 * Provides types for Worker-specific APIs like importScripts.
 */
declare function importScripts(...urls: string[]): void;
