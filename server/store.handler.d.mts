import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Types for the plain-JS persistence handler, so `vite.config.ts` can import
 * it under `tsc -b` without the server itself needing a build step.
 */

export type StoreEnv = Record<string, string | undefined>;

export declare function createStoreHandler(
  env: StoreEnv,
): (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void,
) => void;
