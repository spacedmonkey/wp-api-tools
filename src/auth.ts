import prompts from 'prompts';
import type { AuthCredentials } from './types.js';
import { UsageError } from './errors.js';

export function authHeader(creds: AuthCredentials): string {
  if (creds.type === 'bearer') return `Bearer ${creds.token}`;
  return `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`;
}

export async function resolveCredentials(
  username: string | undefined,
  password: string | undefined,
  token: string | undefined
): Promise<AuthCredentials | undefined> {
  if (token) return { type: 'bearer', token };
  if (!username) return undefined;
  if (password) return { type: 'basic', username, password };

  const response = await prompts({
    type: 'password',
    name: 'password',
    message: `Password for ${username}:`,
  });

  if (!response.password) {
    throw new UsageError('A password is required when --username is provided.');
  }
  return { type: 'basic', username, password: response.password };
}
