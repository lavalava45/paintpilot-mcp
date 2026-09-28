export type AssetArgs = Record<string, unknown>;

export function assetDocumentTarget(args: AssetArgs): Record<string, number> {
  const value = args.document_id;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? { document_id: value }
    : {};
}

export function optionalLayerName(args: AssetArgs): string | undefined {
  if (typeof args.layer_name !== 'string') return undefined;
  const name = args.layer_name.trim();
  return name.length > 0 ? name : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
