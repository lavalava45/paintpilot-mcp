export const LogLevel = Object.freeze({
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const);

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

const LABELS = new Map<LogLevelValue, string>([
  [LogLevel.DEBUG, 'DEBUG'],
  [LogLevel.INFO, 'INFO'],
  [LogLevel.WARN, 'WARN'],
  [LogLevel.ERROR, 'ERROR'],
]);

function configuredMinimum(fallback: LogLevelValue): LogLevelValue {
  const raw = process.env.LOG_LEVEL;
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && LABELS.has(parsed as LogLevelValue)
    ? parsed as LogLevelValue
    : fallback;
}

function detailText(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? String(value) : encoded;
  } catch {
    return String(value);
  }
}

export class Logger {
  private readonly minimum: LogLevelValue;

  constructor(
    private readonly context: string,
    fallbackLevel: LogLevelValue = LogLevel.INFO
  ) {
    this.minimum = configuredMinimum(fallbackLevel);
  }

  debug(message: string, ...details: unknown[]): void {
    this.emit(LogLevel.DEBUG, message, details);
  }

  info(message: string, ...details: unknown[]): void {
    this.emit(LogLevel.INFO, message, details);
  }

  warn(message: string, ...details: unknown[]): void {
    this.emit(LogLevel.WARN, message, details);
  }

  error(message: string, ...details: unknown[]): void {
    this.emit(LogLevel.ERROR, message, details);
  }

  private emit(level: LogLevelValue, message: string, details: readonly unknown[]): void {
    if (level < this.minimum) return;
    const rendered = details.map(detailText);
    const tail = rendered.length === 0 ? '' : ` ${rendered.join(' ')}`;
    const label = LABELS.get(level) ?? 'INFO';
    process.stderr.write(
      `[${new Date().toISOString()}] [${label}] [${this.context}] ${message}${tail}\n`
    );
  }
}
