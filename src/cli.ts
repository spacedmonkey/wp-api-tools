#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { stringify as yamlStringify } from 'yaml';
import { prependHTTPS } from '@wordpress/url';
import { discover } from './discovery.js';
import { groupResources, namespacesOf, normalizeRoutes, resourcesForNamespace } from './routes.js';
import { buildApiSchema } from './schema.js';
import { resolveCredentials } from './auth.js';
import { browse, EXIT } from './prompts/browser.js';
import { buildRequest } from './prompts/requestBuilder.js';
import { paginate } from './prompts/pagination.js';
import { send } from './client.js';
import { formatOutput } from './format.js';
import { printError, UsageError } from './errors.js';
import type { OutputFormat } from './types.js';

interface CliOptions {
  url: string;
  username?: string;
  password?: string;
  token?: string;
  format: string;
  fields?: string;
  schema?: boolean;
  full?: boolean;
}

const program = new Command();
program
  .name('wp-api-tools')
  .description("Interactively browse and query any WordPress site's REST API")
  .requiredOption('--url <url>', 'WordPress site URL')
  .option('--username <username>', 'Username for Basic Auth (WordPress Application Passwords)')
  .option('--password <password>', 'Password for Basic Auth (omit to be prompted securely)')
  .option('--token <token>', 'OAuth2/Bearer token for Authorization header (alternative to --username/--password)')
  .option('--format <format>', 'Output format: table, json, or yaml', 'table')
  .option('--fields <fields>', 'Comma-separated list of fields/columns to show')
  .option('--full', "Don't strip HTML or truncate long cell values in table output")
  .option(
    '--schema',
    "Print the site's full discovered API (namespaces, resources, verbs, arg schemas) as JSON/YAML and exit — for AI agents/tooling to introspect"
  )
  .parse(process.argv);

async function main(): Promise<void> {
  const opts = program.opts<CliOptions>();

  if (opts.password && !opts.username) {
    throw new UsageError('--password requires --username to also be set.');
  }
  if (opts.token && (opts.username || opts.password)) {
    throw new UsageError('--token cannot be combined with --username/--password.');
  }
  if (!['table', 'json', 'yaml'].includes(opts.format)) {
    throw new UsageError(`Invalid --format "${opts.format}". Expected one of: table, json, yaml.`);
  }
  const format = opts.format as OutputFormat;
  const fields = opts.fields
    ? opts.fields
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    : undefined;

  let baseUrl: URL;
  try {
    baseUrl = new URL(prependHTTPS(opts.url));
  } catch {
    throw new UsageError(`Invalid URL: ${opts.url}`);
  }
  const normalizedUrl = baseUrl.toString().replace(/\/+$/, '');

  const credentials = await resolveCredentials(opts.username, opts.password, opts.token);

  const spinner = ora(`Discovering REST API at ${normalizedUrl} ...`).start();
  const { index, apiRoot } = await discover(normalizedUrl).catch((err) => {
    spinner.fail('Discovery failed');
    throw err;
  });
  const routes = normalizeRoutes(index);
  spinner.succeed(`Found ${routes.length} routes at ${apiRoot}`);

  if (opts.schema) {
    const schema = buildApiSchema(routes, apiRoot, normalizedUrl);
    console.log(format === 'yaml' ? yamlStringify(schema).trimEnd() : JSON.stringify(schema, null, 2));
    return;
  }

  const resources = groupResources(routes);
  const namespaces = namespacesOf(routes);

  for (;;) {
    const resource = await browse(namespaces, (ns) => resourcesForNamespace(resources, ns));
    if (resource === EXIT) break;

    const built = await buildRequest(resource, apiRoot, credentials);
    if (!built) continue;

    const requestSpinner = ora(`${built.method} ${built.url}`).start();
    try {
      const result = await send({
        method: built.method,
        url: built.url,
        query: built.query,
        body: built.body,
        headers: built.headers,
      });
      requestSpinner.succeed(`${built.method} ${result.status}`);
      console.log(formatOutput(result.data, format, fields, { truncate: !opts.full }));

      if (built.method === 'GET' && Array.isArray(result.data) && result.headers.has('x-wp-total')) {
        await paginate(result.url, built.headers, format, fields, result.headers, { truncate: !opts.full });
      }
    } catch (err) {
      requestSpinner.fail(`${built.method} failed`);
      printError(err);
    }
    console.error();
  }
}

main().catch((err) => {
  printError(err);
  process.exit(1);
});
