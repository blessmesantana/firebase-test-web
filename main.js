import * as service from './firebase-service.js';
import { createCameraController } from './camera.js';
import {
    initializeSidebarAdmin,
    openArchivePage,
    openCourierPage,
} from './couriers.js';
import { parseRawData, saveCourierAndDeliveries } from './deliveries.js';
import { createScannerController } from './scanner.js';
import { createUiController } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const DEBUG_CAMERA = new URLSearchParams(window.location.search).has('debugCamera');
    const IS_IOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    function debugCamera(event, payload = {}) {
        if (!DEBUG_CAMERA) {
            return;
        }

        console.log(`[camera-debug][main] ${event}`, payload);
    }

    const dom = {
        bottomArchiveButton: document.getElementById('bottomArchiveButton'),
        bottomCouriersButton: document.getElementById('bottomCouriersButton'),
        bottomDataButton: document.getElementById('bottomDataButton'),
        bottomHomeButton: document.getElementById('bottomHomeButton'),
        bottomSettingsButton: document.getElementById('bottomSettingsButton'),
        bottomNav: document.querySelector('.bottom-nav'),
        cameraSelectorContainer: document.getElementById('cameraSelectorContainer'),
        cameraSelect: document.getElementById('cameraSelect'),
        inputModeButton: document.getElementById('inputModeButton'),
        loadingIndicator: document.getElementById('loadingIndicator'),
        manualInputContainer: document.getElementById('manualInputContainer'),
        manualTransferForm:
            document.getElementById('manualTransferForm')
            || document.getElementById('inputModeButton'),
        manualSubmitButton: document.getElementById('manualSubmitButton'),
        manualTransferIdInput: document.getElementById('manualTransferId'),
        qrContainer: document.querySelector('.qr-container'),
        qrIcons: Array.from(document.querySelectorAll('.qr-icon')),
        qrResultOverlay: document.getElementById('qr-result-overlay'),
        qrSpinner: document.getElementById('qrSpinner'),
        resultCourier: document.getElementById('resultCourier'),
        resultDiv: document.getElementById('result'),
        resultPrevious: document.getElementById('resultPrevious'),
        resultRawData: document.getElementById('resultRawData'),
        resultStatus: document.getElementById('resultStatus'),
        resultTransferId: document.getElementById('resultTransferId'),
        scanButton: document.getElementById('scanButton'),
        pageRoot: document.querySelector('.page'),
        sidebarDataForm: document.getElementById('sidebarDataForm'),
        sidebarDataInput: document.getElementById('sidebarDataInput'),
        sidebarMenu: document.getElementById('sidebarMenu'),
        sidebarMenuNav: document.querySelector('nav#sidebarMenu'),
        sidebarShowStatsButton: document.getElementById('sidebarShowStatsButton'),
        sidebarToggle: document.getElementById('sidebarToggle'),
        sidebarToggleLabel: document.querySelector('label[for="sidebarToggle"]'),
        videoElement: document.getElementById('qr-video'),
    };

    const state = {
        activeRootScreen: 'home',
        availableCameras: [],
        autoRestartAllowed: true,
        cameraMessages: {
            grantedShown: false,
            requestShown: false,
        },
        codeReader: null,
        decodeRunId: 0,
        isProcessing: false,
        lastScanTime: 0,
        restartTimerId: null,
        scanPause: {
            active: false,
            reason: null,
            timerId: null,
        },
        scanSessionId: 0,
        scannerActive: false,
        scannerPhase: 'idle',
        scannerStarting: false,
        selectedCameraId: IS_IOS ? null : localStorage.getItem('selectedCameraId') || null,
        selectedCameraSignature:
            IS_IOS ? null : localStorage.getItem('selectedCameraSignature') || null,
        stopReason: null,
        stream: null,
    };

    const ui = createUiController({ dom });
    const camera = createCameraController({ state, dom, ui });
    const scanner = createScannerController({
        state,
        service,
        ui,
        camera,
    });

    camera.setScanResultHandler(scanner.handleScanSuccess);

    if (dom.sidebarShowStatsButton) {
        dom.sidebarShowStatsButton.remove();
    }

    const adminControls = initializeSidebarAdmin({
        dom,
        service,
        ui,
    });

    const THEME_STORAGE_KEY = 'appTheme';
    const APP_VERSION = 'v1.5.10';
    const THEMES = ['blue', 'dark'];
    const THEME_BROWSER_COLORS = {
        blue: '#3949AB',
        dark: '#141414',
    };
    let cameraMenuVisible = false;
    let activeCameraPickerModal = null;
    let activeBottomNavKey = 'home';
    const bottomNavOrder = ['data', 'couriers', 'home', 'archive', 'settings'];
    const cameraSelectHomeParent = dom.cameraSelect?.parentElement || null;
    const cameraSelectHomeNextSibling = dom.cameraSelect?.nextSibling || null;

    function syncBrowserThemeColor(themeName) {
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (!themeColorMeta) {
            return;
        }

        themeColorMeta.setAttribute(
            'content',
            THEME_BROWSER_COLORS[themeName] || THEME_BROWSER_COLORS.blue,
        );
    }

    function restoreCameraSelectToHomeHost() {
        if (!dom.cameraSelect || !cameraSelectHomeParent) {
            return;
        }

        if (dom.cameraSelect.parentElement === cameraSelectHomeParent) {
            return;
        }

        if (cameraSelectHomeNextSibling?.parentNode === cameraSelectHomeParent) {
            cameraSelectHomeParent.insertBefore(dom.cameraSelect, cameraSelectHomeNextSibling);
            return;
        }

        cameraSelectHomeParent.appendChild(dom.cameraSelect);
    }

    function applyTheme(themeName) {
        const resolvedTheme = THEMES.includes(themeName) ? themeName : 'blue';
        document.documentElement.dataset.theme = resolvedTheme;
        document.body.dataset.theme = resolvedTheme;
        localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
        syncBrowserThemeColor(resolvedTheme);
        return resolvedTheme;
    }

    function getBottomNavDirection(targetKey) {
        const currentIndex = bottomNavOrder.indexOf(activeBottomNavKey);
        const targetIndex = bottomNavOrder.indexOf(targetKey);

        if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) {
            return 'forward';
        }

        return targetIndex > currentIndex ? 'forward' : 'backward';
    }

    function isBottomNavTargetActive(targetKey) {
        return activeBottomNavKey === targetKey;
    }

    function setActiveBottomNav(activeKey) {
        if (activeKey !== 'home') {
            stopCameraForLifecycle(`nav_to_${activeKey}`);
        }

        const entries = {
            archive: dom.bottomArchiveButton,
            couriers: dom.bottomCouriersButton,
            data: dom.bottomDataButton,
            home: dom.bottomHomeButton,
            settings: dom.bottomSettingsButton,
        };

        Object.entries(entries).forEach(([key, button]) => {
            button?.classList.toggle('is-active', key === activeKey);
        });

        activeBottomNavKey = activeKey;
        state.activeRootScreen = activeKey;
        dom.bottomNav?.style.setProperty('--nav-active-index', String(Math.max(bottomNavOrder.indexOf(activeKey), 0)));
        dom.bottomNav?.setAttribute('data-nav-active', activeKey);
        setHomeChromeVisible(activeKey === 'home');
    }

    function setHomeChromeVisible(isVisible) {
        const visibility = isVisible ? '1' : '0';
        const pointerEvents = isVisible ? '' : 'none';

        if (dom.cameraSelectorContainer) {
            dom.cameraSelectorContainer.style.opacity = visibility;
            dom.cameraSelectorContainer.style.pointerEvents = pointerEvents;
        }

        if (dom.sidebarToggleLabel) {
            dom.sidebarToggleLabel.style.opacity = visibility;
            dom.sidebarToggleLabel.style.pointerEvents = pointerEvents;
        }

        if (!isVisible && dom.cameraSelect) {
            dom.cameraSelect.style.display = 'none';
            cameraMenuVisible = false;
        }

        if (!isVisible && dom.sidebarToggle) {
            dom.sidebarToggle.checked = false;
        }
    }

    function handleSidebarClose(event) {
        if (!dom.sidebarMenu || !dom.sidebarToggle) {
            return;
        }

        const sidebarLabel = document.querySelector('label[for="sidebarToggle"]');
        const isSidebarOpen = dom.sidebarToggle.checked;

        if (
            isSidebarOpen &&
            !dom.sidebarMenu.contains(event.target) &&
            (!sidebarLabel || !sidebarLabel.contains(event.target))
        ) {
            dom.sidebarToggle.checked = false;
        }
    }

    document.addEventListener('mousedown', handleSidebarClose);
    document.addEventListener('touchstart', handleSidebarClose);

    function stopCameraForLifecycle(reason, options = {}) {
        const shouldClearScanResult = options.clearScanResult !== false;

        if (
            !state.scannerActive &&
            !state.scannerStarting &&
            !state.stream &&
            !state.scanPause?.active
        ) {
            return;
        }

        camera.cancelPendingRestart();
        camera.setAutoRestartAllowed(false);
        camera.stopQrScanner({ manual: true, reason });
        ui.setQrViewportState('idle');
        ui.setVideoVisible(false);

        if (shouldClearScanResult) {
            ui.clearScanResult();
        }

        hideCameraMenu();
    }

    async function startScanFromButton() {
        debugCamera('scan_button_click', {
            activeRootScreen: state.activeRootScreen,
            scannerActive: state.scannerActive,
            scannerPhase: state.scannerPhase,
            scannerStarting: state.scannerStarting,
            selectedCameraId: state.selectedCameraId,
            hasStream: Boolean(state.stream),
        });
        dom.scanButton?.classList.add('released');
        ui.clearScanResult();
        ui.hideManualInput();
        ui.setVideoVisible(true);
        ui.setQrViewportState('loading');
        await camera.startQrScanner(state.selectedCameraId);
        window.setTimeout(() => {
            dom.scanButton?.classList.remove('released');
        }, 500);
    }

    if (dom.scanButton) {
        const scanSwipeState = {
            active: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            suppressClick: false,
        };
        const SWIPE_STOP_THRESHOLD = 92;
        const SWIPE_MAX_OFFSET = 118;
        const TAP_MAX_DISTANCE = 10;

        function clearSuppressedClickSoon() {
            window.setTimeout(() => {
                scanSwipeState.suppressClick = false;
            }, 260);
        }

        function resetScanSwipeVisual() {
            dom.scanButton?.classList.remove('is-dragging');
            dom.scanButton?.style.setProperty('--scan-swipe-offset', '0px');
            dom.scanButton?.style.setProperty('--scan-swipe-progress', '0');
            dom.scanButton?.removeAttribute('data-swipe-direction');
        }

        function updateScanSwipeVisual(offsetX) {
            const limitedOffset = Math.max(
                -SWIPE_MAX_OFFSET,
                Math.min(SWIPE_MAX_OFFSET, offsetX),
            );
            const progress = Math.min(
                Math.abs(limitedOffset) / SWIPE_STOP_THRESHOLD,
                1,
            );

            dom.scanButton?.style.setProperty(
                '--scan-swipe-offset',
                `${limitedOffset}px`,
            );
            dom.scanButton?.style.setProperty(
                '--scan-swipe-progress',
                progress.toFixed(3),
            );

            if (limitedOffset === 0) {
                dom.scanButton?.removeAttribute('data-swipe-direction');
                return;
            }

            dom.scanButton?.setAttribute(
                'data-swipe-direction',
                limitedOffset < 0 ? 'right' : 'left',
            );
        }

        dom.scanButton.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) {
                return;
            }

            scanSwipeState.active = true;
            scanSwipeState.pointerId = event.pointerId;
            scanSwipeState.startX = event.clientX;
            scanSwipeState.startY = event.clientY;
            dom.scanButton.setPointerCapture(event.pointerId);
            dom.scanButton.classList.add('is-dragging');
        });

        dom.scanButton.addEventListener('pointermove', (event) => {
            if (
                !scanSwipeState.active ||
                scanSwipeState.pointerId !== event.pointerId
            ) {
                return;
            }

            const offsetX = event.clientX - scanSwipeState.startX;
            const offsetY = event.clientY - scanSwipeState.startY;

            if (
                Math.abs(offsetY) > Math.abs(offsetX) &&
                Math.abs(offsetY) > TAP_MAX_DISTANCE
            ) {
                return;
            }

            updateScanSwipeVisual(offsetX);
        });

        async function finishScanButtonGesture(event) {
            if (
                !scanSwipeState.active ||
                scanSwipeState.pointerId !== event.pointerId
            ) {
                return;
            }

            const offsetX = event.clientX - scanSwipeState.startX;
            const offsetY = event.clientY - scanSwipeState.startY;
            const absOffsetX = Math.abs(offsetX);
            const absOffsetY = Math.abs(offsetY);

            scanSwipeState.active = false;
            scanSwipeState.pointerId = null;
            scanSwipeState.suppressClick = true;

            if (dom.scanButton.hasPointerCapture(event.pointerId)) {
                dom.scanButton.releasePointerCapture(event.pointerId);
            }

            if (absOffsetX >= SWIPE_STOP_THRESHOLD) {
                handleCameraStop();
                resetScanSwipeVisual();
                clearSuppressedClickSoon();
                return;
            }

            resetScanSwipeVisual();

            if (absOffsetX <= TAP_MAX_DISTANCE && absOffsetY <= TAP_MAX_DISTANCE) {
                await startScanFromButton();
            }

            clearSuppressedClickSoon();
        }

        dom.scanButton.addEventListener('pointerup', (event) => {
            void finishScanButtonGesture(event);
        });

        dom.scanButton.addEventListener('pointercancel', (event) => {
            if (
                !scanSwipeState.active ||
                scanSwipeState.pointerId !== event.pointerId
            ) {
                return;
            }

            scanSwipeState.active = false;
            scanSwipeState.pointerId = null;
            scanSwipeState.suppressClick = true;
            resetScanSwipeVisual();
            clearSuppressedClickSoon();
        });

        dom.scanButton.addEventListener('click', (event) => {
            if (scanSwipeState.suppressClick || event.detail !== 0) {
                event.preventDefault();
                scanSwipeState.suppressClick = false;
            }
        });

        dom.scanButton.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            void startScanFromButton();
        });
    }

    if (dom.inputModeButton) {
        dom.inputModeButton.addEventListener('click', (event) => {
            if (event.target?.closest?.('#manualSubmitButton')) {
                return;
            }

            ui.showManualInput();
            camera.stopQrScanner({ manual: true, reason: 'manual_input' });
            ui.setQrViewportState('idle');
            ui.setVideoVisible(false);
            ui.focusManualInput();
        });
    }

    async function submitManualTransferId() {
        const transferId = dom.manualTransferIdInput?.value.trim() || '';

        camera.stopQrScanner({ manual: true, reason: 'manual_input_submit' });
        ui.setQrViewportState('idle');
        ui.setVideoVisible(false);

        if (/^\d{4}$/.test(transferId) || /^\d{10}$/.test(transferId)) {
            await scanner.processTransferId(transferId);
            return;
        }

        ui.showScanResult('error', 'Неверный формат ID', '', '', '');
    }

    if (dom.manualTransferForm) {
        dom.manualTransferForm.addEventListener('submit', (event) => {
            event.preventDefault();
            void submitManualTransferId();
        });
    }

    if (dom.manualTransferIdInput) {
        dom.manualTransferIdInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            void submitManualTransferId();
        });
    }

    async function saveRawData(rawData) {
        if (!rawData) {
            ui.showScanResult('error', 'Введите данные', '', '', '');
            return false;
        }

        let courierName = '';
        let deliveryIds = [];

        try {
            ({ courierName, deliveryIds } = parseRawData(rawData));
        } catch (error) {
            ui.showScanResult('error', 'Ошибка разбора данных', '', '', '');
            return false;
        }

        if (!courierName) {
            ui.showScanResult('error', 'Не найдено имя курьера', '', '', '');
            return false;
        }

        if (deliveryIds.length === 0) {
            ui.showScanResult('error', 'Не найдены номера передач', '', '', '');
            return false;
        }

        try {
            await saveCourierAndDeliveries(service, courierName, deliveryIds);
            ui.showScanResult(
                'success',
                '',
                `Добавлен курьер: ${courierName}`,
                '',
                '',
            );
            return true;
        } catch (error) {
            console.error('Ошибка сохранения данных:', error);
            ui.showScanResult(
                'error',
                'Ошибка при сохранении',
                '',
                '',
                '',
            );
            return false;
        }
    }

    function openDataEntryModal() {
        const modal = ui.createModal({
            modalId: 'dataEntryModal',
            className: 'data-entry-modal-content',
            maxButtonWidth: 420,
        });

        const title = document.createElement('div');
        title.textContent = 'Ввод данных';
        title.className = 'data-entry-modal-title';

        const textarea = document.createElement('textarea');
        textarea.className = 'data-entry-textarea';
        textarea.placeholder = 'Введите нарпавление/имя курьера и список передач.';
        textarea.value = dom.sidebarDataInput?.value || '';

        const submitButton = ui.createPrimaryButton('Сохранить', {
            className: 'data-entry-submit-button',
        });
        submitButton.style.width = 'calc(100% - 24px)';
        submitButton.style.maxWidth = 'calc(100% - 24px)';
        submitButton.style.marginLeft = 'auto';
        submitButton.style.marginRight = 'auto';

        submitButton.addEventListener('click', async () => {
            submitButton.disabled = true;
            const isSaved = await saveRawData(textarea.value.trim());
            submitButton.disabled = false;

            if (isSaved) {
                if (dom.sidebarDataInput) {
                    dom.sidebarDataInput.value = '';
                }
                modal.close();
                return;
            }

            textarea.focus();
        });

        modal.content.appendChild(title);
        modal.content.appendChild(textarea);
        modal.content.appendChild(submitButton);

        window.setTimeout(() => textarea.focus(), 40);
    }

    if (dom.sidebarDataForm && dom.sidebarDataInput) {
        dom.sidebarDataForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const rawData = dom.sidebarDataInput.value.trim();

            if (!rawData) {
                ui.showScanResult('error', 'Введите данные', '', '', '');
                return;
            }

            let courierName = '';
            let deliveryIds = [];

            try {
                ({ courierName, deliveryIds } = parseRawData(rawData));
            } catch (error) {
                ui.showScanResult('error', 'Ошибка разбора данных', '', '', '');
                return;
            }

            if (!courierName) {
                ui.showScanResult('error', 'Не найдено имя курьера', '', '', '');
                return;
            }

            if (deliveryIds.length === 0) {
                ui.showScanResult('error', 'Не найдены номера передач', '', '', '');
                return;
            }

            try {
                await saveCourierAndDeliveries(service, courierName, deliveryIds);
                dom.sidebarDataInput.value = '';
                ui.showScanResult(
                    'success',
                    '',
                    `Добавлен курьер: ${courierName}`,
                    '',
                    '',
                );
            } catch (error) {
                console.error('Ошибка сохранения данных:', error);
                ui.showScanResult(
                    'error',
                    'Ошибка при сохранении',
                    '',
                    '',
                    '',
                );
            }
        });
    }

    function hideCameraMenu() {
        if (!dom.cameraSelect) {
            return;
        }

        dom.cameraSelect.style.display = 'none';
        dom.cameraSelect.style.position = '';
        dom.cameraSelect.style.left = '';
        dom.cameraSelect.style.top = '';
        dom.cameraSelect.style.width = '';
        dom.cameraSelect.style.minWidth = '';
        dom.cameraSelect.style.maxWidth = '';
        restoreCameraSelectToHomeHost();
        cameraMenuVisible = false;
    }

    function positionCameraMenu(anchorElement) {
        if (!dom.cameraSelect || !anchorElement) {
            return;
        }

        const rect = anchorElement.getBoundingClientRect();
        const viewportPadding = 16;
        const menuWidth = Math.min(
            Math.max(rect.width, 180),
            window.innerWidth - viewportPadding * 2,
        );
        const left = Math.min(
            Math.max(viewportPadding, rect.left),
            Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
        );
        const top = Math.min(rect.bottom + 8, window.innerHeight - 56);

        dom.cameraSelect.style.position = 'fixed';
        dom.cameraSelect.style.left = `${left}px`;
        dom.cameraSelect.style.top = `${top}px`;
        dom.cameraSelect.style.width = `${menuWidth}px`;
        dom.cameraSelect.style.minWidth = `${menuWidth}px`;
        dom.cameraSelect.style.maxWidth = `${menuWidth}px`;
    }

    async function toggleCameraMenu(anchorElement = null) {
        if (!dom.cameraSelect) {
            return;
        }

        if (!cameraMenuVisible) {
            await camera.updateCameraList();
            if (anchorElement) {
                if (dom.cameraSelect.parentElement !== document.body) {
                    document.body.appendChild(dom.cameraSelect);
                }
                positionCameraMenu(anchorElement);
            } else {
                restoreCameraSelectToHomeHost();
                dom.cameraSelect.style.position = '';
                dom.cameraSelect.style.left = '';
                dom.cameraSelect.style.top = '';
                dom.cameraSelect.style.width = '';
                dom.cameraSelect.style.minWidth = '';
                dom.cameraSelect.style.maxWidth = '';
            }
            dom.cameraSelect.style.display = 'inline-block';
            if (typeof dom.cameraSelect.showPicker === 'function') {
                window.setTimeout(() => {
                    if (cameraMenuVisible) {
                        dom.cameraSelect.showPicker();
                    }
                }, 0);
            }
            cameraMenuVisible = true;
            return;
        }

        hideCameraMenu();
    }

    function closeCameraPickerModal() {
        if (!activeCameraPickerModal) {
            return;
        }

        activeCameraPickerModal.close();
        activeCameraPickerModal = null;
    }

    function getCameraPresentation(cameraItem, index, typeCounters) {
        const rawLabel = String(cameraItem?.label || '').trim();
        const normalizedLabel = rawLabel.toLowerCase();
        let kind = 'default';
        let title = `Камера ${index + 1}`;

        if (/front|user/.test(normalizedLabel)) {
            kind = 'front';
            title = 'Фронтальная камера';
        } else if (/ultra/.test(normalizedLabel)) {
            kind = 'ultra';
            title = 'Ультраширокая камера';
        } else if (/wide/.test(normalizedLabel)) {
            kind = 'wide';
            title = 'Широкоугольная камера';
        } else if (/macro/.test(normalizedLabel)) {
            kind = 'macro';
            title = 'Макро камера';
        } else if (/back|rear|environment/.test(normalizedLabel)) {
            kind = 'back';
            title = 'Основная камера';
        }

        typeCounters[kind] = (typeCounters[kind] || 0) + 1;
        if (typeCounters[kind] > 1) {
            title = `${title} ${typeCounters[kind]}`;
        }

        const meta = rawLabel
            ? rawLabel
                  .replace(/facing back/gi, 'основная')
                  .replace(/facing front/gi, 'фронтальная')
                  .replace(/camera/gi, 'камера')
            : `Устройство ${index + 1}`;

        return {
            meta,
            title,
        };
    }

    async function openCameraPickerModal() {
        const cameras = await camera.updateCameraList();

        if (!Array.isArray(cameras) || cameras.length === 0) {
            ui.showScanResult('error', 'Камеры не найдены', '', '', '');
            return;
        }

        closeCameraPickerModal();
        hideCameraMenu();

        const modal = ui.createModal({
            modalId: 'cameraPickerModal',
            className: 'camera-picker-modal-content',
            maxButtonWidth: 420,
        });
        const baseClose = modal.close;
        modal.close = (...args) => {
            if (activeCameraPickerModal === modal) {
                activeCameraPickerModal = null;
            }

            return baseClose(...args);
        };
        activeCameraPickerModal = modal;
        modal.backdrop._cleanupModal = modal.close;

        const title = document.createElement('div');
        title.className = 'data-entry-modal-title';
        title.textContent = 'Выбор камеры';

        const description = document.createElement('div');
        description.className = 'camera-picker-modal-description';
        description.textContent = 'Выберите камеру для сканирования';

        const list = document.createElement('div');
        list.className = 'camera-picker-list';

        const typeCounters = {};

        cameras.forEach((cameraItem, index) => {
            const option = document.createElement('button');
            const presentation = getCameraPresentation(
                cameraItem,
                index,
                typeCounters,
            );

            option.type = 'button';
            option.className = 'camera-picker-option';
            option.classList.toggle(
                'is-selected',
                cameraItem.deviceId === state.selectedCameraId,
            );

            const textWrap = document.createElement('span');
            textWrap.className = 'camera-picker-option-text';

            const titleText = document.createElement('span');
            titleText.className = 'camera-picker-option-title';
            titleText.textContent = presentation.title;

            const metaText = document.createElement('span');
            metaText.className = 'camera-picker-option-meta';
            metaText.textContent = presentation.meta;

            const indicator = document.createElement('span');
            indicator.className = 'camera-picker-option-indicator';
            indicator.setAttribute('aria-hidden', 'true');

            textWrap.appendChild(titleText);
            textWrap.appendChild(metaText);
            option.appendChild(textWrap);
            option.appendChild(indicator);

            option.addEventListener('click', async () => {
                closeCameraPickerModal();
                await camera.handleCameraSelection(cameraItem.deviceId, {
                    restartIfActive:
                        state.activeRootScreen === 'home' && state.scannerActive,
                    source: state.activeRootScreen,
                });
            });

            list.appendChild(option);
        });

        modal.content.appendChild(title);
        modal.content.appendChild(description);
        modal.content.appendChild(list);
    }

    function openSettingsModal() {
        const modal = ui.createModal({
            modalId: 'settingsModal',
            className: 'data-entry-modal-content',
            maxButtonWidth: 420,
        });

        const title = document.createElement('div');
        title.textContent = 'Настройки';
        title.className = 'data-entry-modal-title';

        const cameraButton = ui.createPrimaryButton('Выбор камеры', {
            className: 'data-entry-submit-button',
        });

        cameraButton.addEventListener('click', async () => {
            modal.close();
            await openCameraPickerModal();
        });

        modal.content.appendChild(title);
        modal.content.appendChild(cameraButton);
    }

    function openDataEntryPagePanel(options = {}) {
        setActiveBottomNav('data');
        const page = ui.showAppPage({
            bodyClassName: 'data-entry-screen',
            direction: options.direction,
            pageId: 'dataEntryPage',
            title: 'Данные',
        });

        const textarea = document.createElement('textarea');
        textarea.className = 'data-entry-textarea';
        textarea.placeholder = 'Введите нарпавление/имя курьера и список передач.';
        textarea.value = dom.sidebarDataInput?.value || '';

        const submitButton = ui.createPrimaryButton('Сохранить', {
            className: 'data-entry-submit-button',
        });

        submitButton.addEventListener('click', async () => {
            submitButton.disabled = true;
            const isSaved = await saveRawData(textarea.value.trim());
            submitButton.disabled = false;

            if (isSaved) {
                if (dom.sidebarDataInput) {
                    dom.sidebarDataInput.value = '';
                }
                showScannerHomePage({
                    direction: 'forward',
                });
                return;
            }

            textarea.focus();
        });

        page.body.appendChild(textarea);
        page.body.appendChild(submitButton);

    }

    function openSettingsPagePanel(options = {}) {
        setActiveBottomNav('settings');
        const page = ui.showAppPage({
            bodyClassName: 'settings-screen',
            direction: options.direction,
            pageId: 'settingsPage',
            title: 'Настройки',
        });

        const card = document.createElement('div');
        card.className = 'app-page-card';

        function decorateSettingsButton(button, iconMarkup, label) {
            button.classList.add('settings-panel-button');
            button.textContent = '';

            const icon = document.createElement('span');
            icon.className = 'settings-panel-button-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = iconMarkup;

            const text = document.createElement('span');
            text.className = 'settings-panel-button-label';
            text.textContent = label;

            const spacer = document.createElement('span');
            spacer.className = 'settings-panel-button-spacer';
            spacer.setAttribute('aria-hidden', 'true');

            button.appendChild(icon);
            button.appendChild(text);
            button.appendChild(spacer);
        }

        const themeButton = ui.createPrimaryButton('Тема приложения', {
            className: 'data-entry-submit-button',
        });
        decorateSettingsButton(
            themeButton,
            `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4.5V6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M12 17.5V19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M4.5 12H6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M17.5 12H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M6.7 6.7L8.1 8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M15.9 15.9L17.3 17.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M17.3 6.7L15.9 8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M8.1 15.9L6.7 17.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12Z" stroke="currentColor" stroke-width="1.8"/>
                </svg>
            `,
            'Тема приложения'
        );

        const themeSelector = document.createElement('div');
        themeSelector.className = 'theme-selector';

        const themeRadioGroup = document.createElement('div');
        themeRadioGroup.className = 'theme-radio-group';

        const blueThemeButton = document.createElement('button');
        blueThemeButton.type = 'button';
        blueThemeButton.className = 'theme-radio-button';
        blueThemeButton.textContent = 'Синяя';

        const darkThemeButton = document.createElement('button');
        darkThemeButton.type = 'button';
        darkThemeButton.className = 'theme-radio-button';
        darkThemeButton.textContent = 'Темная';

        function syncThemeSelector(themeName) {
            const isDark = themeName === 'dark';
            blueThemeButton.classList.toggle('is-active', !isDark);
            darkThemeButton.classList.toggle('is-active', isDark);
            themeRadioGroup.style.setProperty('--theme-active-index', isDark ? '1' : '0');
            themeRadioGroup.setAttribute('data-theme-preview', isDark ? 'dark' : 'blue');
        }

        blueThemeButton.addEventListener('click', () => {
            syncThemeSelector(applyTheme('blue'));
        });

        darkThemeButton.addEventListener('click', () => {
            syncThemeSelector(applyTheme('dark'));
        });

        themeRadioGroup.appendChild(blueThemeButton);
        themeRadioGroup.appendChild(darkThemeButton);
        themeSelector.appendChild(themeRadioGroup);

        themeButton.addEventListener('click', () => {
            setCameraSelectorOpen(false);
            themeSelector.classList.toggle('is-open');
        });

        syncThemeSelector(document.body.dataset.theme || 'blue');

        const cameraButton = ui.createPrimaryButton('Выбор камеры', {
            className: 'data-entry-submit-button',
        });
        decorateSettingsButton(
            cameraButton,
            `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 8.5C4 7.67157 4.67157 7 5.5 7H8L9.4 5.6C9.77574 5.22426 10.2852 5 10.8166 5H13.1834C13.7148 5 14.2243 5.22426 14.6 5.6L16 7H18.5C19.3284 7 20 7.67157 20 8.5V16.5C20 17.3284 19.3284 18 18.5 18H5.5C4.67157 18 4 17.3284 4 16.5V8.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M12 14.75C13.5188 14.75 14.75 13.5188 14.75 12C14.75 10.4812 13.5188 9.25 12 9.25C10.4812 9.25 9.25 10.4812 9.25 12C9.25 13.5188 10.4812 14.75 12 14.75Z" stroke="currentColor" stroke-width="1.8"/>
                </svg>
            `,
            'Выбор камеры'
        );
        cameraButton.setAttribute('aria-expanded', 'false');

        const cameraChevron = cameraButton.querySelector('.settings-panel-button-spacer');
        if (cameraChevron) {
            cameraChevron.classList.add('settings-panel-button-chevron');
            cameraChevron.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        }

        const cameraSelector = document.createElement('div');
        cameraSelector.className = 'camera-picker-inline';
        const cameraSelectorContent = document.createElement('div');
        cameraSelectorContent.className = 'camera-picker-inline-content';

        const cameraSelectorDescription = document.createElement('div');
        cameraSelectorDescription.className = 'camera-picker-inline-description';
        cameraSelectorDescription.textContent = 'Выберите камеру для сканирования';

        const cameraSelectorList = document.createElement('div');
        cameraSelectorList.className = 'camera-picker-list';

        cameraSelectorContent.appendChild(cameraSelectorDescription);
        cameraSelectorContent.appendChild(cameraSelectorList);
        cameraSelector.appendChild(cameraSelectorContent);

        function setCameraSelectorOpen(isOpen) {
            cameraSelector.classList.toggle('is-open', isOpen);
            cameraButton.classList.toggle('is-open', isOpen);
            cameraButton.setAttribute('aria-expanded', String(isOpen));
        }

        async function renderCameraSelector() {
            const cameras = await camera.updateCameraList();

            cameraSelectorList.innerHTML = '';

            if (!Array.isArray(cameras) || cameras.length === 0) {
                cameraSelectorDescription.textContent = 'Камеры не найдены';
                return false;
            }

            cameraSelectorDescription.textContent = 'Выберите камеру для сканирования';

            const typeCounters = {};

            cameras.forEach((cameraItem, index) => {
                const option = document.createElement('button');
                const presentation = getCameraPresentation(
                    cameraItem,
                    index,
                    typeCounters,
                );

                option.type = 'button';
                option.className = 'camera-picker-option';
                option.classList.toggle(
                    'is-selected',
                    cameraItem.deviceId === state.selectedCameraId,
                );

                const textWrap = document.createElement('span');
                textWrap.className = 'camera-picker-option-text';

                const titleText = document.createElement('span');
                titleText.className = 'camera-picker-option-title';
                titleText.textContent = presentation.title;

                const metaText = document.createElement('span');
                metaText.className = 'camera-picker-option-meta';
                metaText.textContent = presentation.meta;

                const indicator = document.createElement('span');
                indicator.className = 'camera-picker-option-indicator';
                indicator.setAttribute('aria-hidden', 'true');

                textWrap.appendChild(titleText);
                textWrap.appendChild(metaText);
                option.appendChild(textWrap);
                option.appendChild(indicator);

                option.addEventListener('click', async () => {
                    await camera.handleCameraSelection(cameraItem.deviceId, {
                        restartIfActive:
                            state.activeRootScreen === 'home' && state.scannerActive,
                        source: state.activeRootScreen,
                    });
                    setCameraSelectorOpen(false);
                });

                cameraSelectorList.appendChild(option);
            });

            return true;
        }

        cameraButton.addEventListener('click', async () => {
            const willOpen = !cameraSelector.classList.contains('is-open');

            themeSelector.classList.remove('is-open');

            if (!willOpen) {
                setCameraSelectorOpen(false);
                return;
            }

            const hasCameras = await renderCameraSelector();
            setCameraSelectorOpen(hasCameras);
        });

        card.appendChild(themeButton);
        card.appendChild(themeSelector);
        card.appendChild(cameraButton);
        card.appendChild(cameraSelector);
        page.body.appendChild(card);

        const versionNote = document.createElement('div');
        versionNote.className = 'settings-version-note';
        versionNote.textContent = APP_VERSION;
        page.body.appendChild(versionNote);
    }

    function showScannerHomePage(options = {}) {
        setActiveBottomNav('home');
        ui.showHomeScreen({
            direction: options.direction,
        });
        document.getElementById('transferSelectModal')?._cleanupModal?.();

        ui.clearScanResult();
        ui.hideManualInput();
        ui.setVideoVisible(Boolean(state.scannerActive));
        ui.setQrViewportState(state.scannerActive ? 'scanning' : 'idle');

        hideCameraMenu();
        closeCameraPickerModal();
    }

    function showScannerHome() {
        [
            'dataEntryModal',
            'settingsModal',
            'transferSelectModal',
        ].forEach((modalId) => {
            document.getElementById(modalId)?._cleanupModal?.();
        });

        document
            .querySelectorAll(
                '.archive-modal-content, .courierStatsModalContent, .select-modal-content, .archive-confirm-box, .data-entry-modal-content',
            )
            .forEach((element) => {
                element.parentElement?._cleanupModal?.() || element.parentElement?.remove();
            });

        ui.clearScanResult();
        ui.hideManualInput();
        ui.setVideoVisible(Boolean(state.scannerActive));
        ui.setQrViewportState(state.scannerActive ? 'scanning' : 'idle');

        hideCameraMenu();
        closeCameraPickerModal();
    }

    if (dom.cameraSelect) {
        dom.cameraSelect.addEventListener('change', async () => {
            const restartIfActive =
                state.activeRootScreen === 'home' && state.scannerActive;

            debugCamera('camera_select_change', {
                activeRootScreen: state.activeRootScreen,
                restartIfActive,
                selectedCameraId: dom.cameraSelect.value,
            });
            hideCameraMenu();
            await camera.handleCameraSelection(dom.cameraSelect.value, {
                restartIfActive,
                source: state.activeRootScreen,
            });
        });
    }

    let lastCameraStopAt = 0;

    function handleCameraStop(event) {
        event?.preventDefault?.();
        const now = Date.now();

        if (now - lastCameraStopAt < 300) {
            return;
        }

        lastCameraStopAt = now;
        stopCameraForLifecycle('camera_stop_button');

        debugCamera('camera_stop_button', {
            activeRootScreen: state.activeRootScreen,
            scannerActive: state.scannerActive,
            scannerPhase: state.scannerPhase,
            scannerStarting: state.scannerStarting,
            selectedCameraId: state.selectedCameraId,
            stopReason: state.stopReason,
            hasStream: Boolean(state.stream),
        });
        hideCameraMenu();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') {
            return;
        }

        stopCameraForLifecycle('app_hidden');
    });

    window.addEventListener('pagehide', () => {
        stopCameraForLifecycle('app_pagehide');
    });

    if (dom.bottomDataButton) {
        dom.bottomDataButton.addEventListener('click', () => {
            if (isBottomNavTargetActive('data')) {
                return;
            }

            openDataEntryPagePanel({
                direction: getBottomNavDirection('data'),
            });
        });
    }

    if (dom.bottomCouriersButton) {
        dom.bottomCouriersButton.addEventListener('click', () => {
            if (isBottomNavTargetActive('couriers')) {
                return;
            }

            const direction = getBottomNavDirection('couriers');
            setActiveBottomNav('couriers');
            openCourierPage({
                direction,
                service,
                ui,
            });
        });
    }

    if (dom.bottomArchiveButton) {
        dom.bottomArchiveButton.addEventListener('click', () => {
            if (isBottomNavTargetActive('archive')) {
                return;
            }

            const direction = getBottomNavDirection('archive');
            setActiveBottomNav('archive');
            openArchivePage({
                direction,
                service,
                ui,
            });
        });
    }

    if (dom.bottomHomeButton) {
        dom.bottomHomeButton.addEventListener('click', () => {
            if (isBottomNavTargetActive('home')) {
                return;
            }

            showScannerHomePage({
                direction: getBottomNavDirection('home'),
            });
        });
    }

    if (dom.bottomSettingsButton) {
        dom.bottomSettingsButton.addEventListener('click', () => {
            if (isBottomNavTargetActive('settings')) {
                return;
            }

            openSettingsPagePanel({
                direction: getBottomNavDirection('settings'),
            });
        });
    }

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'blue');
    setActiveBottomNav('home');

    const scheduleAdminWarmup =
        window.requestIdleCallback
            ? (callback) => window.requestIdleCallback(callback, { timeout: 1200 })
            : (callback) => window.setTimeout(callback, 250);

    scheduleAdminWarmup(() => {
        void service.warmAdminData?.();
    });
});
