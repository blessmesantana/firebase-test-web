import * as service from './firebase-service.js';
import { createCameraController } from './camera.js';
import {
    initializeSidebarAdmin,
    openArchivePage,
    openCourierPage,
} from './couriers.js';
import { parseRawData, saveCourierAndDeliveries } from './deliveries.js';
import {
    captureException,
    initLogger,
    setContext as setLoggerContext,
    trackEvent,
} from './logger.js';
import { createScannerController } from './scanner.js';
import { createUiController } from './ui.js';
import { openAdminPanelPagePanel } from './admin-panel.js';
import { openEncyclopediaPagePanel } from './encyclopedia.js';
import { markNewBadgeSeen, shouldShowNewBadge } from './new-badges.js';
import { openWhatsNewPagePanel } from './whats-new.js';

document.addEventListener('DOMContentLoaded', () => {
    const DEBUG_CAMERA = new URLSearchParams(window.location.search).has('debugCamera');
    const IS_IOS = (() => {
        const ua = navigator.userAgent || '';
        const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
        const isIpadOsDesktopMode =
            navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        return isAppleMobile || isIpadOsDesktopMode;
    })();
    document.documentElement.classList.toggle('platform-ios', IS_IOS);

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
        manualSubmitButtonIos: null,
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

    function setupIosManualSubmitButton() {
        if (!IS_IOS || !dom.manualSubmitButton) {
            return;
        }

        const iosButton = document.createElement('button');
        iosButton.id = 'manualSubmitButtonIos';
        iosButton.type = 'button';
        iosButton.className = `${dom.manualSubmitButton.className} manual-entry-submit-ios`;
        iosButton.setAttribute(
            'aria-label',
            dom.manualSubmitButton.getAttribute('aria-label') || 'Отправить ID',
        );
        iosButton.setAttribute(
            'title',
            dom.manualSubmitButton.getAttribute('title') || 'Отправить ID',
        );
        iosButton.innerHTML = dom.manualSubmitButton.innerHTML;

        dom.manualSubmitButton.setAttribute('aria-hidden', 'true');
        dom.manualSubmitButton.tabIndex = -1;
        dom.manualSubmitButton.after(iosButton);
        dom.manualSubmitButtonIos = iosButton;
    }

    setupIosManualSubmitButton();

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
    const BUTTON_PALETTE_STORAGE_KEY = 'appButtonPalette';
    const APP_VERSION = 'v1.9.5.1';
    const ADMIN_PANEL_PASSWORD_HASH =
        '35a092cbedd97769bf58b31dcb81324bceba0a55e0c7a61a6db37f8ec24e6784';
    const THEMES = ['light', 'blue', 'dark'];
    const THEME_BROWSER_COLORS = {
        light: '#e8e8e8',
        blue: '#3949AB',
        dark: '#141414',
    };
    const BUTTON_PALETTES = ['default', 'pink', 'platinum', 'gold', 'white'];
    let cameraMenuVisible = false;
    let activeCameraPickerModal = null;
    let cameraMenuRequestId = 0;
    let cameraPickerRequestId = 0;

    function isPageHandleActive(pageHandle) {
        return Boolean(pageHandle?.page?.isConnected);
    }
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
        setLoggerContext({ theme: resolvedTheme });
        return resolvedTheme;
    }

    function applyButtonPalette(paletteName) {
        const resolvedPalette = BUTTON_PALETTES.includes(paletteName) ? paletteName : 'default';

        if (resolvedPalette === 'default') {
            delete document.documentElement.dataset.buttonPalette;
            delete document.body.dataset.buttonPalette;
            localStorage.removeItem(BUTTON_PALETTE_STORAGE_KEY);
        } else {
            document.documentElement.dataset.buttonPalette = resolvedPalette;
            document.body.dataset.buttonPalette = resolvedPalette;
            localStorage.setItem(BUTTON_PALETTE_STORAGE_KEY, resolvedPalette);
        }

        setLoggerContext({ buttonPalette: resolvedPalette });
        return resolvedPalette;
    }

    function detectRuntimeContext() {
        const ua = navigator.userAgent || '';
        const platformHint = (
            navigator.userAgentData?.platform
            || navigator.platform
            || ''
        ).toLowerCase();
        const maxTouchPoints = navigator.maxTouchPoints || 0;
        const isTouch = maxTouchPoints > 0 || 'ontouchstart' in window;
        const smallestViewport = Math.min(window.innerWidth || 0, window.innerHeight || 0);
        const largestViewport = Math.max(window.innerWidth || 0, window.innerHeight || 0);

        let os = 'unknown';

        if (/iphone|ipad|ipod/i.test(ua) || (platformHint === 'macintel' && maxTouchPoints > 1)) {
            os = 'ios';
        } else if (/android/i.test(ua)) {
            os = 'android';
        } else if (platformHint.includes('win') || /windows/i.test(ua)) {
            os = 'windows';
        } else if (platformHint.includes('mac') || /mac os/i.test(ua)) {
            os = 'macos';
        } else if (platformHint.includes('linux') || /linux/i.test(ua)) {
            os = 'linux';
        }

        let browser = 'unknown';

        if (/edg\//i.test(ua)) {
            browser = 'edge';
        } else if (/opr\//i.test(ua) || /opera/i.test(ua)) {
            browser = 'opera';
        } else if (/firefox\//i.test(ua) || /fxios/i.test(ua)) {
            browser = 'firefox';
        } else if (/crios\//i.test(ua) || /chrome\//i.test(ua)) {
            browser = 'chrome';
        } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
            browser = 'safari';
        }

        let deviceType = 'desktop';

        if (
            /ipad|tablet/i.test(ua)
            || (os === 'ios' && !/iphone/i.test(ua) && isTouch)
            || (isTouch && smallestViewport >= 600 && largestViewport >= 800)
        ) {
            deviceType = 'tablet';
        } else if (/mobi|iphone|ipod|android/i.test(ua) || (isTouch && smallestViewport < 600)) {
            deviceType = 'mobile';
        }

        return {
            browser,
            deviceType,
            isTouch,
            os,
            pixelRatio: window.devicePixelRatio || 1,
            platform: deviceType,
            url: window.location.href || 'unknown',
            userAgent: ua || 'unknown',
            viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
            visibilityState: document.visibilityState || 'unknown',
        };
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
        setLoggerContext({ screen: activeKey });
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
            if (event.target?.closest?.('#manualSubmitButton, #manualSubmitButtonIos')) {
                return;
            }

            ui.showManualInput();
            camera.stopQrScanner({ manual: true, reason: 'manual_input' });
            ui.setQrViewportState('idle');
            ui.setVideoVisible(false);
            ui.focusManualInput();
        });
    }

    let manualSubmitInFlight = false;

    function normalizeTransferId(rawValue) {
        return String(rawValue || '').replace(/\D/g, '');
    }

    async function submitManualTransferId() {
        if (manualSubmitInFlight) {
            return;
        }

        const transferId = normalizeTransferId(dom.manualTransferIdInput?.value);

        manualSubmitInFlight = true;

        camera.stopQrScanner({ manual: true, reason: 'manual_input_submit' });
        ui.setQrViewportState('idle');
        ui.setVideoVisible(false);

        try {
            if (/^\d{4}$/.test(transferId) || /^\d{10}$/.test(transferId)) {
                await scanner.processTransferId(transferId);
                return;
            }

            trackEvent('manual_submit_invalid', {
                inputLength: transferId.length,
                source: 'manual_submit',
            }, 'warning');
            ui.showScanResult('error', 'Неверный формат ID', '', '', '');
        } finally {
            manualSubmitInFlight = false;
        }
    }

    if (dom.manualTransferForm) {
        dom.manualTransferForm.addEventListener('submit', (event) => {
            event.preventDefault();
            void submitManualTransferId();
        });
    }

    if (dom.manualSubmitButton) {
        dom.manualSubmitButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!dom.manualTransferForm) {
                void submitManualTransferId();
                return;
            }

            if (typeof dom.manualTransferForm.requestSubmit === 'function') {
                try {
                    dom.manualTransferForm.requestSubmit();
                    return;
                } catch (error) {}
            }

            dom.manualTransferForm.dispatchEvent(
                new Event('submit', { bubbles: true, cancelable: true }),
            );
        });
    }

    if (IS_IOS && dom.manualSubmitButtonIos) {
        let lastIosSubmitAt = 0;
        const IOS_SUBMIT_DEBOUNCE_MS = 320;

        function handleIosManualSubmit(event) {
            event.preventDefault();
            event.stopPropagation();

            const now = Date.now();
            if (now - lastIosSubmitAt < IOS_SUBMIT_DEBOUNCE_MS) {
                return;
            }

            lastIosSubmitAt = now;
            void submitManualTransferId();
        }

        dom.manualSubmitButtonIos.addEventListener('touchend', handleIosManualSubmit, {
            passive: false,
        });
        dom.manualSubmitButtonIos.addEventListener('click', handleIosManualSubmit);
    }

    function showRawDataFeedback(message, options = {}) {
        const feedback = options.feedback === 'toast' ? 'toast' : 'overlay';

        if (feedback === 'toast') {
            ui.showToast(message, {
                duration: 2200,
                type: 'error',
            });
            return;
        }

        ui.showScanResult('data_error', message, '', '', '');
    }

    async function saveRawData(rawData, options = {}) {
        if (!rawData) {
            showRawDataFeedback('Введите данные', options);
            return false;
        }

        let courierName = '';
        let deliveryIds = [];

        try {
            ({ courierName, deliveryIds } = parseRawData(rawData));
        } catch (error) {
            captureException(error, {
                operation: 'save_raw_data_parse',
                screen: state.activeRootScreen,
                tags: {
                    scope: 'data_entry',
                },
            });
            showRawDataFeedback('Ошибка разбора данных', options);
            return false;
        }

        if (!courierName) {
            showRawDataFeedback('Не найдено имя курьера', options);
            return false;
        }

        if (deliveryIds.length === 0) {
            showRawDataFeedback('Не найдены номера передач', options);
            return false;
        }

        try {
            const saveResult = await saveCourierAndDeliveries(
                service,
                courierName,
                deliveryIds,
            );
            trackCourierSaveEvent(courierName, saveResult);
            ui.showScanResult(
                'data_success',
                '',
                buildCourierSaveMessage(courierName, saveResult),
                '',
                '',
            );
            return {
                courierName,
                saveResult,
            };
        } catch (error) {
            captureException(error, {
                courierName,
                deliveryCount: deliveryIds.length,
                operation: 'save_raw_data',
                screen: state.activeRootScreen,
                tags: {
                    scope: 'data_entry',
                },
            });
            showRawDataFeedback('Ошибка при сохранении', options);
            return false;
        }
    }

    function buildCourierSaveMessage(courierName, saveResult) {
        if (!saveResult || typeof saveResult !== 'object') {
            return `Добавлены передачи для ${courierName}`;
        }

        const conflictingCouriers = Array.isArray(saveResult.conflictingCourierNames)
            ? saveResult.conflictingCourierNames.filter(Boolean)
            : [];
        const conflictingCourierLabel =
            conflictingCouriers.length === 1
                ? conflictingCouriers[0]
                : conflictingCouriers.length > 1
                  ? conflictingCouriers.join(', ')
                  : '';

        if (saveResult.addedCount === 0 && saveResult.crossCourierDuplicateCount > 0) {
            if (conflictingCourierLabel) {
                return `У ${conflictingCourierLabel} уже есть эти передачи`;
            }

            return 'У другого курьера уже есть эти передачи';
        }

        if (saveResult.addedCount === 0) {
            return `Все передачи у ${courierName} уже сохранены`;
        }

        if (saveResult.crossCourierDuplicateCount > 0) {
            if (conflictingCourierLabel) {
                return `Добавлено ${saveResult.addedCount} для ${courierName}, часть уже у ${conflictingCourierLabel}`;
            }

            return `Добавлено ${saveResult.addedCount} для ${courierName}, часть уже у других курьеров`;
        }

        if (saveResult.duplicateCount === 0) {
            return saveResult.createdCourier
                ? `${courierName} добавлен, сохранено ${saveResult.addedCount}`
                : `Добавлено передач для ${courierName}: ${saveResult.addedCount}`;
        }

        return `Добавлено ${saveResult.addedCount} для ${courierName}, пропущено ${saveResult.duplicateCount}`;
    }

    function buildDataEntryToastMessage(savePayload) {
        const saveResult = savePayload?.saveResult;

        if (!saveResult || typeof saveResult !== 'object') {
            return 'Список загружен';
        }

        if (saveResult.addedCount === 0 && saveResult.crossCourierDuplicateCount > 0) {
            return 'Передачи уже есть у другого курьера';
        }

        if (saveResult.addedCount === 0 && saveResult.duplicateCount > 0) {
            return 'Дубли пропущены';
        }

        if (saveResult.crossCourierDuplicateCount > 0) {
            return 'Часть передач уже есть у другого курьера';
        }

        if (saveResult.duplicateCount > 0) {
            return 'Список загружен, дубли пропущены';
        }

        return 'Список загружен';
    }

    function trackCourierSaveEvent(courierName, saveResult, source = 'data') {
        const meta = {
            addedCount: saveResult?.addedCount ?? 0,
            conflictingCourierNames: saveResult?.conflictingCourierNames ?? [],
            courierName,
            crossCourierDuplicateCount: saveResult?.crossCourierDuplicateCount ?? 0,
            duplicateCount: saveResult?.duplicateCount ?? 0,
            requestedCount: saveResult?.requestedCount ?? 0,
            source,
        };

        if (
            (saveResult?.addedCount ?? 0) === 0 &&
            (saveResult?.crossCourierDuplicateCount ?? 0) > 0
        ) {
            trackEvent('courier_conflicts_skipped', meta, 'info');
            return;
        }

        if ((saveResult?.addedCount ?? 0) === 0 && (saveResult?.duplicateCount ?? 0) > 0) {
            trackEvent('courier_duplicates_skipped', meta, 'info');
            return;
        }

        trackEvent('courier_saved', meta, 'info');
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
                captureException(error, {
                    operation: 'sidebar_parse_raw_data',
                    screen: state.activeRootScreen,
                    tags: {
                        scope: 'sidebar',
                    },
                });
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
                const saveResult = await saveCourierAndDeliveries(
                    service,
                    courierName,
                    deliveryIds,
                );

                dom.sidebarDataInput.value = '';
                trackCourierSaveEvent(courierName, saveResult, 'sidebar');
                ui.showScanResult(
                    'data_success',
                    '',
                    buildCourierSaveMessage(courierName, saveResult),
                    '',
                    '',
                );
            } catch (error) {
                captureException(error, {
                    courierName,
                    deliveryCount: deliveryIds.length,
                    operation: 'sidebar_save_raw_data',
                    screen: state.activeRootScreen,
                    tags: {
                        scope: 'sidebar',
                    },
                });
                ui.showScanResult(
                    'data_error',
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

        cameraMenuRequestId += 1;
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
            const requestId = ++cameraMenuRequestId;
            await camera.updateCameraList();

            if (requestId !== cameraMenuRequestId || state.activeRootScreen !== 'home') {
                return;
            }

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
                    if (cameraMenuVisible && requestId === cameraMenuRequestId) {
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
        cameraPickerRequestId += 1;

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
        const requestId = ++cameraPickerRequestId;
        const cameras = await camera.updateCameraList();

        if (requestId !== cameraPickerRequestId) {
            return;
        }

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
            const savePayload = await saveRawData(textarea.value.trim(), {
                feedback: 'toast',
            });
            submitButton.disabled = false;

            if (savePayload) {
                if (dom.sidebarDataInput) {
                    dom.sidebarDataInput.value = '';
                }
                textarea.value = '';
                ui.showToast(buildDataEntryToastMessage(savePayload), {
                    duration: 1800,
                });
                textarea.focus();
                return;
            }

            textarea.focus();
        });

        page.body.appendChild(textarea);
        page.body.appendChild(submitButton);

    }

    function formatLogTimestamp(timestamp) {
        if (!timestamp) {
            return 'Без времени';
        }

        try {
            return new Date(timestamp).toLocaleString('ru-RU', {
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                month: '2-digit',
                second: '2-digit',
                year: 'numeric',
            });
        } catch (error) {
            return String(timestamp);
        }
    }

    function formatLogValue(value) {
        if (value == null || value === '') {
            return '—';
        }

        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (error) {
                return '[object]';
            }
        }

        return String(value);
    }

    const LOG_FIELD_LABELS = {
        addedCount: 'Новых передач',
        appVersion: 'Версия',
        browser: 'Браузер',
        buttonPalette: 'Палитра',
        cameraCount: 'Камер доступно',
        cameraLabel: 'Камера',
        column: 'Колонка',
        conflictingCourierNames: 'Найдены у курьеров',
        crossCourierDuplicateCount: 'Найдено у других курьеров',
        courierName: 'Курьер',
        deliveryId: 'Передача',
        deviceType: 'Тип устройства',
        errorMessage: 'Текст ошибки',
        errorName: 'Ошибка',
        hasStream: 'Поток активен',
        inputLength: 'Длина ввода',
        isTouch: 'Сенсорный ввод',
        level: 'Уровень',
        line: 'Строка',
        message: 'Сообщение',
        online: 'Онлайн',
        operation: 'Операция',
        os: 'ОС',
        pixelRatio: 'Pixel ratio',
        platform: 'Платформа',
        previousSelectedCameraId: 'Предыдущая камера',
        reason: 'Причина',
        requestedCount: 'Передач в списке',
        restartIfActive: 'Перезапуск при активной камере',
        scannerActive: 'Сканер активен',
        scannerStarting: 'Сканер запускается',
        screen: 'Экран',
        selectedCameraId: 'Выбранная камера',
        session: 'Сессия',
        sessionId: 'Сессия',
        source: 'Источник',
        stack: 'Стек',
        stopReason: 'Причина остановки',
        theme: 'Тема',
        time: 'Время',
        timestamp: 'Время',
        type: 'Событие',
        url: 'URL',
        userAgent: 'User-Agent',
        viewport: 'Viewport',
        visibility: 'Видимость',
        visibilityState: 'Видимость',
    };

    const LOG_LEVEL_LABELS = {
        error: 'Ошибка',
        info: 'Инфо',
        success: 'Успех',
        warning: 'Предупреждение',
    };

    const LOG_TYPE_LABELS = {
        all_data_deleted: 'Все данные удалены',
        camera_changed: 'Камера изменена',
        camera_permission_denied: 'Доступ к камере запрещён',
        camera_start_failed: 'Ошибка запуска камеры',
        courier_conflicts_skipped: 'Передачи найдены у другого курьера',
        courier_deleted: 'Курьер удалён',
        courier_duplicates_skipped: 'Дубли пропущены',
        courier_saved: 'Передачи сохранены',
        deliveries_deleted: 'Передачи удалены',
        delivery_deleted: 'Передача удалена',
        delivery_not_found: 'Передача не найдена',
        exception: 'Исключение',
        log_message: 'Сообщение лога',
        manual_submit_invalid: 'Неверный ввод ID',
    };

    function translateLogLabel(key) {
        return LOG_FIELD_LABELS[key] || key;
    }

    function translateLogLevel(level) {
        return LOG_LEVEL_LABELS[level] || level || 'Инфо';
    }

    function translateLogType(type) {
        return LOG_TYPE_LABELS[type] || type || 'Событие';
    }

    function sha256Fallback(value) {
        function rightRotate(amount, word) {
            return (word >>> amount) | (word << (32 - amount));
        }

        const mathPow = Math.pow;
        const maxWord = mathPow(2, 32);
        const lengthProperty = 'length';
        let result = '';
        const words = [];
        let ascii = unescape(encodeURIComponent(String(value || '')));
        const asciiBitLength = ascii[lengthProperty] * 8;
        const hash = (sha256Fallback._hash || []).slice(0);
        const k = sha256Fallback._k || [];
        let primeCounter = k[lengthProperty];
        const isComposite = {};

        for (let candidate = 2; primeCounter < 64; candidate += 1) {
            if (!isComposite[candidate]) {
                for (let composite = 0; composite < 313; composite += candidate) {
                    isComposite[composite] = candidate;
                }

                hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
                primeCounter += 1;
            }
        }

        sha256Fallback._hash = hash.slice(0, 8);
        sha256Fallback._k = k;

        ascii += '\x80';

        while ((ascii[lengthProperty] % 64) !== 56) {
            ascii += '\x00';
        }

        for (let index = 0; index < ascii[lengthProperty]; index += 1) {
            const charCode = ascii.charCodeAt(index);
            words[index >> 2] |= charCode << (((3 - index) % 4) * 8);
        }

        words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
        words[words[lengthProperty]] = asciiBitLength;

        for (let blockStart = 0; blockStart < words[lengthProperty]; ) {
            const workingHash = hash.slice(0, 8);
            const w = words.slice(blockStart, (blockStart += 16));

            for (let index = 0; index < 64; index += 1) {
                const word15 = w[index - 15];
                const word2 = w[index - 2];
                const a = workingHash[0];
                const e = workingHash[4];
                const temp1 =
                    workingHash[7]
                    + (rightRotate(6, e) ^ rightRotate(11, e) ^ rightRotate(25, e))
                    + ((e & workingHash[5]) ^ ((~e) & workingHash[6]))
                    + k[index]
                    + (w[index] = index < 16
                        ? w[index]
                        : (
                            w[index - 16]
                            + (rightRotate(7, word15) ^ rightRotate(18, word15) ^ (word15 >>> 3))
                            + w[index - 7]
                            + (rightRotate(17, word2) ^ rightRotate(19, word2) ^ (word2 >>> 10))
                        ) | 0);
                const temp2 =
                    (rightRotate(2, a) ^ rightRotate(13, a) ^ rightRotate(22, a))
                    + ((a & workingHash[1]) ^ (a & workingHash[2]) ^ (workingHash[1] & workingHash[2]));

                workingHash.pop();
                workingHash.unshift((temp1 + temp2) | 0);
                workingHash[4] = (workingHash[4] + temp1) | 0;
            }

            for (let index = 0; index < 8; index += 1) {
                hash[index] = (hash[index] + workingHash[index]) | 0;
            }
        }

        for (let index = 0; index < 8; index += 1) {
            for (let shift = 3; shift >= 0; shift -= 1) {
                const byte = (hash[index] >> (shift * 8)) & 255;
                result += ((byte < 16) ? '0' : '') + byte.toString(16);
            }
        }

        return result;
    }

    async function hashProtectedAccessValue(value) {
        const normalizedValue = String(value || '').trim();

        if (!window.crypto?.subtle || typeof TextEncoder === 'undefined') {
            return sha256Fallback(normalizedValue);
        }

        const bytes = new TextEncoder().encode(normalizedValue);
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);

        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function createLogMetaRows(meta = {}) {
        const entries = Object.entries(meta || {}).filter(([, value]) => value !== undefined);

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'logs-entry-empty';
            empty.textContent = 'Без дополнительных данных';
            return [empty];
        }

        return entries.map(([key, value]) => {
            const row = document.createElement('div');
            row.className = 'logs-entry-meta-row';

            const keyNode = document.createElement('span');
            keyNode.className = 'logs-entry-meta-key';
            keyNode.textContent = translateLogLabel(key);

            const valueNode = document.createElement('span');
            valueNode.className = 'logs-entry-meta-value';
            valueNode.textContent = formatLogValue(value);

            row.appendChild(keyNode);
            row.appendChild(valueNode);
            return row;
        });
    }

    function buildLogCopyText(eventItem) {
        const lines = [
            `${translateLogLabel('type')}: ${translateLogType(eventItem.type)}`,
            `${translateLogLabel('level')}: ${translateLogLevel(eventItem.level)}`,
            `${translateLogLabel('screen')}: ${eventItem.screen || 'unknown'}`,
            `${translateLogLabel('platform')}: ${eventItem.platform || 'unknown'}`,
            `${translateLogLabel('os')}: ${eventItem.os || 'unknown'}`,
            `${translateLogLabel('browser')}: ${eventItem.browser || 'unknown'}`,
            `${translateLogLabel('deviceType')}: ${eventItem.deviceType || 'unknown'}`,
            `${translateLogLabel('isTouch')}: ${String(Boolean(eventItem.isTouch))}`,
            `${translateLogLabel('viewport')}: ${eventItem.viewport || 'unknown'}`,
            `${translateLogLabel('pixelRatio')}: ${eventItem.pixelRatio ?? 'unknown'}`,
            `${translateLogLabel('visibility')}: ${eventItem.visibilityState || 'unknown'}`,
            `${translateLogLabel('time')}: ${formatLogTimestamp(eventItem.timestamp)}`,
            `${translateLogLabel('session')}: ${eventItem.sessionId || 'unknown'}`,
        ];

        Object.entries(eventItem.meta || {}).forEach(([key, value]) => {
            lines.push(`${translateLogLabel(key)}: ${formatLogValue(value)}`);
        });

        return lines.join('\n');
    }

    async function copyLogText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        try {
            return document.execCommand('copy');
        } finally {
            textarea.remove();
        }
    }

    function createLogEntry(eventItem) {
        const item = document.createElement('article');
        item.className = 'logs-entry';
        item.classList.add(`is-${eventItem.level || 'info'}`);

        const header = document.createElement('div');
        header.className = 'logs-entry-header';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'logs-entry-title-wrap';

        const typeNode = document.createElement('div');
        typeNode.className = 'logs-entry-type';
        typeNode.textContent = translateLogType(eventItem.type);

        const subtitleNode = document.createElement('div');
        subtitleNode.className = 'logs-entry-subtitle';
        subtitleNode.textContent = `${translateLogLevel(eventItem.level)} • ${eventItem.screen || 'unknown'} • ${eventItem.os || 'unknown'}/${eventItem.browser || 'unknown'}`;

        const timeNode = document.createElement('div');
        timeNode.className = 'logs-entry-time';
        timeNode.textContent = formatLogTimestamp(eventItem.timestamp);

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'logs-entry-copy-button';
        copyButton.textContent = 'Копировать';
        copyButton.addEventListener('click', () => {
            void copyLogText(buildLogCopyText(eventItem))
                .then((isCopied) => {
                    ui.showToast(
                        isCopied ? 'Лог скопирован' : 'Не удалось скопировать лог',
                        {
                            duration: 1600,
                            type: isCopied ? 'success' : 'error',
                        },
                    );
                })
                .catch(() => {
                    ui.showToast('Не удалось скопировать лог', {
                        duration: 1600,
                        type: 'error',
                    });
                });
        });

        const sessionNode = document.createElement('div');
        sessionNode.className = 'logs-entry-session';
        sessionNode.textContent = `session ${String(eventItem.sessionId || 'unknown').slice(0, 8)}`;

        const metaBlock = document.createElement('div');
        metaBlock.className = 'logs-entry-meta';
        createLogMetaRows(eventItem.meta).forEach((row) => {
            metaBlock.appendChild(row);
        });

        titleWrap.appendChild(typeNode);
        titleWrap.appendChild(subtitleNode);
        header.appendChild(titleWrap);
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'logs-entry-actions';
        actionsWrap.appendChild(timeNode);
        actionsWrap.appendChild(copyButton);
        header.appendChild(actionsWrap);
        item.appendChild(header);
        item.appendChild(sessionNode);
        item.appendChild(metaBlock);

        return item;
    }

    function openLogsPagePanel(options = {}) {
        setActiveBottomNav('settings');
        let unsubscribeTelemetry = null;
        let logsRenderRequestId = 0;

        const page = ui.showAppPage({
            bodyClassName: 'logs-screen',
            direction: options.direction,
            onClose: () => {
                logsRenderRequestId += 1;
                unsubscribeTelemetry?.();
            },
            onBack: () => {
                openSettingsPagePanel({
                    direction: 'backward',
                });
            },
            pageId: 'logsPage',
            title: 'Логи',
        });

        const layout = document.createElement('div');
        layout.className = 'logs-page-layout';

        const list = document.createElement('div');
        list.className = 'logs-list';

        const setLogsPlaceholder = (text) => {
            if (!isPageHandleActive(page)) {
                return;
            }

            list.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'logs-placeholder';
            placeholder.textContent = text;
            list.appendChild(placeholder);
        };

        const renderLogs = (items) => {
            if (!isPageHandleActive(page)) {
                return;
            }

            list.innerHTML = '';

            if (!Array.isArray(items) || items.length === 0) {
                setLogsPlaceholder('Логи пока не найдены');
                return;
            }

            items.forEach((eventItem) => {
                list.appendChild(createLogEntry(eventItem));
            });
        };

        layout.appendChild(list);
        page.body.appendChild(layout);
        setLogsPlaceholder('Загрузка логов...');

        if (typeof service.subscribeTelemetryEvents === 'function') {
            unsubscribeTelemetry = service.subscribeTelemetryEvents(
                (items) => {
                    if (!isPageHandleActive(page)) {
                        return;
                    }

                    renderLogs(items);
                },
                () => {
                    setLogsPlaceholder('Нет доступа к telemetry_events');
                },
            );
            return;
        }

        const requestId = ++logsRenderRequestId;
        void service.getTelemetryEvents()
            .then((items) => {
                if (
                    requestId !== logsRenderRequestId ||
                    !isPageHandleActive(page)
                ) {
                    return;
                }

                renderLogs(items);
            })
            .catch(() => {
                if (
                    requestId !== logsRenderRequestId ||
                    !isPageHandleActive(page)
                ) {
                    return;
                }

                setLogsPlaceholder('Нет доступа к telemetry_events');
            });
    }

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

    function appendSettingsNewBadge(button) {
        const badge = document.createElement('div');
        badge.className = 'settings-new-badge';
        badge.innerHTML = `
            <span class="settings-new-badge-icon" aria-hidden="true">
                <svg width="14" height="10" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.8 1.8L13.7 6.9L18.8 8.8L13.7 10.7L11.8 15.8L9.9 10.7L4.8 8.8L9.9 6.9L11.8 1.8Z" fill="currentColor"/>
                    <path d="M22.2 2.8L23.1 5.2L25.5 6.1L23.1 7L22.2 9.4L21.3 7L18.9 6.1L21.3 5.2L22.2 2.8Z" fill="currentColor" opacity="0.9"/>
                    <path d="M5.2 11.3L6.2 13.9L8.8 14.9L6.2 15.9L5.2 18.5L4.2 15.9L1.6 14.9L4.2 13.9L5.2 11.3Z" fill="currentColor" opacity="0.82"/>
                </svg>
            </span>
            <span class="settings-new-badge-text">New</span>
        `;
        button.classList.add('has-settings-badge');
        button.appendChild(badge);
    }

    function shouldShowEncyclopediaNewBadge() {
        return shouldShowNewBadge('encyclopedia_v1.9.5.0');
    }

    function handleEncyclopediaNewBadgeOpen(button) {
        markNewBadgeSeen('encyclopedia_v1.9.5.0');

        if (shouldShowEncyclopediaNewBadge()) {
            return;
        }

        button.querySelector('.settings-new-badge')?.remove();
        button.classList.remove('has-settings-badge');
    }

    function openThemeSettingsPagePanel(options = {}) {
        setActiveBottomNav('settings');

        const page = ui.showAppPage({
            bodyClassName: 'settings-screen theme-settings-screen',
            direction: options.direction,
            onBack: () => {
                openSettingsPagePanel({
                    direction: 'backward',
                });
            },
            pageId: 'themeSettingsPage',
            title: 'Настройки темы',
        });

        const layout = document.createElement('div');
        layout.className = 'theme-settings-page-layout';

        const card = document.createElement('div');
        card.className = 'app-page-card';

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
        themeButton.setAttribute('aria-expanded', 'false');

        const themeSelector = document.createElement('div');
        themeSelector.className = 'theme-selector';

        const themeRadioGroup = document.createElement('div');
        themeRadioGroup.className = 'theme-radio-group';

        const lightThemeButton = document.createElement('button');
        lightThemeButton.type = 'button';
        lightThemeButton.className = 'theme-radio-button';
        lightThemeButton.textContent = 'Светлая';

        const blueThemeButton = document.createElement('button');
        blueThemeButton.type = 'button';
        blueThemeButton.className = 'theme-radio-button';
        blueThemeButton.textContent = 'Синяя';

        const darkThemeButton = document.createElement('button');
        darkThemeButton.type = 'button';
        darkThemeButton.className = 'theme-radio-button';
        darkThemeButton.textContent = 'Темная';

        function syncThemeSelector(themeName) {
            const activeThemeName = THEMES.includes(themeName) ? themeName : 'blue';
            lightThemeButton.classList.toggle('is-active', activeThemeName === 'light');
            blueThemeButton.classList.toggle('is-active', activeThemeName === 'blue');
            darkThemeButton.classList.toggle('is-active', activeThemeName === 'dark');
            themeRadioGroup.style.setProperty(
                '--theme-active-index',
                String(Math.max(THEMES.indexOf(activeThemeName), 0)),
            );
            themeRadioGroup.setAttribute('data-theme-preview', activeThemeName);
        }

        lightThemeButton.addEventListener('click', () => {
            syncThemeSelector(applyTheme('light'));
        });

        blueThemeButton.addEventListener('click', () => {
            syncThemeSelector(applyTheme('blue'));
        });

        darkThemeButton.addEventListener('click', () => {
            syncThemeSelector(applyTheme('dark'));
        });

        themeRadioGroup.appendChild(lightThemeButton);
        themeRadioGroup.appendChild(blueThemeButton);
        themeRadioGroup.appendChild(darkThemeButton);
        themeSelector.appendChild(themeRadioGroup);

        const paletteButton = ui.createPrimaryButton('Цвет кнопок', {
            className: 'data-entry-submit-button',
        });
        decorateSettingsButton(
            paletteButton,
            `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4.5C8.41015 4.5 5.5 7.41015 5.5 11C5.5 14.5899 8.41015 17.5 12 17.5C12.4661 17.5 12.9168 17.451 13.3508 17.3578C14.5846 17.0928 15.75 18.0281 15.75 19.29C15.75 19.9866 16.3143 20.5509 17.0109 20.5509H17.25C19.3211 20.5509 21 18.872 21 16.8009C21 9.95473 17.0453 4.5 12 4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M8.5 10.25C8.91421 10.25 9.25 9.91421 9.25 9.5C9.25 9.08579 8.91421 8.75 8.5 8.75C8.08579 8.75 7.75 9.08579 7.75 9.5C7.75 9.91421 8.08579 10.25 8.5 10.25Z" fill="currentColor"/>
                    <path d="M11.75 8.25C12.1642 8.25 12.5 7.91421 12.5 7.5C12.5 7.08579 12.1642 6.75 11.75 6.75C11.3358 6.75 11 7.08579 11 7.5C11 7.91421 11.3358 8.25 11.75 8.25Z" fill="currentColor"/>
                    <path d="M15.25 9.75C15.6642 9.75 16 9.41421 16 9C16 8.58579 15.6642 8.25 15.25 8.25C14.8358 8.25 14.5 8.58579 14.5 9C14.5 9.41421 14.8358 9.75 15.25 9.75Z" fill="currentColor"/>
                    <path d="M10.25 13.75C10.6642 13.75 11 13.4142 11 13C11 12.5858 10.6642 12.25 10.25 12.25C9.83579 12.25 9.5 12.5858 9.5 13C9.5 13.4142 9.83579 13.75 10.25 13.75Z" fill="currentColor"/>
                </svg>
            `,
            'Цвет кнопок'
        );
        paletteButton.setAttribute('aria-expanded', 'false');

        const paletteSelector = document.createElement('div');
        paletteSelector.className = 'theme-selector button-palette-selector';

        const buttonPaletteGrid = document.createElement('div');
        buttonPaletteGrid.className = 'button-palette-grid';

        const paletteOptions = [
            { key: 'pink', label: 'Розовый' },
            { key: 'platinum', label: 'Платина' },
            { key: 'gold', label: 'Золото' },
            { key: 'white', label: 'Белый' },
        ];

        const paletteButtons = new Map();

        function syncButtonPaletteSelector(paletteName) {
            const activePaletteName =
                BUTTON_PALETTES.includes(paletteName) ? paletteName : 'default';
            const activePaletteIndex = paletteOptions.findIndex(
                (paletteOption) => paletteOption.key === activePaletteName,
            );

            paletteButtons.forEach((button, key) => {
                button.classList.toggle('is-active', key === activePaletteName);
            });
            buttonPaletteGrid.style.setProperty(
                '--button-palette-active-index',
                String(Math.max(activePaletteIndex, 0)),
            );
            buttonPaletteGrid.setAttribute(
                'data-button-palette-preview',
                activePaletteIndex >= 0 ? activePaletteName : 'default',
            );
            buttonPaletteGrid.setAttribute(
                'data-has-selection',
                activePaletteIndex >= 0 ? 'true' : 'false',
            );
        }

        paletteOptions.forEach((paletteOption) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'button-palette-option';
            button.classList.add(`button-palette-option--${paletteOption.key}`);
            button.dataset.palette = paletteOption.key;

            const text = document.createElement('span');
            text.className = 'button-palette-option-label';
            text.textContent = paletteOption.label;

            button.appendChild(text);
            button.addEventListener('click', () => {
                syncButtonPaletteSelector(applyButtonPalette(paletteOption.key));
            });

            paletteButtons.set(paletteOption.key, button);
            buttonPaletteGrid.appendChild(button);
        });

        paletteSelector.appendChild(buttonPaletteGrid);

        function setThemeSelectorOpen(isOpen) {
            themeSelector.classList.toggle('is-open', isOpen);
            themeButton.classList.toggle('is-open', isOpen);
            themeButton.setAttribute('aria-expanded', String(isOpen));
        }

        function setPaletteSelectorOpen(isOpen) {
            paletteSelector.classList.toggle('is-open', isOpen);
            paletteButton.classList.toggle('is-open', isOpen);
            paletteButton.setAttribute('aria-expanded', String(isOpen));
        }

        themeButton.addEventListener('click', () => {
            setPaletteSelectorOpen(false);
            setThemeSelectorOpen(!themeSelector.classList.contains('is-open'));
        });

        paletteButton.addEventListener('click', () => {
            setThemeSelectorOpen(false);
            setPaletteSelectorOpen(!paletteSelector.classList.contains('is-open'));
        });

        const resetThemeButton = ui.createPrimaryButton('По умолчанию', {
            className: 'data-entry-submit-button theme-reset-button',
        });
        resetThemeButton.addEventListener('click', () => {
            syncThemeSelector(applyTheme('blue'));
            syncButtonPaletteSelector(applyButtonPalette('default'));
            ui.showToast('Настройки темы сброшены', {
                duration: 1800,
            });
        });

        syncThemeSelector(document.body.dataset.theme || 'blue');
        syncButtonPaletteSelector(document.body.dataset.buttonPalette || 'default');

        card.appendChild(themeButton);
        card.appendChild(themeSelector);
        card.appendChild(paletteButton);
        card.appendChild(paletteSelector);
        card.appendChild(resetThemeButton);
        layout.appendChild(card);
        page.body.appendChild(layout);
    }

    function openAdminPanelWithAccess(options = {}) {
        const modal = ui.createModal({
            className: 'data-entry-modal-content admin-access-modal',
            maxButtonWidth: 420,
        });

        const title = document.createElement('div');
        title.className = 'data-entry-modal-title';
        title.textContent = 'Доступ к админ панели';

        const description = document.createElement('div');
        description.className = 'admin-access-description';
        description.textContent = 'Введите пароль для открытия админ панели';

        const input = document.createElement('input');
        input.type = 'password';
        input.inputMode = 'numeric';
        input.autocomplete = 'current-password';
        input.className = 'admin-access-input';
        input.placeholder = 'Пароль';

        const submitButton = ui.createPrimaryButton('Открыть панель', {
            className: 'admin-access-submit',
        });
        const cancelButton = ui.createSecondaryButton('Отмена', {
            className: 'admin-access-cancel',
        });

        const submit = async () => {
            submitButton.disabled = true;
            const passwordHash = await hashProtectedAccessValue(input.value);

            if (passwordHash !== ADMIN_PANEL_PASSWORD_HASH) {
                submitButton.disabled = false;
                input.value = '';
                ui.showToast('Неверный пароль', {
                    type: 'error',
                    duration: 1800,
                });
                input.focus();
                return;
            }

            modal.close();
            openAdminPanelPagePanel(options);
        };

        submitButton.addEventListener('click', () => {
            void submit();
        });
        cancelButton.addEventListener('click', modal.close);
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            void submit();
        });

        modal.content.appendChild(title);
        modal.content.appendChild(description);
        modal.content.appendChild(input);
        modal.content.appendChild(submitButton);
        modal.content.appendChild(cancelButton);

        window.setTimeout(() => {
            input.focus();
        }, 60);
    }

    function openSettingsToolsModal() {
        const modal = ui.createModal({
            className: 'data-entry-modal-content settings-tools-modal',
            maxButtonWidth: 420,
        });

        const title = document.createElement('div');
        title.className = 'data-entry-modal-title';
        title.textContent = 'Служебное меню';

        const description = document.createElement('div');
        description.className = 'settings-tools-description';
        description.textContent = 'Здесь собраны скрытые служебные разделы приложения.';

        const logsButton = ui.createPrimaryButton('Логи', {
            className: 'settings-tools-button',
        });
        const adminPanelButton = ui.createPrimaryButton('Админ панель', {
            className: 'settings-tools-button',
        });
        const closeButton = ui.createSecondaryButton('Закрыть', {
            className: 'settings-tools-close-button',
        });

        logsButton.addEventListener('click', () => {
            modal.close();
            openLogsPagePanel({
                direction: 'forward',
            });
        });

        adminPanelButton.addEventListener('click', () => {
            modal.close();
            openAdminPanelWithAccess({
                direction: 'forward',
                onBack: () => {
                    openSettingsPagePanel({
                        direction: 'backward',
                    });
                },
                setActiveBottomNav,
                ui,
            });
        });

        closeButton.addEventListener('click', modal.close);

        modal.content.appendChild(title);
        modal.content.appendChild(description);
        modal.content.appendChild(logsButton);
        modal.content.appendChild(adminPanelButton);
        modal.content.appendChild(closeButton);
    }

    function openSettingsPagePanel(options = {}) {
        setActiveBottomNav('settings');
        const page = ui.showAppPage({
            bodyClassName: 'settings-screen',
            direction: options.direction,
            onClose: () => {
                cameraSelectorRequestId += 1;
            },
            pageId: 'settingsPage',
            title: 'Настройки',
        });
        let cameraSelectorRequestId = 0;

        const card = document.createElement('div');
        card.className = 'app-page-card';
        const themeSettingsButton = ui.createPrimaryButton('Настройки темы', {
            className: 'data-entry-submit-button',
        });
        decorateSettingsButton(
            themeSettingsButton,
            `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8.75C10.2051 8.75 8.75 10.2051 8.75 12C8.75 13.7949 10.2051 15.25 12 15.25C13.7949 15.25 15.25 13.7949 15.25 12C15.25 10.2051 13.7949 8.75 12 8.75Z" stroke="currentColor" stroke-width="1.7"/>
                    <path d="M19 12C19 11.5498 18.9639 11.108 18.8945 10.6777L20.5 9.42871L18.5713 6.08301L16.6328 6.75293C15.9586 6.22377 15.1927 5.80739 14.3682 5.53125L14.0625 3.5H9.9375L9.63184 5.53125C8.80734 5.80739 8.04143 6.22377 7.36719 6.75293L5.42871 6.08301L3.5 9.42871L5.10547 10.6777C5.03614 11.108 5 11.5498 5 12C5 12.4502 5.03614 12.892 5.10547 13.3223L3.5 14.5713L5.42871 17.917L7.36719 17.2471C8.04143 17.7762 8.80734 18.1926 9.63184 18.4688L9.9375 20.5H14.0625L14.3682 18.4688C15.1927 18.1926 15.9586 17.7762 16.6328 17.2471L18.5713 17.917L20.5 14.5713L18.8945 13.3223C18.9639 12.892 19 12.4502 19 12Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                </svg>
            `,
            'Настройки темы'
        );

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
            cameraChevron.innerHTML = '';
        }

        const cameraSelector = document.createElement('div');
        cameraSelector.className = 'camera-picker-inline';
        const cameraSelectorContent = document.createElement('div');
        cameraSelectorContent.className = 'camera-picker-inline-content';

        const cameraSelectorList = document.createElement('div');
        cameraSelectorList.className = 'camera-picker-list';

        cameraSelectorContent.appendChild(cameraSelectorList);
        cameraSelector.appendChild(cameraSelectorContent);

        function setCameraSelectorOpen(isOpen) {
            if (!isPageHandleActive(page)) {
                return;
            }

            cameraSelector.classList.toggle('is-open', isOpen);
            cameraButton.classList.toggle('is-open', isOpen);
            cameraButton.setAttribute('aria-expanded', String(isOpen));
        }

        async function renderCameraSelector() {
            const requestId = ++cameraSelectorRequestId;
            const cameras = await camera.updateCameraList();

            if (
                requestId !== cameraSelectorRequestId ||
                !isPageHandleActive(page)
            ) {
                return false;
            }

            cameraSelectorList.innerHTML = '';

            if (!Array.isArray(cameras) || cameras.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.className = 'camera-picker-inline-empty';
                emptyState.textContent = 'Камеры не найдены';
                cameraSelectorList.appendChild(emptyState);
                return false;
            }

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

            if (!willOpen) {
                setCameraSelectorOpen(false);
                return;
            }

            const hasCameras = await renderCameraSelector();

            if (!isPageHandleActive(page)) {
                return;
            }

            setCameraSelectorOpen(hasCameras);
        });

        themeSettingsButton.addEventListener('click', () => {
            setCameraSelectorOpen(false);
            openThemeSettingsPagePanel({
                direction: 'forward',
            });
        });

        const whatsNewButton = ui.createPrimaryButton('Что нового?', {
            className: 'data-entry-submit-button',
        });
        decorateSettingsButton(
            whatsNewButton,
            `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 4V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M12 18V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M4 12H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M18 12H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M6.35 6.35L7.76 7.76" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M16.24 16.24L17.65 17.65" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M17.65 6.35L16.24 7.76" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M7.76 16.24L6.35 17.65" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M12 9.25V12.25L14 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 17.5C15.0376 17.5 17.5 15.0376 17.5 12C17.5 8.96243 15.0376 6.5 12 6.5C8.96243 6.5 6.5 8.96243 6.5 12C6.5 15.0376 8.96243 17.5 12 17.5Z" stroke="currentColor" stroke-width="1.8"/>
                </svg>
            `,
            'Что нового?'
        );

        const encyclopediaButton = ui.createPrimaryButton('Справка', {
            className: 'data-entry-submit-button',
        });
        decorateSettingsButton(
            encyclopediaButton,
            `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 5.5C6 4.67157 6.67157 4 7.5 4H18V18.5H8.75C8.05842 18.5 7.5 19.0584 7.5 19.75C7.5 20.4416 8.05842 21 8.75 21H18" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                    <path d="M6 5.5V19.5C6 20.3284 5.32843 21 4.5 21H4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9.5 8H14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    <path d="M9.5 11H15.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    <path d="M9.5 14H13.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                </svg>
            `,
            'Справка'
        );
        if (shouldShowEncyclopediaNewBadge()) {
            appendSettingsNewBadge(encyclopediaButton);
        }

        whatsNewButton.addEventListener('click', () => {
            setCameraSelectorOpen(false);
            openWhatsNewPagePanel({
                direction: 'forward',
                onBack: () => {
                    openSettingsPagePanel({
                        direction: 'backward',
                    });
                },
                setActiveBottomNav,
                ui,
            });
        });

        encyclopediaButton.addEventListener('click', () => {
            setCameraSelectorOpen(false);
            handleEncyclopediaNewBadgeOpen(encyclopediaButton);
            openEncyclopediaPagePanel({
                direction: 'forward',
                onBack: () => {
                    openSettingsPagePanel({
                        direction: 'backward',
                    });
                },
                setActiveBottomNav,
                ui,
            });
        });

        card.appendChild(themeSettingsButton);
        card.appendChild(cameraButton);
        card.appendChild(cameraSelector);
        card.appendChild(whatsNewButton);
        card.appendChild(encyclopediaButton);
        page.body.appendChild(card);

        const versionNote = document.createElement('div');
        versionNote.className = 'settings-version-note';
        versionNote.textContent = APP_VERSION;
        let versionTapCount = 0;
        let versionTapTimer = null;
        versionNote.addEventListener('click', () => {
            versionTapCount += 1;

            if (versionTapTimer) {
                window.clearTimeout(versionTapTimer);
            }

            versionTapTimer = window.setTimeout(() => {
                versionTapCount = 0;
                versionTapTimer = null;
            }, 900);

            if (versionTapCount < 5) {
                return;
            }

            versionTapCount = 0;
            window.clearTimeout(versionTapTimer);
            versionTapTimer = null;
            openSettingsToolsModal();
        });
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
                const settingsPage = document.getElementById('settingsPage');

                if (settingsPage?.isConnected) {
                    return;
                }

                openSettingsPagePanel({
                    direction: 'backward',
                });
                return;
            }

            openSettingsPagePanel({
                direction: getBottomNavDirection('settings'),
            });
        });
    }

    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'blue');
    applyButtonPalette(localStorage.getItem(BUTTON_PALETTE_STORAGE_KEY) || 'default');
    const runtimeContext = detectRuntimeContext();
    initLogger({
        appVersion: APP_VERSION,
        buttonPalette: document.documentElement.dataset.buttonPalette || 'default',
        browser: runtimeContext.browser,
        deviceType: runtimeContext.deviceType,
        isIOS: IS_IOS,
        isTouch: runtimeContext.isTouch,
        online: navigator.onLine,
        os: runtimeContext.os,
        pixelRatio: runtimeContext.pixelRatio,
        platform: runtimeContext.platform,
        screen: activeBottomNavKey,
        selectedCameraId: state.selectedCameraId || 'none',
        theme: document.documentElement.dataset.theme || 'blue',
        url: runtimeContext.url,
        userAgent: runtimeContext.userAgent,
        viewport: runtimeContext.viewport,
        visibilityState: runtimeContext.visibilityState,
    });
    setActiveBottomNav('home');

    const scheduleAdminWarmup =
        window.requestIdleCallback
            ? (callback) => window.requestIdleCallback(callback, { timeout: 1200 })
            : (callback) => window.setTimeout(callback, 250);

    scheduleAdminWarmup(() => {
        void service.warmAdminData?.();
    });
});
