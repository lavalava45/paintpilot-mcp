export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

function configuredLevel(fallback: LogLevel): LogLevel {
  const raw = process.env.LOG_LEVEL;
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return parsed >= LogLevel.DEBUG && parsed <= LogLevel.ERROR ? parsed : fallback;
}

function renderArgument(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export class Logger {
  private readonly threshold: LogLevel;

  constructor(
    private readonly context: string,
    fallbackLevel: LogLevel = LogLevel.INFO
  ) {
    this.threshold = configuredLevel(fallbackLevel);
  }

  debug(message: string, ...details: unknown[]): void {
    this.write(LogLevel.DEBUG, message, details);
  }

  info(message: string, ...details: unknown[]): void {
    this.write(LogLevel.INFO, message, details);
  }

  warn(message: string, ...details: unknown[]): void {
    this.write(LogLevel.WARN, message, details);
  }

  error(message: string, ...details: unknown[]): void {
    this.write(LogLevel.ERROR, message, details);
  }

  private write(level: LogLevel, message: string, details: unknown[]): void {
    if (level < this.threshold) return;
    const suffix = details.length > 0 ? ` ${details.map(renderArgument).join(' ')}` : '';
    const line = `[${new Date().toISOString()}] [${LEVEL_NAMES[level]}] [${this.context}] ${message}${suffix}`;
    process.stderr.write(`${line}\n`);
  }
}
