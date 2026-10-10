export interface ReviewContextImage {
  context_id: string;
  document_identity: string;
  sha256: string;
  operation_id: string;
  role: string;
  whole_sha256: string;
  brief_sha256?: string;
}

/** Optional bounded transport cache. Durable Guard receipts/verdicts remain authority. */
export class ReviewContextCache {
  private readonly entries = new Map<string, ReviewContextImage>();
  private readonly forced = new Set<string>();
  forcedKey(contextId: string | undefined, identity: string, operationId: string, sha: string, roles: string[]): string | undefined {
    return contextId ? JSON.stringify([contextId, identity, operationId, sha, [...roles].sort()]) : undefined;
  }
  wasForced(key: string | undefined): boolean { return !!key && this.forced.has(key); }
  rememberForced(key: string | undefined): void {
    if (!key) return; this.forced.add(key);
    while (this.forced.size > this.limit) this.forced.delete(this.forced.values().next().value!);
  }
  constructor(private readonly limit = 128) {}
  private key(entry: Pick<ReviewContextImage, 'context_id' | 'document_identity' | 'sha256'>): string {
    return JSON.stringify([entry.context_id, entry.document_identity, entry.sha256]);
  }
  image(contextId: string | undefined, identity: string, sha: string,
    confirmed: (entry: ReviewContextImage) => boolean): ReviewContextImage | undefined {
    if (!contextId) return undefined;
    const entry = this.entries.get(this.key({ context_id: contextId, document_identity: identity, sha256: sha }));
    return entry && confirmed(entry) ? entry : undefined;
  }
  brief(contextId: string | undefined, identity: string, sha: string,
    confirmed: (entry: ReviewContextImage) => boolean): ReviewContextImage | undefined {
    if (!contextId) return undefined;
    return [...this.entries.values()].find(entry => entry.context_id === contextId
      && entry.document_identity === identity && entry.brief_sha256 === sha && confirmed(entry));
  }
  remember(entry: ReviewContextImage, confirmed: (entry: ReviewContextImage) => boolean): void {
    const key = this.key(entry);
    const previous = this.entries.get(key);
    if (previous && confirmed(previous)) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
}
