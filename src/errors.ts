import chalk from 'chalk';
import type { WpErrorResponse } from './types.js';

export class NetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly wpError?: WpErrorResponse
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ParseError extends Error {
  constructor(message: string, readonly status: number, readonly bodyPreview: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export function printError(err: unknown): void {
  if (err instanceof HttpError) {
    console.error(chalk.red.bold(`✗ ${err.status} ${err.code}`));
    console.error(chalk.red(err.message));
    return;
  }
  if (err instanceof DiscoveryError) {
    console.error(chalk.red.bold('✗ Discovery failed'));
    console.error(chalk.red(err.message));
    return;
  }
  if (err instanceof NetworkError) {
    console.error(chalk.red.bold('✗ Network error'));
    console.error(chalk.red(err.message));
    return;
  }
  if (err instanceof ParseError) {
    console.error(chalk.red.bold(`✗ Invalid response (status ${err.status})`));
    console.error(chalk.red(err.message));
    console.error(chalk.dim(err.bodyPreview));
    return;
  }
  if (err instanceof UsageError) {
    console.error(chalk.red.bold('✗ Usage error'));
    console.error(chalk.red(err.message));
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red.bold('✗ Unexpected error'));
  console.error(chalk.red(message));
}
