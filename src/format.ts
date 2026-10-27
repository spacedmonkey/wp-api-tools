import Table from 'cli-table3';
import chalk from 'chalk';
import { stringify as yamlStringify } from 'yaml';
import { flatten } from 'flat';
import type { OutputFormat } from './types.js';

export interface FormatOptions {
  /** When false, disables HTML-stripping/truncation of table cell text. Default true. */
  truncate?: boolean;
}

const DEFAULT_EXCLUDED_FIELDS = new Set(['_links', '_embedded', 'guid']);
const MAX_CELL_LENGTH = 80;
const FLATTEN_MAX_DEPTH = 3;

export function formatOutput(
  data: unknown,
  format: OutputFormat,
  fields?: string[],
  options: FormatOptions = {}
): string {
  const filtered = filterFields(data, fields);
  switch (format) {
    case 'json':
      return colorizeJson(JSON.stringify(filtered, null, 2));
    case 'yaml':
      return yamlStringify(filtered).trimEnd();
    case 'table':
    default:
      return renderTable(filtered, { excludeDefaults: !fields, truncate: options.truncate !== false });
  }
}

export function filterFields(data: unknown, fields?: string[]): unknown {
  if (!fields || fields.length === 0) return data;
  const pick = (item: unknown): unknown => {
    if (typeof item !== 'object' || item === null) return item;
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      out[field] = (item as Record<string, unknown>)[field];
    }
    return out;
  };
  return Array.isArray(data) ? data.map(pick) : pick(data);
}

interface RenderOptions {
  excludeDefaults: boolean;
  truncate: boolean;
}

function prepareRow(item: unknown, opts: RenderOptions): Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return {};
  const source = opts.excludeDefaults
    ? Object.fromEntries(
        Object.entries(item as Record<string, unknown>).filter(([key]) => !DEFAULT_EXCLUDED_FIELDS.has(key))
      )
    : (item as Record<string, unknown>);
  return flatten<Record<string, unknown>, Record<string, unknown>>(source, {
    delimiter: '.',
    maxDepth: FLATTEN_MAX_DEPTH,
    safe: true,
  });
}

function renderTable(data: unknown, opts: RenderOptions): string {
  const terminalWidth = process.stdout.columns || 100;

  if (Array.isArray(data)) {
    if (data.length === 0) return chalk.dim('(empty array)');
    const rows = data.map((item) => prepareRow(item, opts));
    const columns = collectColumns(rows);
    // Cell text is already length-capped by stringifyCell (unless --full), so
    // columns auto-size to their (short) content; wordWrap protects the --full case.
    const table = new Table({ head: columns.map((c) => chalk.bold(c)), wordWrap: true });
    for (const row of rows) {
      table.push(columns.map((c) => stringifyCell(row[c], opts.truncate)));
    }
    return table.toString();
  }
  if (typeof data === 'object' && data !== null) {
    const row = prepareRow(data, opts);
    const valueWidth = Math.max(terminalWidth - 24 - 6, 40);
    const table = new Table({ wordWrap: true, colWidths: [24, valueWidth] });
    for (const [key, value] of Object.entries(row)) {
      table.push([chalk.bold(key), stringifyCell(value, opts.truncate)]);
    }
    return table.toString();
  }
  return String(data);
}

function collectColumns(rows: Record<string, unknown>[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

const STRIP_TAGS_RE = /<[^>]*>/g;
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const codePoint = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Cleans WP REST `.rendered`-style text for display: strips markup, decodes entities, collapses whitespace. */
function cleanText(value: string): string {
  const withoutTags = STRIP_TAGS_RE.test(value) ? value.replace(STRIP_TAGS_RE, ' ') : value;
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd() + chalk.dim('…');
}

function stringifyCell(value: unknown, shouldTruncate: boolean): string {
  if (value === undefined) return chalk.dim('—');
  if (value === null) return chalk.dim('null');

  if (typeof value === 'string') {
    if (!shouldTruncate) return value;
    return truncate(cleanText(value), MAX_CELL_LENGTH);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return chalk.dim('[]');
    if (value.every((v) => typeof v !== 'object' || v === null)) {
      const joined = value.join(', ');
      return shouldTruncate ? truncate(joined, MAX_CELL_LENGTH) : joined;
    }
    return chalk.dim(`[${value.length} item${value.length === 1 ? '' : 's'}]`);
  }

  if (typeof value === 'object') {
    const keyCount = Object.keys(value as Record<string, unknown>).length;
    if (keyCount === 0) return chalk.dim('{}');
    return chalk.dim(`{${keyCount} key${keyCount === 1 ? '' : 's'}}`);
  }

  return String(value);
}

const JSON_TOKEN_RE =
  /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function colorizeJson(json: string): string {
  return json.replace(JSON_TOKEN_RE, (match) => {
    if (match.startsWith('"')) {
      return match.endsWith(':') ? chalk.cyan(match) : chalk.green(match);
    }
    if (match === 'true' || match === 'false') return chalk.yellow(match);
    if (match === 'null') return chalk.gray(match);
    return chalk.magenta(match);
  });
}
