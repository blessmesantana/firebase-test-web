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

    const courierNameMatch = lines[0].match(/^([А-Яа-яA-Za-z]+)/);
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
        throw new Error('Нет данных для сохранения');
    }

    const courier = await service.saveCourier(courierName);

    if (!courier.key) {
        throw new Error('Не удалось получить ID курьера');
    }

    await service.saveDeliveries(courier.key, courierName, deliveryIds);

    return courier;
}
