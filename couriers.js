function uniqueSortedCourierNames(couriers) {
    return [...new Set(couriers.map((courier) => courier.name).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right, 'ru'),
    );
}

import {
    captureException,
    trackEvent,
} from './logger.js';

function appendEmptyState(target, text) {
    const empty = document.createElement('div');
    empty.className = 'app-page-card';
    empty.textContent = text;
    empty.style.color = 'var(--color-text-secondary)';
    empty.style.fontSize = '13px';
    empty.style.textAlign = 'center';
    target.appendChild(empty);
}

function isPageHandleActive(pageHandle) {
    return Boolean(pageHandle?.page?.isConnected);
}

async function getCourierNames(service) {
    return uniqueSortedCourierNames(await service.getCouriers());
}

async function loadCourierTransfers({ courierName, service }) {
    const [deliveries, scans] = await Promise.all([
        service.getDeliveries(),
        service.getScans(),
    ]);

    const allDeliveries = deliveries
        .filter((delivery) => delivery.courier_name === courierName)
        .map((delivery) => delivery.id);
    const scannedDeliveries = new Set(
        scans
            .filter((scan) => scan.courier_name === courierName)
            .map((scan) => scan.delivery_id),
    );

    return {
        allDeliveries,
        scannedDeliveries,
    };
}

async function loadCourierSummaries({ courierNames, service }) {
    if (!Array.isArray(courierNames) || courierNames.length === 0) {
        return {
            completedCourierNames: new Set(),
            deliveryCounts: new Map(),
        };
    }

    const [deliveries, scans] = await Promise.all([
        service.getDeliveries(),
        service.getScans(),
    ]);
    const completedCourierNames = new Set();
    const deliveryCounts = new Map();

    courierNames.forEach((courierName) => {
        const courierDeliveries = deliveries.filter(
            (delivery) => delivery.courier_name === courierName,
        );
        deliveryCounts.set(courierName, courierDeliveries.length);

        if (courierDeliveries.length === 0) {
            return;
        }

        const scannedIds = new Set(
            scans
                .filter((scan) => scan.courier_name === courierName)
                .map((scan) => scan.delivery_id),
        );
        const allScanned = courierDeliveries.every((delivery) => scannedIds.has(delivery.id));

        if (allScanned) {
            completedCourierNames.add(courierName);
        }
    });

    return {
        completedCourierNames,
        deliveryCounts,
    };
}

async function renderCourierStatsModal({ courierName, service, ui }) {
    const modal = ui.createModal({
        className: 'courierStatsModalContent',
        maxButtonWidth: 420,
    });

    const title = document.createElement('div');
    title.textContent = courierName;
    Object.assign(title.style, {
        fontSize: '13px',
        fontWeight: '500',
        marginBottom: '18px',
        fontFamily: 'Inter, sans-serif',
    });
    modal.content.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    Object.assign(closeButton.style, {
        position: 'absolute',
        top: '12px',
        right: '18px',
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: '22px',
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
    });
    closeButton.addEventListener('click', modal.close);
    modal.content.appendChild(closeButton);

    let allDeliveries = [];
    let scannedDeliveries = new Set();

    try {
        ({ allDeliveries, scannedDeliveries } = await loadCourierTransfers({
            courierName,
            service,
        }));
    } catch (error) {
        console.error('Ошибка загрузки передач курьера:', error);
        captureException(error, {
            operation: 'load_courier_transfers_modal',
            tags: {
                scope: 'couriers',
            },
        });
        ui.showToast('Не удалось загрузить передачи', {
            type: 'error',
            duration: 2200,
        });
        return;
    }

    if (allDeliveries.length === 0) {
        appendEmptyState(modal.content, 'У этого курьера пока нет передач');
        return;
    }

    const notScanned = allDeliveries.filter((id) => !scannedDeliveries.has(id));
    const scanned = allDeliveries.filter((id) => scannedDeliveries.has(id));

    const list = document.createElement('div');
    Object.assign(list.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        maxHeight: '55vh',
        overflowY: 'auto',
    });

    [...notScanned, ...scanned].forEach((deliveryId) => {
        const item = document.createElement('div');
        item.textContent = deliveryId;
        Object.assign(item.style, {
            fontSize: '13px',
            transition: 'opacity 0.3s',
            fontFamily: 'Inter, sans-serif',
            opacity: scannedDeliveries.has(deliveryId) ? '0.6' : '1',
        });

        if (scannedDeliveries.has(deliveryId)) {
            item.classList.add('scanned');
        }

        list.appendChild(item);
    });

    modal.content.appendChild(list);
}

async function openCourierSelector({ service, ui }) {
    let couriers = [];

    try {
        couriers = await getCourierNames(service);
    } catch (error) {
        console.error('Ошибка загрузки курьеров:', error);
        captureException(error, {
            operation: 'open_courier_selector',
            tags: {
                scope: 'couriers',
            },
        });
        ui.showToast('Не удалось загрузить курьеров', {
            type: 'error',
            duration: 2200,
        });
        return;
    }

    ui.showSelectionModal({
        title: 'Выберите курьера',
        items: couriers,
        getLabel: (courierName) => courierName,
        onSelect: (courierName) => {
            void renderCourierStatsModal({
                courierName,
                service,
                ui,
            });
        },
    });
}

async function toggleCourierAccordionItem({
    item,
    courierName,
    page,
    service,
}) {
    const isOpen = item.classList.contains('is-open');

    if (isOpen) {
        item.classList.remove('is-open');
        item.button.setAttribute('aria-expanded', 'false');
        item.panel.setAttribute('aria-hidden', 'true');
        return;
    }

    item.classList.add('is-open');
    item.button.setAttribute('aria-expanded', 'true');
    item.panel.setAttribute('aria-hidden', 'false');

    if (item.dataset.loaded === 'true' || item.dataset.loading === 'true') {
        return;
    }

    item.dataset.loading = 'true';
    item.panelBody.innerHTML = '';
    appendEmptyState(item.panelBody, 'Загрузка...');

    let allDeliveries = [];
    let scannedDeliveries = new Set();

    try {
        ({ allDeliveries, scannedDeliveries } = await loadCourierTransfers({
            courierName,
            service,
        }));
    } catch (error) {
        console.error('Ошибка загрузки передач курьера:', error);
        captureException(error, {
            operation: 'load_courier_transfers_accordion',
            tags: {
                scope: 'couriers',
            },
        });

        if (!isPageHandleActive(page) || !item.isConnected) {
            return;
        }

        item.panelBody.innerHTML = '';
        appendEmptyState(item.panelBody, 'Не удалось загрузить передачи');
        return;
    } finally {
        delete item.dataset.loading;
    }

    if (!isPageHandleActive(page) || !item.isConnected) {
        return;
    }

    item.panelBody.innerHTML = '';

    if (allDeliveries.length === 0) {
        appendEmptyState(item.panelBody, 'У этого курьера пока нет передач');
        item.dataset.loaded = 'true';
        return;
    }

    const notScanned = allDeliveries.filter((id) => !scannedDeliveries.has(id));
    const scanned = allDeliveries.filter((id) => scannedDeliveries.has(id));
    const deliveriesList = document.createElement('div');
    deliveriesList.className = 'courier-accordion-deliveries';

    [...notScanned, ...scanned].forEach((deliveryId) => {
        const deliveryItem = document.createElement('div');
        deliveryItem.className = 'courier-accordion-delivery';
        deliveryItem.textContent = deliveryId;

        if (scannedDeliveries.has(deliveryId)) {
            deliveryItem.classList.add('scanned');
        }

        deliveriesList.appendChild(deliveryItem);
    });

    item.panelBody.appendChild(deliveriesList);
    item.dataset.loaded = 'true';
}

function createCourierAccordionItem({
    courierName,
    isComplete,
    isDeleteCandidate,
    totalDeliveriesCount,
    onToggleDeleteCandidate,
    page,
    service,
}) {
    const item = document.createElement('div');
    item.className = 'courier-accordion';
    item.dataset.courierName = courierName;

    const header = document.createElement('div');
    header.className = 'courier-accordion-header';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-page-list-button courier-accordion-toggle';
    button.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'courier-accordion-label';
    label.textContent = courierName;

    const completeIndicator = document.createElement('span');
    completeIndicator.className = 'courier-accordion-complete';
    completeIndicator.setAttribute('aria-hidden', 'true');
    completeIndicator.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 10.5L8.2 13.7L15 6.9" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    completeIndicator.classList.toggle('is-complete', Boolean(isComplete));

    const status = document.createElement('span');
    status.className = 'courier-accordion-status';
    status.textContent = String(totalDeliveriesCount ?? 0);

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'courier-accordion-select-button';
    selectButton.setAttribute('aria-pressed', isDeleteCandidate ? 'true' : 'false');
    selectButton.setAttribute(
        'aria-label',
        isDeleteCandidate
            ? `Снять выбор курьера ${courierName}`
            : `Выбрать курьера ${courierName} для удаления`,
    );
    selectButton.classList.toggle('is-selected', Boolean(isDeleteCandidate));

    const selectIndicator = document.createElement('span');
    selectIndicator.className = 'courier-accordion-select-indicator';
    selectIndicator.setAttribute('aria-hidden', 'true');
    selectIndicator.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="7" width="10" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 7H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="8" y="3" width="4" height="2" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M8 10V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 10V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    selectButton.appendChild(selectIndicator);

    const panel = document.createElement('div');
    panel.className = 'courier-accordion-panel';
    panel.setAttribute('aria-hidden', 'true');

    const panelInner = document.createElement('div');
    panelInner.className = 'courier-accordion-panel-inner';

    const panelBody = document.createElement('div');
    panelBody.className = 'courier-accordion-panel-body';

    panelInner.appendChild(panelBody);
    panel.appendChild(panelInner);
    button.appendChild(completeIndicator);
    button.appendChild(label);
    button.appendChild(status);
    header.appendChild(button);
    header.appendChild(selectButton);
    item.appendChild(header);
    item.appendChild(panel);

    item.button = button;
    item.panel = panel;
    item.panelBody = panelBody;
    item.selectButton = selectButton;

    button.addEventListener('click', () => {
        onToggleDeleteCandidate?.('');
        void toggleCourierAccordionItem({
            item,
            courierName,
            page,
            service,
        });
    });

    selectButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleDeleteCandidate?.(courierName);
    });

    return item;
}

export async function openCourierPage({ service, ui, direction }) {
    void service.warmAdminData?.();

    const page = ui.showAppPage({
        bodyClassName: 'courier-screen',
        direction,
        onClose: () => {
            unsubscribeCouriers?.();
        },
        pageId: 'courierPage',
        title: 'Курьеры',
    });
    let unsubscribeCouriers = null;
    let deleteCandidateCourier = '';

    const layout = document.createElement('div');
    layout.className = 'courier-page-layout';

    const listWrap = document.createElement('div');
    listWrap.className = 'courier-page-list-wrap';

    const actions = document.createElement('div');
    actions.className = 'archive-action-group';

    const deleteCourierButton = ui.createPrimaryButton('Удалить курьера', {
        className: 'archive-delete-courier-btn',
    });
    const deleteCourierDeliveriesButton = ui.createPrimaryButton(
        'Удалить передачи',
        {
            className: 'archive-delete-btn',
        },
    );
    const deleteAllCouriersButton = ui.createPrimaryButton(
        'Удалить всех',
        {
            className: 'archive-delete-all-btn',
        },
    );

    actions.appendChild(deleteCourierButton);
    actions.appendChild(deleteCourierDeliveriesButton);
    actions.appendChild(deleteAllCouriersButton);
    layout.appendChild(listWrap);
    layout.appendChild(actions);
    page.body.appendChild(layout);

    appendEmptyState(listWrap, 'Загрузка...');

    async function refreshCourierList() {
        try {
            await renderCourierList(await getCourierNames(service));
        } catch (error) {
            console.error('Ошибка обновления курьеров:', error);
            captureException(error, {
                operation: 'refresh_courier_page',
                tags: {
                    scope: 'couriers',
                },
            });

            if (!isPageHandleActive(page)) {
                return;
            }

            listWrap.innerHTML = '';
            appendEmptyState(listWrap, 'Не удалось обновить курьеров');
        }
    }

    function toggleDeleteCandidate(courierName) {
        deleteCandidateCourier =
            deleteCandidateCourier === courierName ? '' : courierName;

        if (!isPageHandleActive(page)) {
            return;
        }

        listWrap.querySelectorAll('.courier-accordion').forEach((item) => {
            const isSelected = item.dataset.courierName === deleteCandidateCourier;
            item.selectButton?.classList.toggle('is-selected', isSelected);
            item.selectButton?.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            item.selectButton?.setAttribute(
                'aria-label',
                isSelected
                    ? `Снять выбор курьера ${item.dataset.courierName}`
                    : `Выбрать курьера ${item.dataset.courierName} для удаления`,
            );
        });
    }

    async function renderCourierList(couriers) {
        if (!isPageHandleActive(page)) {
            return;
        }

        listWrap.innerHTML = '';

        if (couriers.length === 0) {
            deleteCandidateCourier = '';
            appendEmptyState(listWrap, 'Курьеры не найдены');
            return;
        }

        if (!couriers.includes(deleteCandidateCourier)) {
            deleteCandidateCourier = '';
        }

        const list = document.createElement('div');
        list.className = 'app-page-list archive-courier-list';
        let completedCourierNames = new Set();
        let deliveryCounts = new Map();

        try {
            ({
                completedCourierNames,
                deliveryCounts,
            } = await loadCourierSummaries({
                courierNames: couriers,
                service,
            }));
        } catch (error) {
            console.error('Ошибка загрузки статусов курьеров:', error);
            captureException(error, {
                operation: 'load_courier_summaries',
                tags: {
                    scope: 'couriers',
                },
            });
        }

        if (!isPageHandleActive(page)) {
            return;
        }

        couriers.forEach((courierName) => {
            list.appendChild(createCourierAccordionItem({
                courierName,
                isComplete: completedCourierNames.has(courierName),
                isDeleteCandidate: deleteCandidateCourier === courierName,
                totalDeliveriesCount: deliveryCounts.get(courierName) || 0,
                onToggleDeleteCandidate: toggleDeleteCandidate,
                page,
                service,
            }));
        });

        listWrap.appendChild(list);
    }

    deleteCourierButton.addEventListener('click', async () => {
        if (!deleteCandidateCourier) {
            ui.showScanResult('error', 'Выберите курьера для удаления');
            return;
        }

        const selectedCourier = deleteCandidateCourier;
        const confirmDialog = ui.createConfirmDialog({
            html: `Вы действительно хотите удалить курьера <b style="font-size:16px;">${selectedCourier}</b>?`,
            confirmText: 'Удалить курьера',
        });

        confirmDialog.confirmButton.addEventListener('click', async () => {
            confirmDialog.confirmButton.disabled = true;
            confirmDialog.confirmButton.textContent = 'Удаление...';

            await service.deleteCourierCascade(selectedCourier);
            deleteCandidateCourier = '';
            trackEvent('courier_deleted', {
                scope: 'single',
            }, 'warning');
            await refreshCourierList();

            confirmDialog.confirmButton.textContent = 'Готово!';
            window.setTimeout(() => {
                confirmDialog.close();
            }, 1200);
        });
    });

    deleteCourierDeliveriesButton.addEventListener('click', async () => {
        if (!deleteCandidateCourier) {
            ui.showScanResult('error', 'Выберите курьера для удаления передач');
            return;
        }

        const selectedCourier = deleteCandidateCourier;
        const confirmDialog = ui.createConfirmDialog({
            html: `Вы действительно хотите удалить все передачи у <b style="font-size:16px;">${selectedCourier}</b>?`,
            confirmText: 'Удалить передачи',
        });

        confirmDialog.confirmButton.addEventListener('click', async () => {
            confirmDialog.confirmButton.disabled = true;
            confirmDialog.confirmButton.textContent = 'Удаление...';

            await service.deleteDeliveriesAndRelatedScansByCourier(selectedCourier);
            trackEvent('deliveries_deleted', {
                scope: 'courier',
            }, 'warning');
            await refreshCourierList();

            confirmDialog.confirmButton.textContent = 'Готово!';
            window.setTimeout(() => {
                confirmDialog.close();
            }, 1200);
        });
    });

    deleteAllCouriersButton.addEventListener('click', async () => {
        const confirmDialog = ui.createConfirmDialog({
            html: 'Вы действительно хотите удалить <b style="font-size:16px;">всех курьеров</b>?',
            confirmText: 'Удалить всех курьеров',
        });

        confirmDialog.confirmButton.addEventListener('click', async () => {
            confirmDialog.confirmButton.disabled = true;
            confirmDialog.confirmButton.textContent = 'Удаление...';

            await service.deleteAllDailyData();
            deleteCandidateCourier = '';
            trackEvent('all_data_deleted', {
                scope: 'all',
            }, 'warning');
            await refreshCourierList();

            confirmDialog.confirmButton.textContent = 'Готово!';
            window.setTimeout(() => {
                confirmDialog.close();
            }, 1200);
        });
    });

    if (typeof service.subscribeCouriers === 'function') {
        unsubscribeCouriers = service.subscribeCouriers(
            (couriers) => {
                void renderCourierList(uniqueSortedCourierNames(couriers));
            },
            (error) => {
                console.error('Ошибка загрузки курьеров:', error);
                captureException(error, {
                    operation: 'subscribe_couriers_page',
                    tags: {
                        scope: 'couriers',
                    },
                });

                if (!isPageHandleActive(page)) {
                    return;
                }

                listWrap.innerHTML = '';
                appendEmptyState(listWrap, 'Не удалось загрузить курьеров');
            },
        );
        return;
    }

    try {
        await renderCourierList(await getCourierNames(service));
    } catch (error) {
        console.error('Ошибка загрузки курьеров:', error);
        captureException(error, {
            operation: 'render_courier_page',
            tags: {
                scope: 'couriers',
            },
        });

        if (!isPageHandleActive(page)) {
            return;
        }

        listWrap.innerHTML = '';
        appendEmptyState(listWrap, 'Не удалось загрузить курьеров');
    }
}

import {
    getBufferShkCodeEntry,
    getCourierShippingShkCodeEntry,
    getCrossdockShkCodeEntry,
    getGateShkCodeEntry,
} from './shk-svg-data.js';

function getShkSectionIconMarkup(sectionId) {
    if (sectionId === 'gates') {
        return `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 16.5V5.5C3 4.39543 3.89543 3.5 5 3.5H7V16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M17 16.5V5.5C17 4.39543 16.1046 3.5 15 3.5H13V16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 3.5H13V16.5H7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 8.25V11.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
        `;
    }

    if (sectionId === 'buffer') {
        return `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="5" height="5" rx="1.4" stroke="currentColor" stroke-width="1.7"/>
                <rect x="12" y="3" width="5" height="5" rx="1.4" stroke="currentColor" stroke-width="1.7"/>
                <rect x="3" y="12" width="5" height="5" rx="1.4" stroke="currentColor" stroke-width="1.7"/>
                <rect x="12" y="12" width="5" height="5" rx="1.4" stroke="currentColor" stroke-width="1.7"/>
                <path d="M8 5.5H12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M10 8V12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
        `;
    }

    if (sectionId === 'crossdock') {
        return `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6.5L8 4V16L4 13.5V6.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="M12 4L16 6.5V13.5L12 16V4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="M8.75 7.25H11.25" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M10.25 5.75L11.75 7.25L10.25 8.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M11.25 12.75H8.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M9.75 11.25L8.25 12.75L9.75 14.25" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }

    if (sectionId === 'courier-shipping') {
        return `
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6.25L10 3L16 6.25V13.75L10 17L4 13.75V6.25Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="M10 3V17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                <path d="M4 6.25L10 9.5L16 6.25" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="M6 15.5H14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="0.75"/>
            </svg>
        `;
    }

    return '';
}

export async function openArchivePage({ ui, direction }) {
    const page = ui.showAppPage({
        bodyClassName: 'shk-screen',
        direction,
        pageId: 'archivePage',
        title: 'ШК',
    });

    const sections = [
        {
            id: 'gates',
            title: 'ВОРОТА',
            gridClassName: 'is-dual',
            codes: [
                getGateShkCodeEntry('left'),
                getGateShkCodeEntry('right'),
            ],
        },
        {
            id: 'buffer',
            title: 'БУФЕР',
            gridClassName: 'is-triple',
            codes: ['70', '71', '72', '73', '74', '75', '76', '77', '78'].map(getBufferShkCodeEntry),
        },
        {
            id: 'crossdock',
            title: 'МЕЖСКЛАД',
            gridClassName: 'is-quad',
            codes: [
                getCrossdockShkCodeEntry('mp'),
                getCrossdockShkCodeEntry('handoff'),
                getCrossdockShkCodeEntry('dock452'),
                getCrossdockShkCodeEntry('dock212'),
            ],
        },
        {
            id: 'courier-shipping',
            title: 'ОТГРУЗКА КУРЬЕРОВ',
            gridClassName: 'is-triple',
            codes: ['vk2', 'vk3', 'vk4', 'vk5', 'vk6'].map(getCourierShippingShkCodeEntry),
        },
    ];

    const layout = document.createElement('div');
    layout.className = 'shk-page-layout';

    const list = document.createElement('div');
    list.className = 'app-page-list shk-accordion-list';

    sections.forEach((section) => {
        const item = document.createElement('div');
        item.className = 'shk-accordion';

        const button = ui.createPrimaryButton('', {
            className: 'data-entry-submit-button',
        });
        button.type = 'button';
        button.classList.add('settings-panel-button', 'shk-accordion-button');
        button.setAttribute('aria-expanded', 'false');

        const icon = document.createElement('span');
        icon.className = 'settings-panel-button-icon shk-accordion-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = getShkSectionIconMarkup(section.id);

        const labelText = document.createElement('span');
        labelText.className = 'settings-panel-button-label shk-accordion-label-text';
        labelText.textContent = section.title;

        const spacer = document.createElement('span');
        spacer.className = 'settings-panel-button-spacer shk-accordion-spacer';
        spacer.setAttribute('aria-hidden', 'true');

        const panel = document.createElement('div');
        panel.className = 'shk-accordion-panel';
        panel.setAttribute('aria-hidden', 'true');

        const panelInner = document.createElement('div');
        panelInner.className = 'shk-accordion-panel-inner';

        const panelBody = document.createElement('div');
        panelBody.className = 'shk-accordion-panel-body';

        const codesGrid = document.createElement('div');
        codesGrid.className = `shk-code-grid${section.gridClassName ? ` ${section.gridClassName}` : ''}`;

        section.codes.forEach((code) => {
            const card = document.createElement('div');
            card.className = 'shk-code-card';
            if (code.isRealQr) {
                card.classList.add('is-real-qr');
            }

            if (code.label && !code.isRealQr) {
                const badge = document.createElement('div');
                badge.className = 'shk-code-badge';
                badge.textContent = code.label;
                card.appendChild(badge);
            }

            const svgShell = document.createElement('div');
            svgShell.className = 'shk-code-shell';
            if (code.isRealQr) {
                svgShell.classList.add('is-real-qr');
            }
            svgShell.innerHTML = code.svgMarkup;

            card.appendChild(svgShell);
            codesGrid.appendChild(card);
        });

        panelBody.appendChild(codesGrid);
        panelInner.appendChild(panelBody);
        panel.appendChild(panelInner);
        button.appendChild(icon);
        button.appendChild(labelText);
        button.appendChild(spacer);
        item.appendChild(button);
        item.appendChild(panel);
        list.appendChild(item);

        button.addEventListener('click', () => {
            const isOpen = item.classList.contains('is-open');
            item.classList.toggle('is-open', !isOpen);
            button.classList.toggle('is-open', !isOpen);
            button.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            panel.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
        });
    });

    layout.appendChild(list);
    page.body.appendChild(layout);
}

export function initializeSidebarAdmin({ dom, service, ui }) {
    if (!dom.sidebarMenuNav) {
        return {
            archiveButton: null,
            processButton: null,
        };
    }

    const processButton = ui.createSidebarButton({
        id: 'processScanButton',
        label: 'Курьеры',
        fontSize: '13px',
        marginTop: '1px',
    });
    dom.sidebarMenuNav.appendChild(processButton);

    processButton.addEventListener('click', async () => {
        await openCourierSelector({ service, ui });
    });

    return {
        archiveButton: null,
        processButton,
    };
}

