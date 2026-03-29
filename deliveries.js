export function parseRawData(text) {
    if (!text || typeof text !== 'string') {
        return { courierName: '', deliveryIds: [] };
    }

    const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) {
        return { courierName: '', deliveryIds: [] };
    }

    const courierNameMatch = lines[0].match(/^([\p{Script=Cyrillic}A-Za-z]+)/u);
    const courierName = courierNameMatch ? courierNameMatch[1] : '';
    const deliveryIds = lines
        .map((line) => line.match(/\b\d{10}\b/g))
        .filter(Boolean)
        .flat();

    return { courierName, deliveryIds };
}

export function normalizeDeliveryId(rawValue) {
    return String(rawValue || '').replace(/\D/g, '');
}

export function normalizeCourierName(rawValue) {
    return String(rawValue || '').trim().toLocaleLowerCase('ru-RU');
}

export function findMatchingDeliveries(rawTransferId, deliveries) {
    let cleanedId = '';
    let isShort = false;

    const source = String(rawTransferId || '');
    const match10 = source.match(/\b\d{10}\b/) || source.match(/\d{10}/);
    const match4 = source.match(/\b\d{4}\b/) || source.match(/\d{4}/);

    if (match10) {
        cleanedId = match10[0];
    } else if (match4) {
        cleanedId = match4[0];
        isShort = true;
    }

    if (!cleanedId) {
        return {
            cleanedId: '',
            isShort,
            matches: [],
        };
    }

    const matches = deliveries.filter((delivery) => {
        const normalizedDeliveryId = normalizeDeliveryId(delivery?.id);

        if (!normalizedDeliveryId) {
            return false;
        }

        if (isShort) {
            return normalizedDeliveryId.endsWith(cleanedId);
        }

        return normalizedDeliveryId === cleanedId;
    });

    return {
        cleanedId,
        isShort,
        matches,
    };
}

export async function saveCourierAndDeliveries(service, courierName, deliveryIds) {
    if (!courierName || !deliveryIds || deliveryIds.length === 0) {
        throw new Error('No data to save');
    }

    const normalizedCourierName = normalizeCourierName(courierName);
    const normalizedRequestedDeliveryIds = deliveryIds
        .map((deliveryId) => normalizeDeliveryId(deliveryId))
        .filter(Boolean);
    const uniqueRequestedDeliveryIds = [...new Set(normalizedRequestedDeliveryIds)];

    if (uniqueRequestedDeliveryIds.length === 0) {
        throw new Error('No delivery ids to save');
    }

    const [couriers, deliveries] = await Promise.all([
        service.getCouriers(),
        service.getDeliveries(),
    ]);

    let courier =
        couriers.find((item) => normalizeCourierName(item.name) === normalizedCourierName)
        || null;
    let createdCourier = false;

    const ownersByDeliveryId = new Map();

    deliveries.forEach((delivery) => {
        const normalizedDeliveryId = normalizeDeliveryId(delivery.id);
        const ownerName = String(delivery.courier_name || '').trim();
        const normalizedOwnerName = normalizeCourierName(ownerName);

        if (!normalizedDeliveryId || !ownerName || !normalizedOwnerName) {
            return;
        }

        const owners = ownersByDeliveryId.get(normalizedDeliveryId) || [];

        if (!owners.some((owner) => owner.normalizedName === normalizedOwnerName)) {
            owners.push({
                name: ownerName,
                normalizedName: normalizedOwnerName,
            });
        }

        ownersByDeliveryId.set(normalizedDeliveryId, owners);
    });

    const sameCourierDuplicateIds = [];
    const crossCourierDuplicateIds = [];
    const conflictingCourierNames = new Set();
    const newDeliveryIds = [];

    uniqueRequestedDeliveryIds.forEach((deliveryId) => {
        const owners = ownersByDeliveryId.get(deliveryId) || [];

        if (owners.length === 0) {
            newDeliveryIds.push(deliveryId);
            return;
        }

        if (owners.some((owner) => owner.normalizedName === normalizedCourierName)) {
            sameCourierDuplicateIds.push(deliveryId);
            return;
        }

        crossCourierDuplicateIds.push(deliveryId);
        owners.forEach((owner) => {
            conflictingCourierNames.add(owner.name);
        });
    });

    if (!courier && newDeliveryIds.length > 0) {
        courier = await service.saveCourier(courierName);
        createdCourier = true;
    }

    if (newDeliveryIds.length > 0 && !courier?.key) {
        throw new Error('Courier key is missing');
    }

    if (newDeliveryIds.length > 0) {
        await service.saveDeliveries(courier.key, courierName, newDeliveryIds);
    }

    return {
        courier,
        createdCourier,
        addedCount: newDeliveryIds.length,
        conflictingCourierNames: [...conflictingCourierNames],
        crossCourierDuplicateCount: crossCourierDuplicateIds.length,
        duplicateCount: sameCourierDuplicateIds.length,
        requestedCount: uniqueRequestedDeliveryIds.length,
    };
}
