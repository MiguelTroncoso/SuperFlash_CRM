import { Injectable } from '@nestjs/common';

import { isJsonRecord } from '../automation.types';

const TOKEN_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)\s*\}\}/g;

export interface RenderedTemplate {
  value: string;
  variables: string[];
  missingVariables: string[];
}

export interface RenderedMessage {
  subject: RenderedTemplate | null;
  body: RenderedTemplate;
}

@Injectable()
export class TemplateRendererService {
  extractVariables(value: string | null | undefined): string[] {
    if (!value) return [];
    const variables = new Set<string>();
    for (const match of value.matchAll(TOKEN_PATTERN)) {
      const variable = match[1];
      if (variable) variables.add(variable);
    }
    return [...variables].sort();
  }

  renderMessage(
    subject: string | null | undefined,
    body: string,
    context: Record<string, unknown>,
  ): RenderedMessage {
    return {
      subject: subject === null || subject === undefined ? null : this.render(subject, context),
      body: this.render(body, context),
    };
  }

  render(value: string, context: Record<string, unknown>): RenderedTemplate {
    const variables = this.extractVariables(value);
    const missingVariables = new Set<string>();
    const rendered = value.replace(TOKEN_PATTERN, (_match, path: string) => {
      const resolved = this.resolvePath(context, path);
      if (resolved === undefined || resolved === null) {
        missingVariables.add(path);
        return '';
      }
      return this.formatValue(resolved);
    });
    return { value: rendered, variables, missingVariables: [...missingVariables].sort() };
  }

  interpolate(value: unknown, context: Record<string, unknown>): unknown {
    if (typeof value === 'string') return this.render(value, context).value;
    if (Array.isArray(value)) return value.map((item) => this.interpolate(item, context));
    if (isJsonRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.interpolate(item, context)]),
      );
    }
    return value;
  }

  resolvePath(context: Record<string, unknown>, path: string): unknown {
    let current: unknown = context;
    for (const segment of path.split('.')) {
      if (!isJsonRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
        return undefined;
      }
      current = current[segment];
    }
    return current;
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value) ?? '';
  }
}
