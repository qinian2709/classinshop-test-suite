type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? ORDER.info;

function ts(): string {
  return new Date().toISOString();
}

function emit(level: Level, scope: string, args: unknown[]): void {
  if (ORDER[level] < threshold) return;
  const prefix = `[${ts()}] [${level.toUpperCase()}] [${scope}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, ...args);
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => emit('debug', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
  };
}

export const logger = createLogger('test-suite');
