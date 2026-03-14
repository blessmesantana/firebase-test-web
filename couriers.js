function uniqueSortedCourierNames(couriers) {
    return [...new Set(couriers.map((courier) => courier.name).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right, 'ru'),
    );
}

function appendEmptyState(target, text) {
    const empty = document.createElement('div');
    empty.className = 'app-page-card';
    empty.textContent = text;
    empty.style.color = 'var(--color-text-secondary)';
    empty.style.fontSize = '13px';
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

function createCourierAccordionItem({ courierName, page, service }) {
    const item = document.createElement('div');
    item.className = 'courier-accordion';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-page-list-button courier-accordion-toggle';
    button.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'courier-accordion-label';
    label.textContent = courierName;

    const chevron = document.createElement('span');
    chevron.className = 'courier-accordion-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1.5L7 7.5L13 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const panel = document.createElement('div');
    panel.className = 'courier-accordion-panel';
    panel.setAttribute('aria-hidden', 'true');

    const panelInner = document.createElement('div');
    panelInner.className = 'courier-accordion-panel-inner';

    const panelBody = document.createElement('div');
    panelBody.className = 'courier-accordion-panel-body';

    panelInner.appendChild(panelBody);
    panel.appendChild(panelInner);
    button.appendChild(label);
    button.appendChild(chevron);
    item.appendChild(button);
    item.appendChild(panel);

    item.button = button;
    item.panel = panel;
    item.panelBody = panelBody;

    button.addEventListener('click', () => {
        void toggleCourierAccordionItem({
            item,
            courierName,
            page,
            service,
        });
    });

    return item;
}

export async function openCourierPage({ service, ui, direction }) {
    void service.warmAdminData?.();

    const page = ui.showAppPage({
        direction,
        onClose: () => {
            unsubscribeCouriers?.();
        },
        pageId: 'courierPage',
        title: 'Курьеры',
    });
    let unsubscribeCouriers = null;

    appendEmptyState(page.body, 'Загрузка...');

    function renderCourierList(couriers) {
        if (!isPageHandleActive(page)) {
            return;
        }

        page.body.innerHTML = '';

        if (couriers.length === 0) {
            appendEmptyState(page.body, 'Курьеры не найдены');
            return;
        }

        const list = document.createElement('div');
        list.className = 'app-page-list';

        couriers.forEach((courierName) => {
            list.appendChild(createCourierAccordionItem({
                courierName,
                page,
                service,
            }));
        });

        page.body.appendChild(list);
    }

    if (typeof service.subscribeCouriers === 'function') {
        unsubscribeCouriers = service.subscribeCouriers(
            (couriers) => {
                renderCourierList(uniqueSortedCourierNames(couriers));
            },
            (error) => {
                console.error('Ошибка загрузки курьеров:', error);

                if (!isPageHandleActive(page)) {
                    return;
                }

                page.body.innerHTML = '';
                appendEmptyState(page.body, 'Не удалось загрузить курьеров');
            },
        );
        return;
    }

    try {
        renderCourierList(await getCourierNames(service));
    } catch (error) {
        console.error('Ошибка загрузки курьеров:', error);

        if (!isPageHandleActive(page)) {
            return;
        }

        page.body.innerHTML = '';
        appendEmptyState(page.body, 'Не удалось загрузить курьеров');
    }
}

function createArchiveCourierPicker() {
    const root = document.createElement('div');
    root.className = 'archive-courier-picker';

    const list = document.createElement('div');
    list.className = 'archive-courier-list';
    root.appendChild(list);

    let selectedCourier = '';

    function updateSelectionStyles() {
        list.querySelectorAll('.archive-courier-option').forEach((button) => {
            const isSelected = button.dataset.courierValue === selectedCourier;
            button.classList.toggle('is-selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });
    }

    function setItems(items, emptyText = 'Курьеры не найдены') {
        list.innerHTML = '';

        if (items.length === 0) {
            selectedCourier = '';
            appendEmptyState(list, emptyText);
            return;
        }

        const availableValues = new Set(items.map((item) => item.value));
        if (!availableValues.has(selectedCourier)) {
            selectedCourier = '';
        }

        items.forEach(({ label, value }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'archive-courier-option';
            button.dataset.courierValue = value;
            button.textContent = label;
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', () => {
                selectedCourier = value;
                updateSelectionStyles();
            });
            list.appendChild(button);
        });

        updateSelectionStyles();
    }

    function clearSelection() {
        selectedCourier = '';
        updateSelectionStyles();
    }

    return {
        root,
        getValue: () => selectedCourier,
        clearSelection,
        setItems,
    };
}

async function appendArchiveControls({ container, service, ui }) {
    void service.warmAdminData?.();

    const courierPicker = createArchiveCourierPicker();
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
    const deleteAllDeliveriesButton = ui.createPrimaryButton(
        'Удалить все',
        {
            className: 'archive-delete-all-btn',
        },
    );

    courierPicker.setItems([], 'Загрузка...');
    actions.appendChild(deleteCourierButton);
    actions.appendChild(deleteCourierDeliveriesButton);
    actions.appendChild(deleteAllDeliveriesButton);
    container.appendChild(courierPicker.root);
    container.appendChild(actions);

    function renderCourierOptions(courierNames) {
        courierPicker.setItems([
            ...courierNames.map((courierName) => ({
                label: courierName,
                value: courierName,
            })),
            {
                label: 'Все курьеры',
                value: '__all__',
            },
        ]);
    }

    let unsubscribeCouriers = null;

    if (typeof service.subscribeCouriers === 'function') {
        unsubscribeCouriers = service.subscribeCouriers(
            (couriers) => {
                if (!container.isConnected) {
                    return;
                }

                renderCourierOptions(uniqueSortedCourierNames(couriers));
            },
            (error) => {
                console.error('Ошибка загрузки курьеров:', error);
                ui.showScanResult('error', 'Не удалось загрузить курьеров');
                courierPicker.setItems([]);
            },
        );
    } else {
        try {
            renderCourierOptions(await getCourierNames(service));
        } catch (error) {
            console.error('Ошибка загрузки курьеров:', error);
            ui.showScanResult('error', 'Не удалось загрузить курьеров');
            courierPicker.setItems([]);
        }
    }

    deleteCourierButton.addEventListener('click', async () => {
        const selectedCourier = courierPicker.getValue();

        if (!selectedCourier) {
            ui.showScanResult('error', 'Выберите курьера для удаления');
            return;
        }

        if (selectedCourier === '__all__') {
            const confirmDialog = ui.createConfirmDialog({
                html: 'Вы действительно хотите удалить <b style="font-size:16px;">всех курьеров</b>?',
                confirmText: 'Удалить всех курьеров',
            });

            confirmDialog.confirmButton.addEventListener('click', async () => {
                confirmDialog.confirmButton.disabled = true;
                confirmDialog.confirmButton.textContent = 'Удаление...';

                await service.deleteAllDailyData();

                confirmDialog.confirmButton.textContent = 'Готово!';
                window.setTimeout(() => {
                    confirmDialog.close();
                }, 1200);
            });

            return;
        }

        const confirmDialog = ui.createConfirmDialog({
            html: `Вы действительно хотите удалить курьера <b style="font-size:16px;">${selectedCourier}</b>?`,
            confirmText: 'Удалить курьера',
        });

        confirmDialog.confirmButton.addEventListener('click', async () => {
            confirmDialog.confirmButton.disabled = true;
            confirmDialog.confirmButton.textContent = 'Удаление...';

            await service.deleteCourierCascade(selectedCourier);

            confirmDialog.confirmButton.textContent = 'Готово!';
            window.setTimeout(() => {
                confirmDialog.close();
            }, 1200);
        });
    });

    deleteCourierDeliveriesButton.addEventListener('click', async () => {
        const selectedCourier = courierPicker.getValue();

        if (!selectedCourier || selectedCourier === '__all__') {
            ui.showScanResult('error', 'Выберите курьера для удаления передач');
            return;
        }

        const confirmDialog = ui.createConfirmDialog({
            html: `Вы действительно хотите удалить все передачи у <b style="font-size:16px;">${selectedCourier}</b>?`,
            confirmText: 'Удалить передачи',
        });

        confirmDialog.confirmButton.addEventListener('click', async () => {
            confirmDialog.confirmButton.disabled = true;
            confirmDialog.confirmButton.textContent = 'Удаление...';

            await service.deleteDeliveriesAndRelatedScansByCourier(selectedCourier);

            confirmDialog.confirmButton.textContent = 'Готово!';
            window.setTimeout(() => {
                confirmDialog.close();
            }, 1200);
        });
    });

    deleteAllDeliveriesButton.addEventListener('click', async () => {
        const confirmed = window.confirm(
            'Удалить все передачи и сканы для всех курьеров?',
        );

        if (!confirmed) {
            return;
        }

        await service.deleteAllDeliveriesAndScans();
        ui.showToast('Все передачи удалены!');
    });
    
    return () => {
        unsubscribeCouriers?.();
    };
}

export async function openArchivePage({ service, ui, direction }) {
    const page = ui.showAppPage({
        bodyClassName: 'archive-screen',
        direction,
        onClose: () => {
            cleanup?.();
        },
        pageId: 'archivePage',
        title: 'Удаление данных',
    });
    let cleanup = null;

    const layout = document.createElement('div');
    layout.className = 'archive-page-layout';
    page.body.appendChild(layout);

    cleanup = await appendArchiveControls({
        container: layout,
        service,
        ui,
    });
}

export function initializeSidebarAdmin({ dom, service, ui }) {
    if (!dom.sidebarMenuNav) {
        return {
            processButton: null,
            archiveButton: null,
        };
    }

    const processButton = ui.createSidebarButton({
        id: 'processScanButton',
        label: 'Курьеры',
        fontSize: '13px',
        marginTop: '1px',
    });
    const archiveButton = ui.createSidebarButton({
        id: 'archiveButton',
        fontSize: '15px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 'auto',
        marginBottom: '8px',
        html: '<span style="display:flex;align-items:center;width:20px;justify-content:flex-start;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="7" width="10" height="9" rx="2" stroke="#fff" stroke-width="1.5"/><path d="M3 7h14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><rect x="8" y="3" width="4" height="2" rx="1" stroke="#fff" stroke-width="1.5"/><path d="M7 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="#fff" stroke-width="1.5"/></svg></span><span style="flex:1;text-align:left;padding-left:12px;">Удаление данных</span>',
    });

    dom.sidebarMenuNav.appendChild(processButton);
    dom.sidebarMenuNav.appendChild(archiveButton);

    processButton.addEventListener('click', async () => {
        await openCourierSelector({ service, ui });
    });

    archiveButton.addEventListener('click', async () => {
        let cleanup = null;
        const archiveModal = ui.createModal({
            className: 'archive-modal-content',
            maxButtonWidth: 420,
            onClose: () => {
                cleanup?.();
            },
        });

        const title = document.createElement('div');
        title.textContent = 'Удаление данных';
        Object.assign(title.style, {
            fontSize: '13px',
            fontWeight: '500',
            marginBottom: '18px',
            fontFamily: 'Inter, sans-serif',
        });
        archiveModal.content.appendChild(title);

        cleanup = await appendArchiveControls({
            container: archiveModal.content,
            service,
            ui,
        });
    });

    return {
        archiveButton,
        processButton,
    };
}

