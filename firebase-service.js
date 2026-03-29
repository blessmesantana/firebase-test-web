import { database } from './firebase.js';
import { captureException } from './logger.js';
import {
    get,
    onValue,
    push,
    query,
    ref,
    set,
    update,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

const collectionCache = new Map();
const collectionVersions = new Map();

function normalizeCourierName(value) {
    return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function normalizeDeliveryId(value) {
    return String(value || '').trim();
}

function snapshotToArray(snapshot) {
    const items = [];

    if (!snapshot.exists()) {
        return items;
    }

    snapshot.forEach((childSnapshot) => {
        const value = childSnapshot.val();

        items.push({
            key: childSnapshot.key,
            ...value,
        });
    });

    return items;
}

function cloneCollection(items) {
    return items.map((item) => ({ ...item }));
}

function uniquePaths(paths) {
    return [...new Set(paths.filter(Boolean))];
}

function getCollectionVersion(path) {
    return collectionVersions.get(path) || 0;
}

function prefetchCollections(paths) {
    uniquePaths(paths).forEach((path) => {
        void getCollection(path).catch(() => {
            collectionCache.delete(path);
        });
    });
}

function invalidateCollections(paths, options = {}) {
    const normalizedPaths = uniquePaths(paths);

    normalizedPaths.forEach((path) => {
        collectionVersions.set(path, getCollectionVersion(path) + 1);
        collectionCache.delete(path);
    });

    if (options.prefetch) {
        prefetchCollections(normalizedPaths);
    }
}

async function getCollection(path) {
    const cachedEntry = collectionCache.get(path);
    const currentVersion = getCollectionVersion(path);

    if (cachedEntry?.data && cachedEntry.version === currentVersion) {
        return cloneCollection(cachedEntry.data);
    }

    if (cachedEntry?.promise && cachedEntry.version === currentVersion) {
        return cloneCollection(await cachedEntry.promise);
    }

    const requestVersion = currentVersion;
    const loadPromise = (async () => {
        const snapshot = await get(query(ref(database, path)));
        const items = snapshotToArray(snapshot);

        if (getCollectionVersion(path) === requestVersion) {
            collectionCache.set(path, { data: items, version: requestVersion });
        }

        return items;
    })();

    collectionCache.set(path, { promise: loadPromise, version: requestVersion });

    try {
        return cloneCollection(await loadPromise);
    } catch (error) {
        collectionCache.delete(path);
        throw error;
    }
}

async function removePaths(paths) {
    const updates = {};

    paths.forEach((path) => {
        updates[path] = null;
    });

    if (Object.keys(updates).length === 0) {
        return;
    }

    await update(ref(database), updates);
}

export async function getCouriers() {
    return getCollection('couriers');
}

export async function getDeliveries() {
    return getCollection('deliveries');
}

export async function getScans() {
    return getCollection('scans');
}

export async function getTelemetryEvents() {
    const items = await getCollection('telemetry_events');
    return items.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0));
}

function subscribeCollection(path, onData, onError = null) {
    const collectionRef = ref(database, path);

    return onValue(
        collectionRef,
        (snapshot) => {
            const items = snapshotToArray(snapshot);
            const nextVersion = getCollectionVersion(path) + 1;

            collectionVersions.set(path, nextVersion);
            collectionCache.set(path, {
                data: items,
                version: nextVersion,
            });

            onData(cloneCollection(items));
        },
        (error) => {
            captureException(error, {
                operation: 'subscribe_collection',
                path,
                tags: {
                    scope: 'firebase',
                },
            });
            if (typeof onError === 'function') {
                onError(error);
            } else {
                console.error(`Subscription error for "${path}":`, error);
            }
        },
    );
}

export function subscribeCouriers(onData, onError = null) {
    return subscribeCollection('couriers', onData, onError);
}

export function subscribeDeliveries(onData, onError = null) {
    return subscribeCollection('deliveries', onData, onError);
}

export function subscribeScans(onData, onError = null) {
    return subscribeCollection('scans', onData, onError);
}

export function subscribeTelemetryEvents(onData, onError = null) {
    return subscribeCollection(
        'telemetry_events',
        (items) => {
            onData(
                items.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0)),
            );
        },
        onError,
    );
}

export async function warmAdminData() {
    await Promise.all([
        getCollection('couriers'),
        getCollection('deliveries'),
        getCollection('scans'),
    ]);
}

export async function saveCourier(courierName) {
    const courierRef = push(ref(database, 'couriers'));
    const record = {
        name: courierName,
        timestamp: Date.now(),
    };

    await set(courierRef, record);
    invalidateCollections(['couriers'], { prefetch: true });

    return {
        key: courierRef.key,
        ...record,
    };
}

export async function saveDeliveries(courierId, courierName, deliveryIds) {
    const savedDeliveries = [];

    for (const deliveryId of deliveryIds) {
        if (!deliveryId) {
            continue;
        }

        const deliveryRef = push(ref(database, 'deliveries'));
        const record = {
            id: deliveryId,
            courier_id: courierId,
            courier_name: courierName,
            timestamp: Date.now(),
        };

        await set(deliveryRef, record);
        savedDeliveries.push({
            key: deliveryRef.key,
            ...record,
        });
    }

    invalidateCollections(['deliveries'], { prefetch: true });

    return savedDeliveries;
}

export async function saveScan(deliveryId, courierName, timestamp = Date.now()) {
    const scanRef = push(ref(database, 'scans'));
    const record = {
        delivery_id: deliveryId,
        courier_name: courierName,
        timestamp,
    };

    await set(scanRef, record);
    invalidateCollections(['scans'], { prefetch: true });

    return {
        key: scanRef.key,
        ...record,
    };
}

export async function deleteAllDailyData() {
    await update(ref(database), {
        couriers: null,
        deliveries: null,
        scans: null,
    });
    invalidateCollections(['couriers', 'deliveries', 'scans'], {
        prefetch: true,
    });
}

export async function deleteAllDeliveriesAndScans() {
    await update(ref(database), {
        deliveries: null,
        scans: null,
    });
    invalidateCollections(['deliveries', 'scans'], { prefetch: true });
}

export async function deleteCourierByName(courierName) {
    const normalizedCourierName = normalizeCourierName(courierName);
    const couriers = await getCouriers();
    const keysToDelete = couriers
        .filter((courier) => normalizeCourierName(courier.name) === normalizedCourierName)
        .map((courier) => `couriers/${courier.key}`);

    await removePaths(keysToDelete);
    invalidateCollections(['couriers'], { prefetch: true });

    return keysToDelete;
}

export async function deleteDeliveriesByCourier(courierName) {
    const normalizedCourierName = normalizeCourierName(courierName);
    const deliveries = await getDeliveries();
    const matchedDeliveries = deliveries.filter(
        (delivery) => normalizeCourierName(delivery.courier_name) === normalizedCourierName,
    );

    await removePaths(
        matchedDeliveries.map((delivery) => `deliveries/${delivery.key}`),
    );
    invalidateCollections(['deliveries'], { prefetch: true });

    return matchedDeliveries;
}

export async function deleteScansByCourier(courierName) {
    const normalizedCourierName = normalizeCourierName(courierName);
    const scans = await getScans();
    const matchedScans = scans.filter(
        (scan) => normalizeCourierName(scan.courier_name) === normalizedCourierName,
    );

    await removePaths(matchedScans.map((scan) => `scans/${scan.key}`));
    invalidateCollections(['scans'], { prefetch: true });

    return matchedScans;
}

export async function deleteScansByDeliveryIds(deliveryIds) {
    const ids = new Set(deliveryIds.map((deliveryId) => normalizeDeliveryId(deliveryId)).filter(Boolean));

    if (ids.size === 0) {
        return [];
    }

    const scans = await getScans();
    const matchedScans = scans.filter((scan) => ids.has(normalizeDeliveryId(scan.delivery_id)));

    await removePaths(matchedScans.map((scan) => `scans/${scan.key}`));
    invalidateCollections(['scans'], { prefetch: true });

    return matchedScans;
}

export async function deleteDeliveryByCourierAndId(courierName, deliveryId) {
    const normalizedCourierName = normalizeCourierName(courierName);
    const normalizedDeliveryId = normalizeDeliveryId(deliveryId);
    const deliveries = await getDeliveries();
    const matchedDeliveries = deliveries.filter(
        (delivery) =>
            normalizeCourierName(delivery.courier_name) === normalizedCourierName &&
            normalizeDeliveryId(delivery.id) === normalizedDeliveryId,
    );

    await removePaths(
        matchedDeliveries.map((delivery) => `deliveries/${delivery.key}`),
    );
    invalidateCollections(['deliveries'], { prefetch: true });

    return matchedDeliveries;
}

export async function deleteScansByCourierAndDeliveryId(courierName, deliveryId) {
    const normalizedCourierName = normalizeCourierName(courierName);
    const normalizedDeliveryId = normalizeDeliveryId(deliveryId);
    const scans = await getScans();
    const matchedScans = scans.filter(
        (scan) =>
            normalizeCourierName(scan.courier_name) === normalizedCourierName &&
            normalizeDeliveryId(scan.delivery_id) === normalizedDeliveryId,
    );

    await removePaths(matchedScans.map((scan) => `scans/${scan.key}`));
    invalidateCollections(['scans'], { prefetch: true });

    return matchedScans;
}

export async function deleteCourierCascade(courierName) {
    const deletedDeliveries = await deleteDeliveriesByCourier(courierName);
    const deletedDeliveryIds = deletedDeliveries.map((delivery) => delivery.id);

    await Promise.all([
        deleteCourierByName(courierName),
        deleteScansByCourier(courierName),
        deleteScansByDeliveryIds(deletedDeliveryIds),
    ]);

    return {
        deletedDeliveryIds,
    };
}

export async function deleteDeliveriesAndRelatedScansByCourier(courierName) {
    const deletedDeliveries = await deleteDeliveriesByCourier(courierName);
    const deletedDeliveryIds = deletedDeliveries.map((delivery) => delivery.id);

    await deleteScansByDeliveryIds(deletedDeliveryIds);

    return {
        deletedDeliveryIds,
    };
}

export async function deleteDeliveryAndRelatedScansByCourier(courierName, deliveryId) {
    const deletedDeliveries = await deleteDeliveryByCourierAndId(courierName, deliveryId);

    await deleteScansByCourierAndDeliveryId(courierName, deliveryId);

    return {
        deletedDeliveryIds: deletedDeliveries.map((delivery) => delivery.id),
    };
}
