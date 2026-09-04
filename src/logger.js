const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVELS[(process.env.LOG_LEVEL ?? "info").toLowerCase()] ?? LEVELS.info;

function log(level, message, extra) {
  if (LEVELS[level] < threshold) {
    return;
  }

  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;

  if (extra === undefined) {
    console[level === "debug" ? "log" : level](line);
  } else {
    console[level === "debug" ? "log" : level](line, extra);
  }
}

export const logger = {
  debug: (message, extra) => log("debug", message, extra),
  info: (message, extra) => log("info", message, extra),
  warn: (message, extra) => log("warn", message, extra),
  error: (message, extra) => log("error", message, extra)
};
