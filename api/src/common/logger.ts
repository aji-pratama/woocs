export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  storeId?: string;
  sessionId?: string;
  component?: string;
  durationMs?: number;
  [key: string]: any;
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'api_key',
  'apikey',
  'openrouter_api_key',
  'openai_api_key',
  'polar_access_token',
  'password',
  'secret',
  'token',
]);

function sanitize(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    const keyLower = k.toLowerCase();
    if (keyLower.includes('password') || keyLower.includes('secret') || keyLower.includes('token') || keyLower.includes('auth')) {
      clean[k] = '[REDACTED]';
    } else if (SENSITIVE_KEYS.has(keyLower) || keyLower.includes('key')) {
      clean[k] = typeof v === 'string' && v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : '[REDACTED]';
    } else if (typeof v === 'object') {
      clean[k] = sanitize(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // Gray
  info: '\x1b[36m',  // Cyan
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
};
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const COMPONENT_COLOR = '\x1b[35m'; // Magenta

class Logger {
  private isJson = process.env.LOG_FORMAT === 'json' || (process.env.NODE_ENV === 'production' && !process.env.DEV_LOGS);

  private log(level: LogLevel, message: string, meta?: LogContext) {
    const timestamp = new Date().toISOString();
    const sanitizedMeta = meta ? sanitize(meta) : undefined;

    if (this.isJson) {
      const entry = {
        timestamp,
        level,
        message,
        ...sanitizedMeta,
      };
      if (level === 'error') {
        console.error(JSON.stringify(entry));
      } else if (level === 'warn') {
        console.warn(JSON.stringify(entry));
      } else {
        console.log(JSON.stringify(entry));
      }
      return;
    }

    // Pretty console output for development / CLI
    const color = LEVEL_COLORS[level] || '';
    const component = sanitizedMeta?.component ? `${COMPONENT_COLOR}[${sanitizedMeta.component}]${RESET} ` : '';
    const duration = sanitizedMeta?.durationMs != null ? ` \x1b[32m(${sanitizedMeta.durationMs}ms)${RESET}` : '';
    const tag = `${color}${BOLD}[${level.toUpperCase()}]${RESET}`;

    let metaString = '';
    if (sanitizedMeta) {
      const { component: _, durationMs: __, ...rest } = sanitizedMeta;
      if (Object.keys(rest).length > 0) {
        metaString = ` ${JSON.stringify(rest)}`;
      }
    }

    const output = `${tag} ${component}${message}${duration}${metaString}`;

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, meta?: LogContext) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      this.log('debug', message, meta);
    }
  }

  info(message: string, meta?: LogContext) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: LogContext) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: LogContext) {
    this.log('error', message, meta);
  }

  // Domain-specific observability helpers
  ai(message: string, meta: { model?: string; durationMs?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; storeId?: string; sessionId?: string; [key: string]: any }) {
    this.info(message, { component: 'AI', ...meta });
  }

  rag(message: string, meta: { storeId?: string; sessionId?: string; confidence?: number; contextUsed?: string; productsCount?: number; faqsCount?: number; knowledgeCount?: number; durationMs?: number; [key: string]: any }) {
    this.info(message, { component: 'RAG', ...meta });
  }

  http(message: string, meta: { method: string; path: string; status: number; durationMs: number; requestId?: string; storeId?: string; [key: string]: any }) {
    const level = meta.status >= 500 ? 'error' : meta.status >= 400 ? 'warn' : 'info';
    this.log(level, message, { component: 'HTTP', ...meta });
  }

  worker(message: string, meta: { taskName?: string; taskId?: string; durationMs?: number; status?: string; error?: string; [key: string]: any }) {
    const level = meta.status === 'failed' || meta.error ? 'error' : 'info';
    this.log(level, message, { component: 'Worker', ...meta });
  }
}

export const logger = new Logger();
