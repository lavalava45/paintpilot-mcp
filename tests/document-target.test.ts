import { describe, expect, it } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  bindPinnedDocumentId,
  DOCUMENT_ID_SCHEMA_EXCLUDES,
  parseDocumentIdArg,
  runWithDocumentId,
  wrapDocumentIdHandler,
  withOptionalDocumentId,
} from '../src/core/document-target.js';

function fakeTool(name: string, properties: Record<string, unknown> = {}): Tool {
  return {
    name,
    description: 'test',
    inputSchema: { type: 'object', properties },
  };
}

describe('withOptionalDocumentId', () => {
  it('injects document_id on mutating tools', () => {
    const next = withOptionalDocumentId(fakeTool('photoshop_delete_layer'));
    const schema = next.inputSchema as { properties: Record<string, { type: string }> };
    expect(schema.properties.document_id.type).toBe('number');
  });

  it('does not inject on excluded tools', () => {
    for (const name of DOCUMENT_ID_SCHEMA_EXCLUDES) {
      const next = withOptionalDocumentId(fakeTool(name));
      const schema = next.inputSchema as { properties: Record<string, unknown> };
      expect(schema.properties.document_id).toBeUndefined();
    }
  });

  it('does not overwrite an existing document_id property', () => {
    const next = withOptionalDocumentId(
      fakeTool('photoshop_export_layers', {
        document_id: { type: 'string', description: 'already there' },
      })
    );
    const schema = next.inputSchema as { properties: Record<string, { type: string }> };
    expect(schema.properties.document_id.type).toBe('string');
  });
});

describe('parseDocumentIdArg', () => {
  it('accepts positive integers and rejects fractional or non-positive numbers', () => {
    expect(parseDocumentIdArg({ document_id: 12 })).toBe(12);
    expect(() => parseDocumentIdArg({ document_id: 12.9 })).toThrow('positive integer');
    expect(() => parseDocumentIdArg({ document_id: 0 })).toThrow('positive integer');
    expect(() => parseDocumentIdArg({ document_id: -1 })).toThrow('positive integer');
  });

  it('treats omission as optional and rejects explicitly invalid non-numbers', () => {
    expect(parseDocumentIdArg({})).toBeUndefined();
    expect(() => parseDocumentIdArg({ document_id: '1' })).toThrow('positive integer');
    expect(() => parseDocumentIdArg({ document_id: Number.NaN })).toThrow('positive integer');
  });
});

describe('request-scoped document dispatch targeting', () => {
  it('injects the pinned id into internal dispatch args and rejects retargeting', () => {
    const injected = runWithDocumentId(42, () => bindPinnedDocumentId({ opacity: 50 }));
    expect(injected).toEqual({ opacity: 50, document_id: 42 });

    const repeated = runWithDocumentId(42, () =>
      bindPinnedDocumentId({ document_id: 42, opacity: 50 })
    );
    expect(repeated).toEqual({ document_id: 42, opacity: 50 });

    expect(() =>
      runWithDocumentId(42, () =>
        bindPinnedDocumentId({ document_id: 84, opacity: 50 })
      )
    ).toThrow('document_target_mismatch');
  });

  it('inherits an outer pinned target for nested registry handlers and refuses retargeting', async () => {
    const seen: Array<number | undefined> = [];
    const nested = wrapDocumentIdHandler(
      'photoshop_set_layer_opacity',
      async () => {
        seen.push(bindPinnedDocumentId({}).document_id as number | undefined);
        return { content: [{ type: 'text', text: 'ok' }] };
      }
    );

    await runWithDocumentId(42, () => nested({ opacity: 50 }));
    expect(seen).toEqual([42]);

    const rejected = await runWithDocumentId(42, () =>
      nested({ document_id: 84, opacity: 50 })
    );
    expect(rejected.isError).toBe(true);
    expect((rejected.content[0] as { text: string }).text).toContain(
      'does not match inherited pinned document_id 42'
    );
    expect(seen).toEqual([42]);
  });
});
