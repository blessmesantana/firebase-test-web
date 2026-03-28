function applyStyles(element, styles) {
    Object.assign(element.style, styles);
}
function addClassNames(element, className) {
    if (!element || !className) {
        return;
    }

    const classNames = Array.isArray(className)
        ? className
        : String(className).split(/\s+/);

    const normalizedClassNames = classNames.filter(Boolean);

    if (normalizedClassNames.length > 0) {
        element.classList.add(...normalizedClassNames);
    }
}

export function createUiController({ dom }) {
    const APP_PAGE_TRANSITION_MS = 320;
    let cameraNoticeElement = null;
    let scanPauseOverlay = null;
    let transferSelectOverlay = null;
    let qrViewportState = 'idle';
    let appPageHost = null;
    let activeAppPage = null;
    let currentRootScreen = null;
    let homeRootScreen = null;

    function ensureScanPauseOverlay() {
        if (!dom.qrContainer) {
            return null;
        }

        if (!scanPauseOverlay) {
            scanPauseOverlay = document.createElement('div');
            scanPauseOverlay.setAttribute('aria-hidden', 'true');
            applyStyles(scanPauseOverlay, {
                position: 'absolute',
                inset: '0',
                background: 'var(--color-surface-strong)',
                borderRadius: '20px',
                opacity: '0',
                pointerEvents: 'none',
                transform: 'scale(0.985)',
                transition: 'opacity 220ms cubic-bezier(0.4, 0, 0.2, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                zIndex: '9',
            });
            dom.qrContainer.appendChild(scanPauseOverlay);
        }

        return scanPauseOverlay;
    }

    function applyQrViewportState() {
        const overlay = ensureScanPauseOverlay();

        if (dom.qrSpinner) {
            dom.qrSpinner.classList.toggle('active', qrViewportState === 'loading');
        }

        if (!overlay) {
            return;
        }

        if (qrViewportState === 'scanning' || qrViewportState === 'loading') {
            overlay.style.opacity = '0';
            overlay.style.transform = 'scale(0.985)';
            overlay.style.pointerEvents = 'none';
            hideAllQrIcons();
            return;
        }

        overlay.style.opacity = '1';
        overlay.style.transform = 'scale(1)';
        overlay.style.pointerEvents = 'none';
        showAllQrIcons();
    }

    function setQrViewportState(nextState) {
        qrViewportState = nextState;
        applyQrViewportState();
    }

    function setModalContentWidth(modalContent, options = {}) {
        if (!modalContent) {
            return;
        }

        if (!dom.inputModeButton) {
            modalContent.style.minWidth = options.minWidth || '220px';
            modalContent.style.maxWidth = options.maxWidth || '90vw';
            return;
        }

        const width = Math.min(
            dom.inputModeButton.offsetWidth,
            options.maxButtonWidth || dom.inputModeButton.offsetWidth,
        );

        modalContent.style.width = `${width}px`;
        modalContent.style.minWidth = options.minWidth || '220px';
        modalContent.style.maxWidth = options.maxWidth || '90vw';
    }

    function syncOverlayStyles() {
        if (!dom.inputModeButton || !dom.qrResultOverlay) {
            return;
        }

        applyStyles(dom.qrResultOverlay, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            margin: '0',
            padding: '0',
            boxSizing: 'border-box',
            borderRadius: window.getComputedStyle(dom.inputModeButton).borderRadius,
        });
    }

    function clearScanResult() {
        if (!dom.qrResultOverlay) {
            return;
        }

        clearTimeout(dom.qrResultOverlay._hideTimer);
        dom.qrResultOverlay.className = '';
        dom.qrResultOverlay.innerHTML = '';
    }

    function showScanResult(status, message = '', courier = '', previousCourier = '', rawData = '') {
        if (!dom.qrResultOverlay) {
            return;
        }

        syncOverlayStyles();

        let text = '';
        let colorClass = '';

        if (status === 'already_scanned') {
            text = courier || '';
            colorClass = 'already_scanned';
        } else if (status === 'success') {
            text = courier || '';
            colorClass = 'success';
        } else if (status === 'not_found') {
            text = message
                ? `Передача с ID ${message} не найдена`
                : 'Передача не найдена';
            colorClass = 'error';
        } else if (status === 'error') {
            text = message;
            colorClass = 'error';
        } else {
            text = message;
        }

        dom.qrResultOverlay.innerHTML = `<div class='qr-overlay-box'>${text.trim().replace(/\n/g, '<br>')}</div>`;
        dom.qrResultOverlay.className = `show ${colorClass}`.trim();

        if (dom.resultDiv) {
            dom.resultDiv.style.display = 'none';
        }

        clearTimeout(dom.qrResultOverlay._hideTimer);
        dom.qrResultOverlay._hideTimer = window.setTimeout(() => {
            clearScanResult();
        }, 2200);
    }

    function hideAllQrIcons() {
        dom.qrIcons.forEach((icon) => icon.classList.add('hide'));
    }

    function showAllQrIcons() {
        dom.qrIcons.forEach((icon) => icon.classList.remove('hide'));
    }

    function setLoading(active) {
        if (dom.loadingIndicator) {
            dom.loadingIndicator.style.display = active ? 'block' : 'none';
        }

        applyQrViewportState();
    }

    function setVideoVisible(isVisible) {
        if (!dom.videoElement) {
            return;
        }

        dom.videoElement.style.display = isVisible ? '' : 'none';
    }

    function showManualInput() {
        dom.inputModeButton?.classList.add('active');
        dom.manualInputContainer?.classList.add('active');
    }

    function hideManualInput() {
        dom.inputModeButton?.classList.remove('active');
        dom.manualInputContainer?.classList.remove('active');
    }

    function focusManualInput() {
        dom.manualTransferIdInput?.focus();
    }

    function flashFrame() {
        if (!dom.qrContainer) {
            return;
        }

        dom.qrContainer.classList.remove('flash');
        window.setTimeout(() => {
            dom.qrContainer?.classList.add('flash');
        }, 0);
    }

    function createFloatingMessage(text, backgroundColor, duration) {
        const message = document.createElement('div');
        message.textContent = text;

        applyStyles(message, {
            position: 'fixed',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%) translateY(-6px)',
            color: 'var(--color-text-primary)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '15px',
            fontWeight: '500',
            padding: '14px 32px',
            borderRadius: '24px',
            boxShadow: 'var(--shadow-soft)',
            zIndex: '99999',
            opacity: '0',
            transition: 'opacity 220ms cubic-bezier(0.4, 0, 0.2, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms cubic-bezier(0.4, 0, 0.2, 1)',
            background: backgroundColor,
        });

        document.body.appendChild(message);
        window.setTimeout(() => {
            message.style.opacity = '1';
            message.style.transform = 'translateX(-50%) translateY(0)';
        }, 50);
        window.setTimeout(() => {
            message.style.opacity = '0';
            message.style.transform = 'translateX(-50%) translateY(-6px)';
        }, Math.max(duration - 400, 400));
        window.setTimeout(() => {
            message.remove();
        }, duration);
    }

    function showToast(text, options = {}) {
        const backgroundColor = options.type === 'error'
            ? 'var(--color-danger)'
            : 'var(--color-success)';
        const duration = options.duration || 1600;

        createFloatingMessage(text, backgroundColor, duration);
    }

    function showCameraNotice(kind, text, options = {}) {
        if (kind === 'error') {
            showScanResult('error', text, '', '', '');
            return;
        }

        const duration = options.duration || (kind === 'error' ? 3600 : 2200);
        const background = kind === 'error'
            ? 'var(--color-danger)'
            : 'var(--color-surface-strong)';

        if (!cameraNoticeElement) {
            cameraNoticeElement = document.createElement('div');
            applyStyles(cameraNoticeElement, {
                position: 'fixed',
                top: '24px',
                left: '50%',
                transform: 'translateX(-50%) translateY(-6px)',
                color: 'var(--color-text-primary)',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                fontWeight: '500',
                padding: '12px 24px',
                borderRadius: '20px',
                boxShadow: 'var(--shadow-soft)',
                zIndex: '99998',
                opacity: '0',
                transition: 'opacity 220ms cubic-bezier(0.4, 0, 0.2, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: 'none',
            });
            document.body.appendChild(cameraNoticeElement);
        }

        cameraNoticeElement.textContent = text;
        cameraNoticeElement.style.background = background;
        cameraNoticeElement.style.opacity = '1';
        cameraNoticeElement.style.transform = 'translateX(-50%) translateY(0)';

        clearTimeout(cameraNoticeElement._hideTimer);
        cameraNoticeElement._hideTimer = window.setTimeout(() => {
            if (cameraNoticeElement) {
                cameraNoticeElement.style.opacity = '0';
                cameraNoticeElement.style.transform = 'translateX(-50%) translateY(-6px)';
            }
        }, duration);
    }

    function showScanPauseOverlay() {
        setQrViewportState('paused');
    }

    function hideScanPauseOverlay() {
        setQrViewportState('scanning');
    }

    function createSidebarButton(options) {
        const button = document.createElement('button');
        button.id = options.id || '';

        applyStyles(button, {
            background: 'none',
            color: 'var(--color-text-primary)',
            border: 'none',
            fontSize: options.fontSize || '13px',
            fontWeight: '500',
            fontFamily: 'Inter, sans-serif',
            textAlign: 'center',
            borderRadius: '24px',
            transition: 'background 0.2s',
            letterSpacing: 'normal',
            cursor: 'pointer',
            padding: options.padding || '12px 0 10px 0',
            width: '100%',
            marginTop: options.marginTop || '0',
            marginBottom: options.marginBottom || '0',
            display: options.display || 'block',
            alignItems: options.alignItems || '',
            justifyContent: options.justifyContent || '',
        });

        if (options.html) {
            button.innerHTML = options.html;
        } else {
            button.textContent = options.label;
        }

        addClassNames(button, options.className);

        return button;
    }

    function createPrimaryButton(label, options = {}) {
        const button = document.createElement('button');
        button.textContent = label;

        applyStyles(button, {
            background: 'var(--color-primary)',
            color: 'var(--color-primary-text)',
            border: 'none',
            borderRadius: '24px',
            fontSize: options.fontSize || '13px',
            fontWeight: '500',
            fontFamily: 'Inter, sans-serif',
            padding: options.padding || '12px 0 10px 0',
            width: '100%',
            marginTop: options.marginTop || '8px',
            marginBottom: options.marginBottom || '0',
            cursor: 'pointer',
        });

        addClassNames(button, options.className);

        return button;
    }

    function createSecondaryButton(label, options = {}) {
        const button = document.createElement('button');
        button.textContent = label;

        applyStyles(button, {
            background: 'none',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-text-primary)',
            borderRadius: '24px',
            fontSize: options.fontSize || '13px',
            fontWeight: '500',
            fontFamily: 'Inter, sans-serif',
            padding: options.padding || '10px 0',
            width: '100%',
            cursor: 'pointer',
        });

        addClassNames(button, options.className);

        return button;
    }

    function createModal(options = {}) {
        const existingModal = options.modalId
            ? document.getElementById(options.modalId)
            : null;

        if (existingModal) {
            if (typeof existingModal._cleanupModal === 'function') {
                existingModal._cleanupModal();
            } else {
                existingModal.remove();
            }
        }

        const backdrop = document.createElement('div');
        const content = document.createElement('div');

        if (options.modalId) {
            backdrop.id = options.modalId;
        }

        applyStyles(backdrop, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            background: 'var(--color-modal-backdrop)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: options.zIndex || '9999',
        });

        applyStyles(content, {
            background: 'var(--color-modal-surface)',
            borderRadius: options.borderRadius || '32px',
            padding: options.padding || '32px 24px',
            color: 'var(--color-text-primary)',
            textAlign: 'center',
            position: 'relative',
            fontFamily: 'Inter, sans-serif',
            fontSize: options.fontSize || '13px',
            maxHeight: options.maxHeight || '80vh',
            overflowY: 'auto',
        });

        addClassNames(content, options.className);

        const syncWidth = () => {
            setModalContentWidth(content, {
                maxButtonWidth: options.maxButtonWidth,
                minWidth: options.minWidth,
                maxWidth: options.maxWidth,
            });
        };

        const close = () => {
            if (backdrop._isClosed) {
                return;
            }

            backdrop._isClosed = true;
            window.removeEventListener('resize', syncWidth);
            options.onClose?.();
            backdrop.remove();
        };

        backdrop._cleanupModal = close;
        backdrop.addEventListener('click', close);
        content.addEventListener('click', (event) => event.stopPropagation());

        syncWidth();
        window.addEventListener('resize', syncWidth);

        backdrop.appendChild(content);
        document.body.appendChild(backdrop);

        return { backdrop, content, close, syncWidth };
    }

    function ensureAppPageHost() {
        if (!appPageHost) {
            if (!dom.pageRoot) {
                return null;
            }

            appPageHost = document.createElement('div');
            appPageHost.className = 'app-page-host';
            dom.pageRoot.parentElement?.insertBefore(appPageHost, dom.pageRoot);
            appPageHost.appendChild(dom.pageRoot);

            homeRootScreen = dom.pageRoot;
            homeRootScreen.classList.add('root-screen', 'root-screen-home', 'show');
            homeRootScreen.style.display = '';
            currentRootScreen = homeRootScreen;
        }

        return appPageHost;
    }

    function getHomeRootScreen() {
        ensureAppPageHost();
        return homeRootScreen;
    }

    function clearScheduledScreenTransitions(screen) {
        if (!screen) {
            return;
        }

        if (screen._finalizeTimer) {
            window.clearTimeout(screen._finalizeTimer);
            screen._finalizeTimer = null;
        }

        if (screen._showRafPrimary) {
            window.cancelAnimationFrame(screen._showRafPrimary);
            screen._showRafPrimary = null;
        }

        if (screen._showRafSecondary) {
            window.cancelAnimationFrame(screen._showRafSecondary);
            screen._showRafSecondary = null;
        }
    }

    function resetScreenClasses(screen) {
        if (!screen) {
            return;
        }

        screen.classList.remove('show');
        screen.classList.remove('exit-left');
        screen.classList.remove('exit-right');
        screen.classList.remove('enter-from-left');
    }

    function hideScreen(screen) {
        if (!screen) {
            return;
        }

        resetScreenClasses(screen);
        screen.style.display = 'none';
    }

    function finalizeOutgoingScreen(screen) {
        if (!screen) {
            return;
        }

        clearScheduledScreenTransitions(screen);
        screen._isClosing = false;

        if (screen === homeRootScreen) {
            hideScreen(screen);
            return;
        }

        if (activeAppPage === screen) {
            activeAppPage = null;
        }

        screen._onPageClose?.();
        screen.remove();
    }

    function prepareScreenForEntry(screen, direction) {
        clearScheduledScreenTransitions(screen);
        resetScreenClasses(screen);
        screen.style.display = '';

        if (direction === 'backward') {
            screen.classList.add('enter-from-left');
        }
    }

    function transitionToRootScreen(nextScreen, { direction = 'forward', immediate = false } = {}) {
        const host = ensureAppPageHost();
        if (!host || !nextScreen) {
            return;
        }

        const previousScreen = currentRootScreen;

        if (previousScreen === nextScreen) {
            prepareScreenForEntry(nextScreen, direction);
            nextScreen.classList.add('show');
            return;
        }

        prepareScreenForEntry(nextScreen, direction);
        host.appendChild(nextScreen);
        currentRootScreen = nextScreen;

        if (nextScreen === homeRootScreen) {
            activeAppPage = null;
        } else {
            activeAppPage = nextScreen;
        }

        if (!previousScreen) {
            nextScreen.classList.add('show');
            return;
        }

        resetScreenClasses(previousScreen);
        previousScreen.classList.add(getExitClass(direction));

        const outgoingScreen = previousScreen;

        if (immediate) {
            finalizeOutgoingScreen(outgoingScreen);
            nextScreen.classList.add('show');
            return;
        }

        clearScheduledScreenTransitions(outgoingScreen);
        outgoingScreen._finalizeTimer = window.setTimeout(() => {
            outgoingScreen._finalizeTimer = null;

            if (currentRootScreen !== nextScreen || outgoingScreen === currentRootScreen) {
                return;
            }

            finalizeOutgoingScreen(outgoingScreen);
        }, APP_PAGE_TRANSITION_MS);

        nextScreen._showRafPrimary = window.requestAnimationFrame(() => {
            nextScreen._showRafPrimary = null;
            nextScreen._showRafSecondary = window.requestAnimationFrame(() => {
                nextScreen._showRafSecondary = null;

                if (currentRootScreen !== nextScreen) {
                    return;
                }

                nextScreen.classList.add('show');
            });
        });
    }

    function getExitClass(direction = 'forward') {
        return direction === 'backward' ? 'exit-right' : 'exit-left';
    }

    function closeAppPage(page, { immediate = false, direction = 'forward' } = {}) {
        if (!page) {
            return;
        }

        if (page._isClosing) {
            return;
        }

        page._isClosing = true;

        const homeScreen = getHomeRootScreen();
        if (!homeScreen) {
            return;
        }

        transitionToRootScreen(homeScreen, { direction, immediate });
    }

    function closeAllAppPages(options = {}) {
        const host = ensureAppPageHost();
        if (!host) {
            return;
        }

        if (options.immediate ?? true) {
            host.querySelectorAll('.app-page').forEach((page) => {
                finalizeOutgoingScreen(page);
            });

            const homeScreen = getHomeRootScreen();
            if (homeScreen) {
                prepareScreenForEntry(homeScreen, options.direction || 'forward');
                homeScreen.classList.add('show');
                currentRootScreen = homeScreen;
                activeAppPage = null;
            }
            return;
        }

        closeActiveAppPage(options);
    }

    function closeActiveAppPage(options = {}) {
        if (!activeAppPage) {
            return;
        }

        closeAppPage(activeAppPage, options);
    }

    function showAppPage(options = {}) {
        const host = ensureAppPageHost();
        if (!host) {
            return null;
        }
        const direction = options.direction === 'backward' ? 'backward' : 'forward';

        if (activeAppPage) {
            const previousPage = activeAppPage;
            previousPage.classList.remove('show');
            previousPage.classList.remove('exit-left');
            previousPage.classList.remove('exit-right');
            previousPage.classList.remove('enter-from-left');
            previousPage.classList.add(getExitClass(direction));
            window.setTimeout(() => {
                previousPage.remove();
            }, APP_PAGE_TRANSITION_MS);
            activeAppPage = null;
        }

        const page = document.createElement('section');
        page.className = 'app-page root-screen';
        page.setAttribute('role', 'region');

        if (options.pageId) {
            page.id = options.pageId;
        }

        const panel = document.createElement('div');
        panel.className = 'app-page-panel';

        const header = document.createElement('div');
        header.className = 'app-page-header';

        const title = document.createElement('div');
        title.className = 'app-page-title';
        title.textContent = options.title || '';

        const body = document.createElement('div');
        body.className = `app-page-body ${options.bodyClassName || ''}`.trim();

        header.appendChild(title);
        panel.appendChild(header);
        panel.appendChild(body);
        page.appendChild(panel);

        page._onPageClose = options.onClose;
        page._closePage = (closeOptions) => closeAppPage(page, closeOptions);
        transitionToRootScreen(page, { direction });

        return {
            page,
            panel,
            header,
            body,
            title,
            close: (closeOptions) => closeAppPage(page, closeOptions),
        };
    }

    function showHomeScreen(options = {}) {
        const homeScreen = getHomeRootScreen();
        if (!homeScreen) {
            return;
        }

        transitionToRootScreen(homeScreen, {
            direction: options.direction || 'forward',
            immediate: options.immediate || false,
        });
    }

    function createConfirmDialog(options) {
        const modal = createModal({
            zIndex: options.zIndex || '10000',
            borderRadius: '24px',
            padding: '28px 20px',
            fontSize: '15px',
            className: options.className || 'archive-confirm-box',
            maxButtonWidth: options.maxButtonWidth || 420,
        });

        const textBlock = document.createElement('div');
        textBlock.innerHTML = options.html;
        textBlock.style.marginBottom = '18px';

        const confirmButton = createPrimaryButton(options.confirmText, {
            padding: '10px 0',
            marginTop: '0',
            marginBottom: '10px',
            className: 'archive-confirm-btn',
        });
        const cancelButton = createSecondaryButton(options.cancelText || 'Отмена', {
            className: 'archive-cancel-btn',
        });

        modal.content.appendChild(textBlock);
        modal.content.appendChild(confirmButton);
        modal.content.appendChild(cancelButton);

        cancelButton.addEventListener('click', modal.close);

        return {
            ...modal,
            confirmButton,
            cancelButton,
            textBlock,
        };
    }

    function showSelectionModal(options) {
        const modal = createModal({
            modalId: options.modalId,
            className: options.className || 'select-modal-content',
            zIndex: options.zIndex || '9999',
            maxButtonWidth: options.maxButtonWidth,
            borderRadius: options.borderRadius || '32px',
            padding: options.padding || '32px 24px',
        });

        const title = document.createElement('div');
        title.textContent = options.title;
        applyStyles(title, {
            fontSize: options.titleFontSize || '13px',
            fontWeight: '500',
            marginBottom: '18px',
            fontFamily: 'Inter, sans-serif',
        });
        modal.content.appendChild(title);

        options.items.forEach((item) => {
            const button = createPrimaryButton(
                options.renderItem ? '' : options.getLabel(item),
                {
                padding: '10px 0',
                marginTop: '8px',
                marginBottom: '0',
                },
            );

            if (options.itemClassName) {
                button.classList.add(options.itemClassName);
            }

            if (options.renderItem) {
                button.textContent = '';
                options.renderItem(item, button);
            }

            button.addEventListener('click', () => {
                modal.close();
                options.onSelect(item);
            });

            modal.content.appendChild(button);
        });

        return modal;
    }

    function getDifferingCharacterIndexes(deliveries) {
        const ids = deliveries
            .map((delivery) => String(delivery?.id || ''))
            .filter(Boolean);

        if (ids.length <= 1) {
            return new Set();
        }

        const maxLength = Math.max(...ids.map((id) => id.length));
        const differingIndexes = new Set();

        for (let index = 0; index < maxLength; index += 1) {
            const chars = new Set(ids.map((id) => id[index] || ''));
            if (chars.size > 1) {
                differingIndexes.add(index);
            }
        }

        return differingIndexes;
    }

    function closeTransferSelectOverlay() {
        if (!transferSelectOverlay) {
            return;
        }

        transferSelectOverlay.remove();
        transferSelectOverlay = null;
    }

    function showTransferSelectModal(deliveries, onSelect) {
        const differingIndexes = getDifferingCharacterIndexes(deliveries);

        if (!dom.qrContainer) {
            return showSelectionModal({
                modalId: 'transferSelectModal',
                title: 'Выберите передачу',
                zIndex: '10001',
                borderRadius: '24px',
                padding: '28px 20px',
                maxButtonWidth: 420,
                itemClassName: 'transfer-select-option',
                items: deliveries,
                getLabel: (delivery) =>
                    `${delivery.id} (${delivery.courier_name || 'Без курьера'})`,
                renderItem: (delivery, button) => {
                    const content = document.createElement('span');
                    content.className = 'transfer-select-option-content';

                    const idRow = document.createElement('span');
                    idRow.className = 'transfer-select-option-id';

                    String(delivery.id || '')
                        .split('')
                        .forEach((char, index) => {
                            const charNode = document.createElement('span');
                            charNode.className = 'transfer-select-option-id-char';
                            if (differingIndexes.has(index)) {
                                charNode.classList.add('is-diff');
                            }
                            charNode.textContent = char;
                            idRow.appendChild(charNode);
                        });

                    const courierRow = document.createElement('span');
                    courierRow.className = 'transfer-select-option-courier';
                    courierRow.textContent = delivery.courier_name || 'Без курьера';

                    content.appendChild(idRow);
                    content.appendChild(courierRow);
                    button.appendChild(content);
                },
                onSelect,
            });
        }

        closeTransferSelectOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'transferSelectModal';
        overlay.className = 'transfer-select-overlay';

        const box = document.createElement('div');
        box.className = 'transfer-select-box';

        const title = document.createElement('div');
        title.className = 'transfer-select-title';
        title.textContent = 'Выберите передачу';

        const list = document.createElement('div');
        list.className = 'transfer-select-list';

        deliveries.forEach((delivery) => {
            const button = createPrimaryButton('', {
                padding: '10px 0',
                marginTop: '0',
                marginBottom: '0',
            });
            button.classList.add('transfer-select-option');
            button.textContent = '';

            const content = document.createElement('span');
            content.className = 'transfer-select-option-content';

            const idRow = document.createElement('span');
            idRow.className = 'transfer-select-option-id';

            String(delivery.id || '')
                .split('')
                .forEach((char, index) => {
                    const charNode = document.createElement('span');
                    charNode.className = 'transfer-select-option-id-char';
                    if (differingIndexes.has(index)) {
                        charNode.classList.add('is-diff');
                    }
                    charNode.textContent = char;
                    idRow.appendChild(charNode);
                });

            const courierRow = document.createElement('span');
            courierRow.className = 'transfer-select-option-courier';
            courierRow.textContent = delivery.courier_name || 'Без курьера';

            content.appendChild(idRow);
            content.appendChild(courierRow);
            button.appendChild(content);

            button.addEventListener('click', () => {
                closeTransferSelectOverlay();
                onSelect(delivery);
            });

            list.appendChild(button);
        });

        const close = () => {
            if (overlay._isClosed) {
                return;
            }

            overlay._isClosed = true;
            closeTransferSelectOverlay();
        };

        overlay._cleanupModal = close;
        overlay.addEventListener('click', close);
        box.addEventListener('click', (event) => event.stopPropagation());

        box.appendChild(title);
        box.appendChild(list);
        overlay.appendChild(box);
        dom.qrContainer.appendChild(overlay);
        transferSelectOverlay = overlay;

        return {
            close,
            content: box,
            element: overlay,
        };
    }
    ensureScanPauseOverlay();
    setQrViewportState('idle');
    syncOverlayStyles();
    window.addEventListener('resize', syncOverlayStyles);

    if (window.ResizeObserver && dom.inputModeButton) {
        const observer = new ResizeObserver(syncOverlayStyles);
        observer.observe(dom.inputModeButton);
    }

    return {
        closeActiveAppPage,
        closeAllAppPages,
        clearScanResult,
        createConfirmDialog,
        createModal,
        createPrimaryButton,
        createSecondaryButton,
        createSidebarButton,
        flashFrame,
        focusManualInput,
        hideAllQrIcons,
        hideManualInput,
        setLoading,
        setModalContentWidth,
        setQrViewportState,
        setVideoVisible,
        showAppPage,
        showAllQrIcons,
        showCameraNotice,
        showHomeScreen,
        showScanPauseOverlay,
        showManualInput,
        showScanResult,
        showSelectionModal,
        hideScanPauseOverlay,
        showToast,
        showTransferSelectModal,
        syncOverlayStyles,
    };
}
