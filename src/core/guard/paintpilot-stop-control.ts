import fs from 'node:fs';
import path from 'node:path';

/** An explicit PaintPilot operation Stop; it is not a COS message Stop. */
export class PaintPilotStopControl {
  constructor(private readonly runtimeDirectory: string) {}

  private stopFile(operationId: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(operationId)) {
      throw new Error('paintpilot_stop_invalid_operation_id');
    }
    return path.join(this.runtimeDirectory, 'paintpilot-stops', `${operationId}.json`);
  }

  /** Idempotent, durable and effective before any subsequent mutation admission. */
  requestStop(operationId: string): { operation_id: string; stopped: true; requested_at: string } {
    const file = this.stopFile(operationId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const request = { operation_id: operationId, stopped: true as const, requested_at: new Date().toISOString() };
    try {
      fs.writeFileSync(file, JSON.stringify(request), { flag: 'wx' });
      return request;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Do not erase a previous request or revive a stopped operation.
      return { ...request, requested_at: this.readStop(operationId)?.requested_at ?? request.requested_at };
    }
  }

  readStop(operationId: string): { operation_id: string; stopped: true; requested_at: string } | undefined {
    const file = this.stopFile(operationId);
    if (!fs.existsSync(file)) return undefined;
    // Ambiguous/corrupt stop marker never authorizes further mutation.
    try {
      const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const value = data as Record<string, unknown>;
        if (value.operation_id === operationId && value.stopped === true && typeof value.requested_at === 'string') {
          return { operation_id: operationId, stopped: true, requested_at: value.requested_at };
        }
      }
    } catch { /* fail closed */ }
    throw new Error(`paintpilot_stop_marker_unverifiable: ${operationId}`);
  }

  /** Synchronous gate called at every Photoshop mutation boundary. */
  assertMutationAllowed(operationId: string): void {
    if (this.readStop(operationId)) throw new Error(`paintpilot_stop_requested: ${operationId}`);
  }
}
