import type { PromptObject } from 'prompts';
import type { WpArgSchema } from '../types.js';

export function schemaToPrompt(name: string, schema: WpArgSchema): PromptObject {
  const required = !!schema.required;
  const labelBase = schema.description ? `${name} — ${schema.description}` : name;
  const message = required ? `${labelBase} (required)` : `${labelBase} (optional)`;

  if (schema.enum && schema.enum.length > 0) {
    return {
      type: 'select',
      name,
      message,
      choices: schema.enum.map((value) => ({ title: String(value), value })),
    };
  }

  switch (schema.type) {
    case 'boolean':
      return { type: 'confirm', name, message, initial: Boolean(schema.default) };
    case 'integer':
    case 'number':
      return {
        type: 'number',
        name,
        message,
        initial: typeof schema.default === 'number' ? schema.default : undefined,
        validate: (value) => (required && (value === undefined || value === '') ? 'This field is required' : true),
      };
    case 'array':
      return {
        type: 'list',
        name,
        message: `${message} (comma-separated)`,
        separator: ',',
      };
    case 'object':
      return {
        type: 'text',
        name,
        message: `${message} (raw JSON object)`,
      };
    default:
      return {
        type: 'text',
        name,
        message,
        initial: typeof schema.default === 'string' ? schema.default : undefined,
        validate: (value) => (required && !value ? 'This field is required' : true),
      };
  }
}
