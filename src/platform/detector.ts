import { platform } from 'node:os';
import { Logger } from '../utils/logger.js';
import type { PhotoshopInfo } from './connection.js';
import { WindowsDetector } from './windows-detector.js';

/** Windows is the only supported host platform for this project. */
export class PhotoshopDetector {
  private readonly logger = new Logger('PhotoshopDetector');
  private readonly windows = new WindowsDetector();
  private cachedInfo?: PhotoshopInfo;

  constructor() {
    const host = platform();
    if (host !== 'win32') {
      throw new Error(`Unsupported platform: ${host}. This Photoshop MCP build supports Windows only.`);
    }
  }

  async detect(forceRefresh = false): Promise<PhotoshopInfo> {
    if (!forceRefresh && this.cachedInfo) return { ...this.cachedInfo };
    this.logger.info('Detecting Photoshop on Windows...');
    this.cachedInfo = await this.windows.detect();
    return { ...this.cachedInfo };
  }

  invalidateCache(): void {
    this.cachedInfo = undefined;
  }
}
