import { PhotoshopConnection } from '../platform/connection.js';
import { Logger } from '../utils/logger.js';

export class Session {
  private online = false;

  constructor(
    private readonly connection: PhotoshopConnection = new PhotoshopConnection(),
    private readonly log: Logger = new Logger('Session')
  ) {}

  async initialize(): Promise<void> {
    this.log.info('Initializing session...');
    void await this.connect();
  }

  async connect(): Promise<boolean> {
    this.log.info('Connecting to Photoshop...');
    let nextState = false;
    try {
      nextState = await this.connection.ping();
    } catch (error) {
      this.log.error('Connection error:', error);
    }
    this.online = nextState;
    this.log[nextState ? 'info' : 'warn'](
      nextState ? 'Successfully connected to Photoshop' : 'Failed to connect to Photoshop'
    );
    return nextState;
  }

  async disconnect(): Promise<void> {
    const wasOnline = this.online;
    this.online = false;
    if (wasOnline) this.log.info('Disconnecting session...');
  }

  getConnection(): PhotoshopConnection {
    return this.connection;
  }

  getConnectionStatus(): boolean {
    return this.online;
  }
}
