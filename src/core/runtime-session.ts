import { PhotoshopConnection } from '../platform/connection.js';
import { Logger } from './runtime-log.js';

type SessionState = 'offline' | 'online';

export class Session {
  private state: SessionState = 'offline';

  constructor(
    private readonly connection: PhotoshopConnection = new PhotoshopConnection(),
    private readonly log: Logger = new Logger('Session')
  ) {}

  async initialize(): Promise<void> {
    this.log.info('Initializing session...');
    await this.connect();
  }

  async connect(): Promise<boolean> {
    this.log.info('Connecting to Photoshop...');
    let reachable = false;
    try {
      reachable = await this.connection.ping();
    } catch (error) {
      this.log.error('Connection error:', error);
    }

    this.state = reachable ? 'online' : 'offline';
    if (reachable) this.log.info('Successfully connected to Photoshop');
    else this.log.warn('Failed to connect to Photoshop');
    return reachable;
  }

  async disconnect(): Promise<void> {
    if (this.state === 'online') this.log.info('Disconnecting session...');
    this.state = 'offline';
  }

  getConnection(): PhotoshopConnection {
    return this.connection;
  }

  getConnectionStatus(): boolean {
    return this.state === 'online';
  }
}
