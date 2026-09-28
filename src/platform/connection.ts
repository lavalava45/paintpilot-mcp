import { Logger } from '../utils/logger.js';
import { PhotoshopDetector } from './detector.js';

export type PhotoshopInfo = {
  version: string;
  path: string;
  isRunning: boolean;
};

type DetectorPort = {
  detect(forceRefresh?: boolean): Promise<PhotoshopInfo>;
};

export type PhotoshopConnectionOptions = {
  detector?: DetectorPort;
};

/** Windows-only Photoshop discovery/version facade; semantic execution belongs to the UXP backend. */
export class PhotoshopConnection {
  private readonly log = new Logger('PhotoshopConnection');
  private readonly detector: DetectorPort;
  private cachedInfo: PhotoshopInfo | null = null;

  constructor({ detector }: PhotoshopConnectionOptions = {}) {
    this.detector = detector ?? new PhotoshopDetector();
  }

  private async discover(): Promise<PhotoshopInfo> {
    if (this.cachedInfo !== null) return this.cachedInfo;
    const detected = await this.detector.detect();
    this.cachedInfo = detected;
    return detected;
  }

  async ping(): Promise<boolean> {
    try {
      await this.discover();
    } catch (error) {
      this.log.error('Photoshop detection failed:', error);
      return false;
    }
    return true;
  }

  async getVersion(): Promise<string> {
    try {
      const detected = await this.discover();
      return detected.version || 'Unknown';
    } catch (error) {
      this.log.error('Failed to get Photoshop version:', error);
      throw error;
    }
  }

  getPhotoshopInfo(): PhotoshopInfo | null {
    return this.cachedInfo;
  }
}
