type Level = 'info' | 'warn' | 'error';

/** Single-line JSON logs (CloudWatch friendly). Silent under Jest to keep test output readable. */
function write(level: Level, message: string, data: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...data });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (message: string, data?: Record<string, unknown>) => write('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => write('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => write('error', message, data),
};
