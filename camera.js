function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function getZxingReader() {
    if (!window.ZXing?.BrowserMultiFormatReader) {
        throw new Error('ZXing не загружен');
    }

    return window.ZXing;
}

export function createCameraController({ state, dom, ui }) {
    const DEBUG_CAMERA = new URLSearchParams(window.location.search).has('debugCamera');
    let scanResultHandler = null;

    function debugCamera(event, payload = {}) {
        if (!DEBUG_CAMERA) {
            return;
        }

        console.log(`[camera-debug][camera] ${event}`, payload);
    }

    function setScannerPhase(phase) {
        state.scannerPhase = phase;
    }

    function setScanResultHandler(handler) {
        scanResultHandler = handler;
    }

    function setAutoRestartAllowed(isAllowed) {
        state.autoRestartAllowed = isAllowed;
    }

    function isScannerActive() {
        return Boolean(state.scannerActive);
    }

    function isHomeScreenActive() {
        return state.activeRootScreen === 'home';
    }

    function syncCameraSelectValue(cameraId) {
        if (!dom.cameraSelect) {
            return;
        }

        const hasOption = Array.from(dom.cameraSelect.options).some(
            (option) => option.value === cameraId,
        );

        dom.cameraSelect.value = hasOption ? cameraId : '';
    }

    function syncSelectedCamera(cameraId) {
        state.selectedCameraId = cameraId || null;

        if (state.selectedCameraId) {
            localStorage.setItem('selectedCameraId', state.selectedCameraId);
        } else {
            localStorage.removeItem('selectedCameraId');
        }

        syncCameraSelectValue(state.selectedCameraId);
    }

    function resetSelectedCamera(reason) {
        debugCamera('reset_selected_camera', {
            reason,
            previousSelectedCameraId: state.selectedCameraId,
        });
        syncSelectedCamera(null);
    }

    function ensurePauseState() {
        if (!state.scanPause) {
            state.scanPause = {
                active: false,
                reason: null,
                timerId: null,
            };
        }

        return state.scanPause;
    }

    function clearPauseTimer() {
        const pauseState = ensurePauseState();

        if (pauseState.timerId) {
            window.clearTimeout(pauseState.timerId);
            pauseState.timerId = null;
        }
    }

    function cancelPendingRestart() {
        if (state.restartTimerId) {
            window.clearTimeout(state.restartTimerId);
            state.restartTimerId = null;
        }
    }

    function setScanPause(reason) {
        const pauseState = ensurePauseState();
        pauseState.active = true;
        pauseState.reason = reason || 'temporary';
        ui.showScanPauseOverlay();
        ui.setQrViewportState('paused');
    }

    function clearScanPause() {
        const pauseState = ensurePauseState();
        clearPauseTimer();
        pauseState.active = false;
        pauseState.reason = null;
        ui.hideScanPauseOverlay();

        if (!isScannerActive()) {
            ui.setQrViewportState('idle');
        }
    }

    function pauseScanning(reason) {
        setScanPause(reason);
        setScannerPhase('paused_after_scan');
        ui.setLoading(false);
    }

    function isCurrentSession(sessionId) {
        return sessionId === state.scanSessionId;
    }

    function isCurrentDecodeRun(decodeRunId) {
        return decodeRunId === state.decodeRunId;
    }

    function ensureCodeReader() {
        if (!state.codeReader) {
            const ZXing = getZxingReader();
            state.codeReader = new ZXing.BrowserMultiFormatReader();
        }

        return state.codeReader;
    }

    function resetCodeReader({ discardInstance = false } = {}) {
        try {
            if (state.codeReader) {
                state.codeReader.reset();
            }
        } catch (error) {
            console.warn('Ошибка сброса QR-ридера:', error);
        } finally {
            if (discardInstance) {
                state.codeReader = null;
            }
        }
    }

    async function getVideoInputsWithWarmup() {
        const readVideoInputs = async () => {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter((device) => device.kind === 'videoinput');
        };

        let cameras = await readVideoInputs();

        if (cameras.length > 0) {
            return cameras;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            return cameras;
        }

        let tempStream = null;

        try {
            tempStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                },
            });
        } catch (error) {
            console.warn('Не удалось прогреть список камер:', error);
            return cameras;
        } finally {
            tempStream?.getTracks?.().forEach((track) => track.stop());
        }

        try {
            cameras = await readVideoInputs();
        } catch (error) {
            console.warn('Не удалось обновить список камер после прогрева:', error);
        }

        return cameras;
    }

    async function requestCameraStream(cameraIdToUse) {
        const fallbackConstraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 480, max: 480 },
                height: { ideal: 480, max: 480 },
                aspectRatio: 1,
            },
        };

        if (isIOS()) {
            return navigator.mediaDevices.getUserMedia(fallbackConstraints);
        }

        if (cameraIdToUse) {
            try {
                return await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: cameraIdToUse },
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 480, max: 480 },
                        height: { ideal: 480, max: 480 },
                        aspectRatio: 1,
                    },
                });
            } catch (error) {
                debugCamera('exact_camera_request_failed', {
                    cameraIdToUse,
                    message: error?.message,
                    name: error?.name,
                });

                if (
                    error?.name !== 'NotFoundError' &&
                    error?.name !== 'OverconstrainedError' &&
                    error?.name !== 'AbortError'
                ) {
                    throw error;
                }

                resetSelectedCamera('exact_camera_request_failed');
            }
        }

        debugCamera('request_camera_stream_fallback', {
            selectedCameraId: state.selectedCameraId,
        });
        return navigator.mediaDevices.getUserMedia(fallbackConstraints);
    }

    function startDecodeLoop(sessionId, cameraIdToUse) {
        if (!dom.videoElement) {
            return;
        }

        const ZXing = getZxingReader();
        const codeReader = ensureCodeReader();
        const decodeRunId = (state.decodeRunId || 0) + 1;
        state.decodeRunId = decodeRunId;

        debugCamera('decode_loop_start', {
            sessionId,
            decodeRunId,
            cameraIdToUse,
            activeRootScreen: state.activeRootScreen,
        });

        codeReader.decodeFromVideoDevice(
            cameraIdToUse || undefined,
            dom.videoElement.id,
            (result, error) => {
                if (
                    !isCurrentSession(sessionId) ||
                    !isCurrentDecodeRun(decodeRunId)
                ) {
                    return;
                }

                if (result) {
                    if (state.scanPause?.active || state.isProcessing) {
                        return;
                    }

                    const decodedText = result.getText();
                    pauseScanning('scan_result');
                    resetCodeReader();
                    stopQrScanner({
                        preservePause: true,
                        reason: 'scan_result',
                    });

                    Promise.resolve(scanResultHandler?.(decodedText)).catch(
                        (scanError) => {
                            console.error('Ошибка обработки скана:', scanError);
                        },
                    );
                    return;
                }

                if (error && !(error instanceof ZXing.NotFoundException)) {
                    console.error('Ошибка сканирования:', error);
                }
            },
        );
    }

    async function updateCameraList() {
        if (!dom.cameraSelect || !navigator.mediaDevices?.enumerateDevices) {
            return [];
        }

        try {
            state.availableCameras = await getVideoInputsWithWarmup();
            debugCamera('update_camera_list', {
                availableCameras: state.availableCameras.map((camera) => ({
                    deviceId: camera.deviceId,
                    label: camera.label,
                })),
                selectedCameraId: state.selectedCameraId,
            });

            dom.cameraSelect.innerHTML = '';

            state.availableCameras.forEach((camera, index) => {
                const option = document.createElement('option');
                option.value = camera.deviceId;
                option.textContent = camera.label || `Камера ${index + 1}`;
                dom.cameraSelect.appendChild(option);
            });

            if (
                state.selectedCameraId &&
                state.availableCameras.some(
                    (camera) => camera.deviceId === state.selectedCameraId,
                )
            ) {
                dom.cameraSelect.value = state.selectedCameraId;
            }

            if (state.availableCameras.length === 0) {
                dom.cameraSelect.style.display = 'none';
            }

            return state.availableCameras;
        } catch (error) {
            console.error('Ошибка обновления списка камер:', error);
            dom.cameraSelect.style.display = 'none';
            return [];
        }
    }

    async function pickCameraId(preferredCameraId) {
        const cameras =
            state.availableCameras.length > 0
                ? state.availableCameras
                : await updateCameraList();

        if (preferredCameraId) {
            const preferredCamera = cameras.find(
                (camera) => camera.deviceId === preferredCameraId,
            );

            if (preferredCamera) {
                debugCamera('pick_camera_id_preferred', {
                    preferredCameraId,
                    matched: true,
                });
                return preferredCameraId;
            }

            resetSelectedCamera('stale_selected_camera');
        }

        let camera = cameras.find(
            (item) => item.label && /camera2 2,? facing back/i.test(item.label),
        );

        if (!camera) {
            camera = cameras.find(
                (item) => item.label && /back/i.test(item.label),
            );
        }

        if (!camera) {
            camera = cameras.find(
                (item) => item.label && /wide/i.test(item.label),
            );
        }

        if (!camera) {
            camera = cameras[0] || null;
        }

        debugCamera('pick_camera_id_fallback', {
            preferredCameraId,
            resolvedCameraId: camera?.deviceId || null,
            availableCameras: cameras.map((item) => ({
                deviceId: item.deviceId,
                label: item.label,
            })),
        });

        return camera ? camera.deviceId : null;
    }

    function clearVideoStream() {
        if (state.stream) {
            state.stream.getTracks().forEach((track) => track.stop());
            state.stream = null;
        }

        if (dom.videoElement) {
            const currentStream = dom.videoElement.srcObject;

            if (currentStream?.getTracks) {
                currentStream.getTracks().forEach((track) => track.stop());
            }

            try {
                dom.videoElement.pause();
            } catch (error) {
                console.warn('Ошибка паузы видеоэлемента:', error);
            }

            dom.videoElement.srcObject = null;
        }
    }

    function stopQrScanner(options = {}) {
        debugCamera('stop_qr_scanner', {
            reason: options.reason || (options.manual ? 'manual' : 'stop'),
            manual: Boolean(options.manual),
            preservePause: Boolean(options.preservePause),
            activeRootScreen: state.activeRootScreen,
            scannerPhase: state.scannerPhase,
            scannerActive: state.scannerActive,
            scannerStarting: state.scannerStarting,
            selectedCameraId: state.selectedCameraId,
            hasStream: Boolean(state.stream),
        });

        if (options.manual) {
            setAutoRestartAllowed(false);
        }

        state.stopReason = options.reason || (options.manual ? 'manual' : 'stop');
        state.scannerStarting = false;
        state.decodeRunId += 1;
        cancelPendingRestart();

        if (options.preservePause) {
            clearPauseTimer();
        } else {
            clearScanPause();
        }

        state.scanSessionId += 1;
        resetCodeReader({ discardInstance: true });
        clearVideoStream();

        state.scannerActive = false;
        setScannerPhase(
            options.manual
                ? 'stopped_manual'
                : options.preservePause
                  ? 'paused_after_scan'
                  : 'idle',
        );

        if (!options.preservePause) {
            ui.setQrViewportState('idle');
        }

        ui.setLoading(false);
    }

    async function restartQrScannerIfAllowed() {
        if (!isHomeScreenActive()) {
            debugCamera('restart_blocked_non_home', {
                activeRootScreen: state.activeRootScreen,
                scannerPhase: state.scannerPhase,
                selectedCameraId: state.selectedCameraId,
            });
            return;
        }

        if (!state.autoRestartAllowed || state.scannerStarting || isScannerActive()) {
            return;
        }

        clearScanPause();
        await startQrScanner(state.selectedCameraId);
    }

    function scheduleRestartIfAllowed(delayMs) {
        cancelPendingRestart();

        if (!state.autoRestartAllowed) {
            return;
        }

        if (!state.scanPause?.active) {
            setScanPause('scan_result');
        }

        state.restartTimerId = window.setTimeout(async () => {
            state.restartTimerId = null;
            await restartQrScannerIfAllowed();
        }, delayMs);
    }

    async function startQrScanner(cameraIdOverride) {
        debugCamera('start_qr_scanner_enter', {
            cameraIdOverride,
            activeRootScreen: state.activeRootScreen,
            scannerPhase: state.scannerPhase,
            scannerActive: state.scannerActive,
            scannerStarting: state.scannerStarting,
            selectedCameraId: state.selectedCameraId,
            hasStream: Boolean(state.stream),
        });

        if (!isHomeScreenActive()) {
            debugCamera('start_qr_scanner_blocked_non_home', {
                cameraIdOverride,
                activeRootScreen: state.activeRootScreen,
                selectedCameraId: state.selectedCameraId,
            });
            ui.setLoading(false);
            return;
        }

        cancelPendingRestart();
        clearScanPause();
        setAutoRestartAllowed(true);
        state.stopReason = null;
        setScannerPhase('starting');

        if (!dom.videoElement) {
            setScannerPhase('idle');
            ui.showCameraNotice('error', 'Видеоэлемент камеры не найден', {
                duration: 4000,
            });
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setScannerPhase('idle');
            ui.showCameraNotice('error', 'Камера не поддерживается устройством', {
                duration: 4000,
            });
            return;
        }

        if (state.scannerStarting) {
            ui.setLoading(false);
            return;
        }

        if (isScannerActive()) {
            stopQrScanner({ reason: 'restart_before_start' });
        }

        state.scannerStarting = true;
        ui.setLoading(true);
        ui.setQrViewportState('loading');
        ui.setVideoVisible(true);

        const sessionId = state.scanSessionId + 1;
        state.scanSessionId = sessionId;
        let cameraIdToUse = cameraIdOverride || state.selectedCameraId || null;

        try {
            if (isIOS()) {
                state.stream = await requestCameraStream(null);
                debugCamera('get_user_media_success', {
                    platform: 'ios',
                    selectedCameraId: state.selectedCameraId,
                });
            } else {
                cameraIdToUse = await pickCameraId(cameraIdToUse);

                if (cameraIdToUse) {
                    syncSelectedCamera(cameraIdToUse);
                }

                state.stream = await requestCameraStream(cameraIdToUse);

                if (!cameraIdToUse) {
                    const refreshedCameras = await updateCameraList();
                    const fallbackCamera =
                        refreshedCameras.find((camera) => /back/i.test(camera.label || '')) ||
                        refreshedCameras[0] ||
                        null;

                    if (fallbackCamera?.deviceId) {
                        syncSelectedCamera(fallbackCamera.deviceId);
                    }
                }

                debugCamera('get_user_media_success', {
                    platform: 'default',
                    selectedCameraId: state.selectedCameraId,
                    requestedCameraId: cameraIdToUse,
                });
            }

            if (!isCurrentSession(sessionId)) {
                state.scannerStarting = false;
                setScannerPhase('idle');
                clearVideoStream();
                return;
            }

            dom.videoElement.setAttribute('playsinline', 'true');
            dom.videoElement.setAttribute('autoplay', 'true');
            dom.videoElement.muted = true;
            dom.videoElement.srcObject = state.stream;
            dom.videoElement.style.objectFit = 'cover';
            dom.videoElement.style.width = '100%';
            dom.videoElement.style.height = '100%';
            dom.videoElement.style.aspectRatio = '1/1';
            await dom.videoElement.play();
            debugCamera('video_play_success', {
                selectedCameraId: state.selectedCameraId,
                activeRootScreen: state.activeRootScreen,
            });

            if (!isCurrentSession(sessionId)) {
                state.scannerStarting = false;
                setScannerPhase('idle');
                clearVideoStream();
                return;
            }

            resetCodeReader({ discardInstance: true });
            ensureCodeReader();

            state.scannerActive = true;
            state.scannerStarting = false;
            setScannerPhase('scanning');
            ui.setQrViewportState('scanning');
            ui.setLoading(false);
            startDecodeLoop(sessionId, cameraIdToUse);
            debugCamera('start_qr_scanner_ready', {
                sessionId,
                selectedCameraId: state.selectedCameraId,
                scannerPhase: state.scannerPhase,
                scannerActive: state.scannerActive,
            });
        } catch (error) {
            state.scannerStarting = false;
            setScannerPhase('idle');
            console.error('Ошибка камеры:', error);
            debugCamera('start_qr_scanner_error', {
                message: error?.message,
                selectedCameraId: state.selectedCameraId,
                activeRootScreen: state.activeRootScreen,
            });
            stopQrScanner({ reason: 'camera_error' });
            ui.showCameraNotice(
                'error',
                error?.message || 'Ошибка запуска камеры',
                {
                    duration: 4200,
                },
            );
        }
    }

    async function handleCameraSelection(cameraId, options = {}) {
        const restartIfActive =
            Boolean(options.restartIfActive) &&
            isHomeScreenActive() &&
            isScannerActive();

        syncSelectedCamera(cameraId || null);
        debugCamera('handle_camera_selection', {
            cameraId,
            selectedCameraId: state.selectedCameraId,
            restartIfActive,
            source: options.source || 'unknown',
            activeRootScreen: state.activeRootScreen,
        });

        if (!restartIfActive) {
            return;
        }

        stopQrScanner({ reason: 'camera_switch' });
        await startQrScanner(state.selectedCameraId);
    }

    return {
        cancelPendingRestart,
        handleCameraSelection,
        isScannerActive,
        restartQrScannerIfAllowed,
        scheduleRestartIfAllowed,
        setAutoRestartAllowed,
        setScanResultHandler,
        startQrScanner,
        stopQrScanner,
        updateCameraList,
    };
}
