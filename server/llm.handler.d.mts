import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Types for the plain-JS proxy handler, so `vite.config.ts` can import it
 * under `tsc -b` without the server itself needing a build step.
 */

export type LlmEnv = Record<string, string | undefined>;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  pathsPerBatch: number;
}

export declare function readLlmConfig(env: LlmEnv): LlmConfig;

export declare function createLlmHandler(
  env: LlmEnv,
): (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void,
) => void;
