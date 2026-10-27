import prompts from 'prompts';
import chalk from 'chalk';
import type { AuthCredentials, Resource } from '../types.js';
import { extractPathParams, findVariantForMethod, isNumericParam, renderPath } from '../routes.js';
import { schemaToPrompt } from './fieldPrompt.js';
import { authHeader } from '../auth.js';
import { buildRouteUrl } from '../client.js';

export interface BuiltRequest {
  method: string;
  url: string;
  query: Record<string, unknown>;
  body?: unknown;
  headers: Record<string, string>;
}

export async function buildRequest(
  resource: Resource,
  apiRoot: string,
  credentials: AuthCredentials | undefined
): Promise<BuiltRequest | undefined> {
  let action = resource.actions[0]!;
  if (resource.actions.length > 1) {
    const choices = resource.actions.map((a) => ({ title: `${a.verb} (${a.method})`, value: a }));
    const { chosenAction } = await prompts({
      type: 'select',
      name: 'chosenAction',
      message: 'Choose an action',
      choices,
    });
    if (!chosenAction) return undefined;
    action = chosenAction;
  }

  const { route, method } = action;
  const variant = findVariantForMethod(route, method);
  const pathParamNames = extractPathParams(route.path);
  const pathValues: Record<string, string> = {};

  for (const name of pathParamNames) {
    const numeric = isNumericParam(route.path, name);
    const answer = await prompts({
      type: numeric ? 'number' : 'text',
      name: 'value',
      message: `${name} (path parameter)`,
      validate: (v: unknown) => (v === undefined || v === '' ? 'This field is required' : true),
    });
    if (answer.value === undefined) return undefined;
    pathValues[name] = String(answer.value);
  }

  const argEntries = Object.entries(variant?.args ?? {}).filter(([name]) => !pathParamNames.includes(name));
  const requiredEntries = argEntries.filter(([, schema]) => schema.required);
  const optionalEntries = argEntries.filter(([, schema]) => !schema.required);

  const args: Record<string, unknown> = {};

  // Optional args are never prompted for — pre-fill their declared defaults
  // (if any) and let the raw-JSON escape hatch below cover anything else.
  for (const [name, schema] of optionalEntries) {
    if (schema.default !== undefined) {
      args[name] = schema.default;
    }
  }

  // Only required args are worth interrupting the user for.
  for (const [name, schema] of requiredEntries) {
    const question = schemaToPrompt(name, schema);
    const answer = await prompts(question);
    const value = answer[question.name as string];
    if (value === undefined) return undefined;
    args[name] = value;
  }

  const isBodyMethod = method === 'POST' || method === 'PUT' || method === 'PATCH';
  let body: unknown = isBodyMethod ? args : undefined;

  if (argEntries.length > 0 || isBodyMethod) {
    const optionalNote = optionalEntries.length > 0 ? ` (${optionalEntries.length} optional field(s) available)` : '';
    const { editRaw } = await prompts({
      type: 'confirm',
      name: 'editRaw',
      message: `Add or override fields via raw JSON?${optionalNote}`,
      initial: false,
    });
    if (editRaw) {
      const edited = await promptRawJson(isBodyMethod ? body : args);
      if (edited === undefined) return undefined;
      if (isBodyMethod) body = edited;
      else Object.assign(args, edited);
    }
  }

  const path = renderPath(route.path, pathValues);
  const url = buildRouteUrl(apiRoot, path);
  const headers: Record<string, string> = {};
  if (credentials) headers.Authorization = authHeader(credentials);

  return {
    method,
    url,
    query: isBodyMethod ? {} : args,
    body: isBodyMethod ? body : undefined,
    headers,
  };
}

async function promptRawJson(initial: unknown): Promise<unknown> {
  let text = JSON.stringify(initial ?? {}, null, 2);
  for (;;) {
    const response = await prompts({
      type: 'text',
      name: 'json',
      message: 'Raw JSON body',
      initial: text,
    });
    if (response.json === undefined) return undefined;
    try {
      return JSON.parse(response.json);
    } catch {
      console.error(chalk.red('Invalid JSON — please try again.'));
      text = response.json;
    }
  }
}
