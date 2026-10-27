import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import { addQueryArgs } from '@wordpress/url';
import { send } from '../client.js';
import { formatOutput, type FormatOptions } from '../format.js';
import { printError } from '../errors.js';
import type { OutputFormat, PaginationInfo } from '../types.js';

function readPagination(headers: Headers, currentPage: number): PaginationInfo {
  const total = headers.get('x-wp-total');
  const totalPages = headers.get('x-wp-totalpages');
  return {
    total: total ? Number(total) : null,
    totalPages: totalPages ? Number(totalPages) : null,
    currentPage,
  };
}

export async function paginate(
  firstUrl: string,
  headers: Record<string, string>,
  format: OutputFormat,
  fields: string[] | undefined,
  firstResponseHeaders: Headers,
  formatOptions?: FormatOptions
): Promise<void> {
  let pagination = readPagination(firstResponseHeaders, 1);
  let url = firstUrl;

  while (pagination.totalPages && pagination.totalPages > 1) {
    console.log(
      chalk.dim(
        `Page ${pagination.currentPage} of ${pagination.totalPages}` +
          (pagination.total !== null ? ` (${pagination.total} total items)` : '')
      )
    );

    const choices = [
      { title: 'Done', value: 'done' },
      ...(pagination.currentPage > 1 ? [{ title: 'Previous page', value: 'prev' }] : []),
      ...(pagination.currentPage < pagination.totalPages ? [{ title: 'Next page', value: 'next' }] : []),
      { title: 'Jump to page…', value: 'jump' },
    ];

    const { action } = await prompts({ type: 'select', name: 'action', message: 'Pagination', choices });
    if (!action || action === 'done') return;

    let targetPage = pagination.currentPage;
    if (action === 'next') {
      targetPage += 1;
    } else if (action === 'prev') {
      targetPage -= 1;
    } else if (action === 'jump') {
      const { page } = await prompts({
        type: 'number',
        name: 'page',
        message: `Page number (1-${pagination.totalPages})`,
        min: 1,
        max: pagination.totalPages,
      });
      if (!page) continue;
      targetPage = page;
    }

    const nextUrl = addQueryArgs(url, { page: targetPage });
    const spinner = ora(`Fetching page ${targetPage} ...`).start();
    try {
      const result = await send({ method: 'GET', url: nextUrl, headers });
      spinner.succeed(`Page ${targetPage} — ${result.status}`);
      console.log(formatOutput(result.data, format, fields, formatOptions));
      pagination = readPagination(result.headers, targetPage);
      url = result.url;
    } catch (err) {
      spinner.fail(`Page ${targetPage} failed`);
      printError(err);
      return;
    }
  }
}
