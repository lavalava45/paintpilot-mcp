import { platform } from 'node:os';
import { Logger } from '../core/runtime-log.js';
import {
  collectWindowsPhotoshopCandidates,
  executableExists,
  normalizePhotoshopExecutable,
  photoshopProcessRunning,
  photoshopVersionFromPath,
} from './windows-discovery.js';

export interface PhotoshopInfo {
  version: string;
  path: string;
  isRunning: boolean;
}

interface DetectorPort {
  detect(forceRefresh?: boolean): Promise<PhotoshopInfo>;
}

export interface PhotoshopConnectionOptions {
  detector?: DetectorPort;
}

export class WindowsDetector {
  constructor(private readonly log = new Logger('WindowsDetector')) {}

  async detect(): Promise<PhotoshopInfo> {
    const visited = new Set<string>();
    const candidates = await collectWindowsPhotoshopCandidates();
    for (const candidate of candidates) {
      const executable = normalizePhotoshopExecutable(candidate);
      const identity = executable.toLowerCase();
      if (visited.has(identity)) continue;
      visited.add(identity);
      if (!(await executableExists(executable))) continue;

      this.log.info(`Found Photoshop at: ${executable}`);
      return {
        version: photoshopVersionFromPath(executable),
        path: executable,
        isRunning: await photoshopProcessRunning(),
      };
    }

    throw new Error(
      'Photoshop was not found on Windows. Set PHOTOSHOP_PATH or install Adobe Photoshop in a standard location.'
    );
  }
}

function enforceWindowsPlatform(): void {
  const host = platform();
  if (host !== 'win32') {
    throw new Error(`Unsupported platform: ${host}. This Photoshop MCP build supports Windows only.`);
  }
}

export class PhotoshopDetector implements DetectorPort {
  private snapshot: PhotoshopInfo | undefined;

  constructor(
    private readonly windows = new WindowsDetector(),
    private readonly log = new Logger('PhotoshopDetector')
  ) {
    enforceWindowsPlatform();
  }

  async detect(forceRefresh = false): Promise<PhotoshopInfo> {
    if (!forceRefresh && this.snapshot !== undefined) return { ...this.snapshot };
    this.log.info('Detecting Photoshop on Windows...');
    const detected = await this.windows.detect();
    this.snapshot = detected;
    return { ...detected };
  }

  invalidateCache(): void {
    this.snapshot = undefined;
  }
}

export class PhotoshopConnection {
  private readonly detector: DetectorPort;
  private snapshot: PhotoshopInfo | undefined;

  constructor(
    { detector }: PhotoshopConnectionOptions = {},
    private readonly log = new Logger('PhotoshopConnection')
  ) {
    this.detector = detector ?? new PhotoshopDetector();
  }

  private async inspect(): Promise<PhotoshopInfo> {
    if (this.snapshot === undefined) this.snapshot = await this.detector.detect();
    return this.snapshot;
  }

  async ping(): Promise<boolean> {
    try {
      await this.inspect();
      return true;
    } catch (error) {
      this.log.error('Photoshop detection failed:', error);
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      const info = await this.inspect();
      return info.version || 'Unknown';
    } catch (error) {
      this.log.error('Failed to get Photoshop version:', error);
      throw error;
    }
  }

  getPhotoshopInfo(): PhotoshopInfo | null {
    return this.snapshot ?? null;
  }
}

export { photoshopVersionFromPath };
