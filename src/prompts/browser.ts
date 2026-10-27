import prompts from 'prompts';
import chalk from 'chalk';
import type { Resource } from '../types.js';

export const EXIT = Symbol('exit');
const BACK = Symbol('back');

function fuzzySelect<T>(
  message: string,
  choices: { title: string; value: T }[]
): Promise<T | undefined> {
  return prompts(
    {
      type: 'autocomplete',
      name: 'value',
      message,
      choices,
      suggest: (input, allChoices) =>
        Promise.resolve(allChoices.filter((c) => c.title.toLowerCase().includes(input.toLowerCase()))),
    },
    { onCancel: () => process.exit(0) }
  ).then((r) => r.value as T | undefined);
}

export async function browse(
  namespaces: string[],
  resourcesForNamespace: (namespace: string) => Resource[]
): Promise<Resource | typeof EXIT> {
  for (;;) {
    const namespace = await fuzzySelect<string | typeof EXIT>('Choose a namespace', [
      { title: chalk.dim('Exit'), value: EXIT },
      ...namespaces.map((ns) => ({ title: ns || '(no namespace)', value: ns })),
    ]);
    if (namespace === undefined || namespace === EXIT) return EXIT;

    const resources = resourcesForNamespace(namespace);
    const resource = await fuzzySelect<Resource | typeof BACK>(`${namespace || '(no namespace)'} — choose a resource`, [
      { title: chalk.dim('‹ Back to namespaces'), value: BACK },
      ...resources.map((r) => ({
        title: `${chalk.cyan(r.actions.map((a) => a.verb).join(', ').padEnd(24))} ${r.key || '/'}`,
        value: r,
      })),
    ]);
    if (resource === undefined || resource === BACK) continue;
    return resource as Resource;
  }
}
