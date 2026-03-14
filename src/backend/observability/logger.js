const SENSITIVE_META_KEYS = [/password/i, /token/i, /secret/i, /authorization/i, /api[_-]?key/i];

function isSensitiveKey(key) {
  return SENSITIVE_META_KEYS.some((pattern) => pattern.test(key));
}

function sanitizeValue(value) {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    const output = {};
    const entries = Object.entries(value).slice(0, 20);
    for (const [key, nestedValue] of entries) {
      if (isSensitiveKey(key)) {
        output[key] = '[redacted]';
        continue;
      }

      output[key] = sanitizeValue(nestedValue);
    }

    return output;
  }

  return value;
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  return sanitizeValue({
    message: error.message || String(error),
    code: error.code || null,
    name: error.name || null,
  });
}

function emit(level, event, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    meta: sanitizeValue(meta),
  };

  const serialized = JSON.stringify(entry);
  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

export function logInfo(event, meta) {
  emit('info', event, meta);
}

export function logWarn(event, meta) {
  emit('warn', event, meta);
}

export function logError(event, error, meta) {
  emit('error', event, {
    ...meta,
    error: normalizeError(error),
  });
}
