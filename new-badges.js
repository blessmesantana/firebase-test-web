const DEFAULT_VIEW_LIMIT = 3;

function getStorageKey(key) {
    return `scaner_new_badge_${key}`;
}

function readViewCount(key) {
    try {
        const rawValue = localStorage.getItem(getStorageKey(key));
        const parsedValue = Number.parseInt(rawValue ?? '0', 10);
        return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
    } catch {
        return 0;
    }
}

export function shouldShowNewBadge(key, viewLimit = DEFAULT_VIEW_LIMIT) {
    return readViewCount(key) < viewLimit;
}

export function markNewBadgeSeen(key) {
    try {
        const nextValue = readViewCount(key) + 1;
        localStorage.setItem(getStorageKey(key), String(nextValue));
        return nextValue;
    } catch {
        return 0;
    }
}

