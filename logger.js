import { database } from './firebase.js';
import {
    push,
    ref,
    set,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import {
    TELEMETRY_DEDUPE_WINDOW_MS,
    TELEMETRY_PATH,
} from './telemetry-config.js';

const loggerContext = {
    appVersion: 'unknown',
    browser: 'unknown',
    buttonPalette: 'default',
    deviceType: 'unknown',
    isTouch: false,
    online: navigator.onLine,
    os: 'unknown',
    pixelRatio: window.devicePixelRatio || 1,
    platform: 'web',
    screen: 'unknown',
    selectedCameraId: 'none',
    sessionId: createSessionId(),
    theme: 'unknown',
    userAgent: navigator.userAgent || 'unknown',
    url: window.location.href || 'unknown',
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    visibilityState: document.visibilityState || 'unknown',
};

const telemetryCooldowns = new Map();
let globalHooksInstalled = false;

function createSessionId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function maskIdentifier(value) {
    const raw = String(value || '').replace(/\D/g, '');

    if (!raw) {
        return '';
    }

    return raw.length <= 4 ? raw : raw.slice(-4);
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function sanitizeValue(key, value, depth = 0) {
    if (value == null) {
        return value;
    }

    if (depth > 3) {
        return String(value);
    }

    if (typeof value === 'string') {
        if (/transfer|delivery/i.test(key)) {
            return maskIdentifier(value);
        }

        if (/raw|input|payload|stack/i.test(key)) {
            return value.slice(0, 240);
        }

        return value.slice(0, 240);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (value instanceof Error) {
        return {
            message: value.message,
            name: value.name,
        };
    }

    if (Array.isArray(value)) {
        return value.slice(0, 10).map((item) => sanitizeValue(key, item, depth + 1));
    }

    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 20)
                .map(([nestedKey, nestedValue]) => [
                    nestedKey,
                    sanitizeValue(nestedKey, nestedValue, depth + 1),
                ]),
        );
    }

    return String(value);
}

function sanitizeMeta(meta = {}) {
    return Object.fromEntries(
        Object.entries(meta)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, sanitizeValue(key, value)]),
    );
}

function emitConsole(level, message, payload) {
    const consoleMethod =
        level === 'error'
            ? console.error
            : level === 'warning'
              ? console.warn
              : console.log;

    if (payload === undefined) {
        consoleMethod(`[logger] ${message}`);
        return;
    }

    consoleMethod(`[logger] ${message}`, payload);
}

function installGlobalHooks() {
    if (globalHooksInstalled) {
        return;
    }

    globalHooksInstalled = true;

    window.addEventListener('error', (event) => {
        const error =
            event.error
            || new Error(event.message || 'Unhandled window error');

        captureException(error, {
            source: 'window.error',
            tags: {
                scope: 'global',
            },
            url: event.filename || window.location.href,
            line: event.lineno,
            column: event.colno,
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        const error =
            reason instanceof Error
                ? reason
                : new Error(
                    typeof reason === 'string'
                        ? reason
                        : 'Unhandled promise rejection',
                );

        captureException(error, {
            source: 'window.unhandledrejection',
            tags: {
                scope: 'global',
            },
            reason: sanitizeValue('reason', reason),
        });
    });

    window.addEventListener('online', () => {
        setContext({
            online: true,
            url: window.location.href || 'unknown',
        });
    });

    window.addEventListener('offline', () => {
        setContext({
            online: false,
            url: window.location.href || 'unknown',
        });
    });

    window.addEventListener('resize', () => {
        setContext({
            pixelRatio: window.devicePixelRatio || 1,
            viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
        });
    });

    document.addEventListener('visibilitychange', () => {
        setContext({
            url: window.location.href || 'unknown',
            visibilityState: document.visibilityState || 'unknown',
        });
    });
}

function shouldSkipTelemetry(type, meta, level) {
    const dedupeKey = JSON.stringify({
        level,
        meta: sanitizeMeta(meta),
        type,
    });
    const now = Date.now();
    const lastSentAt = telemetryCooldowns.get(dedupeKey) || 0;

    if (now - lastSentAt < TELEMETRY_DEDUPE_WINDOW_MS) {
        return true;
    }

    telemetryCooldowns.set(dedupeKey, now);
    return false;
}

export function setContext(partialContext = {}) {
    Object.assign(loggerContext, sanitizeMeta(partialContext));
}

export function initLogger(initialContext = {}) {
    setContext(initialContext);
    installGlobalHooks();
}

function writeTelemetry(type, meta = {}, level = 'info') {
    const sanitizedMeta = sanitizeMeta(meta);

    if (shouldSkipTelemetry(type, sanitizedMeta, level)) {
        return;
    }

    const payload = {
        appVersion: loggerContext.appVersion,
        browser: loggerContext.browser,
        buttonPalette: loggerContext.buttonPalette,
        deviceType: loggerContext.deviceType,
        isTouch: loggerContext.isTouch,
        level,
        meta: sanitizedMeta,
        online: loggerContext.online,
        os: loggerContext.os,
        pixelRatio: loggerContext.pixelRatio,
        platform: loggerContext.platform,
        screen: loggerContext.screen,
        selectedCameraId: loggerContext.selectedCameraId,
        sessionId: loggerContext.sessionId,
        theme: loggerContext.theme,
        timestamp: Date.now(),
        type,
        url: loggerContext.url,
        userAgent: loggerContext.userAgent,
        viewport: loggerContext.viewport,
        visibilityState: loggerContext.visibilityState,
    };

    emitConsole(level, `event:${type}`, payload);

    void set(push(ref(database, TELEMETRY_PATH)), payload).catch((error) => {
        emitConsole('warning', 'telemetry_write_failed', {
            message: error?.message || 'Unknown telemetry write error',
            type,
        });
    });
}

export function trackEvent(type, meta = {}, level = 'info') {
    writeTelemetry(type, meta, level);
}

export function captureMessage(message, meta = {}, level = 'info') {
    writeTelemetry(
        'log_message',
        {
            message,
            ...meta,
        },
        level,
    );
}

export function captureException(error, meta = {}) {
    writeTelemetry(
        'exception',
        {
            errorMessage: error?.message || 'Unknown error',
            errorName: error?.name || 'Error',
            stack: error?.stack || '',
            ...meta,
        },
        'error',
    );
}
