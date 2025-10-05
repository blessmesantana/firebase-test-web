// main.js

import { database } from './firebase.js';
import { ref, push, set, get, child, query, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

document.addEventListener("DOMContentLoaded", function () {
    // --- Камера: выбор устройства ---
    const cameraSelect = document.getElementById('cameraSelect');
    const cameraIconButton = document.getElementById('cameraIconButton');
    let availableCameras = [];
    let selectedCameraId = null;

    async function updateCameraList() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            availableCameras = devices.filter(device => device.kind === 'videoinput');
            cameraSelect.innerHTML = '';
            availableCameras.forEach((cam, idx) => {
                const option = document.createElement('option');
                option.value = cam.deviceId;
                option.textContent = cam.label || `Камера ${idx+1}`;
                cameraSelect.appendChild(option);
            });
            if (availableCameras.length > 0) {
                cameraSelect.style.display = 'inline-block';
            } else {
                cameraSelect.style.display = 'none';
            }
        } catch (e) {
            cameraSelect.style.display = 'none';
        }
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    if (cameraIconButton) {
        let cameraMenuVisible = false;
        cameraIconButton.addEventListener('click', async () => {
            if (!cameraMenuVisible) {
                await updateCameraList();
                cameraSelect.style.display = 'inline-block';
                cameraSelect.focus();
                cameraMenuVisible = true;
            } else {
                cameraSelect.style.display = 'none';
                cameraMenuVisible = false;
            }
        });
        if (cameraSelect) {
            cameraSelect.addEventListener('change', () => {
                selectedCameraId = cameraSelect.value;
                localStorage.setItem('selectedCameraId', selectedCameraId);
                cameraSelect.style.display = 'none';
                cameraMenuVisible = false;
                stopQrScanner();
                startQrScanner(selectedCameraId);
            });
        }
    }

    // При загрузке страницы восстанавливаем выбор камеры
    selectedCameraId = localStorage.getItem('selectedCameraId') || null;

    const resultDiv = document.getElementById('result');
    const resultTransferId = document.getElementById('resultTransferId');
    const resultCourier = document.getElementById('resultCourier');
    const resultPrevious = document.getElementById('resultPrevious');
    const resultStatus = document.getElementById('resultStatus');
    const resultRawData = document.getElementById('resultRawData');
    const qrResultOverlay = document.getElementById('qr-result-overlay');

    const inputModeButton = document.getElementById('inputModeButton');
    const manualInputContainer = document.getElementById('manualInputContainer');
    const manualTransferIdInput = document.getElementById('manualTransferId');
    const manualSubmitButton = document.getElementById('manualSubmitButton');
    const scanButton = document.getElementById('scanButton');
    const qrContainer = document.querySelector('.qr-container');
    const videoElement = document.getElementById('qr-video');
    const qrIcons = document.querySelectorAll('.qr-icon');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const qrSpinner = document.getElementById('qrSpinner');

    // Utility functions to show/hide all qr icons
    function hideAllQrIcons() {
        qrIcons.forEach(icon => icon.classList.add('hide'));
    }
    function showAllQrIcons() {
        qrIcons.forEach(icon => icon.classList.remove('hide'));
    }

    if (qrIcons.length) showAllQrIcons(); // Показываем иконки при загрузке

    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarMenu = document.getElementById('sidebarMenu');
    const addDataButton = document.getElementById('addDataButton');
    const submitRawDataButton = document.getElementById('submitRawDataButton');
    const showStatsButton = document.getElementById('showStatsButton');
    const statsContainer = document.getElementById('statsContainer');
    const statsList = document.getElementById('statsList');
    const rawDataInput = document.getElementById('rawData');

    const sidebarDataForm = document.getElementById('sidebarDataForm');
    const sidebarDataInput = document.getElementById('sidebarDataInput');
    const sidebarShowStatsButton = document.getElementById('sidebarShowStatsButton');
    const sidebarMenuNav = document.querySelector('nav#sidebarMenu');
    const sidebarStatsList = document.createElement('ul');
    sidebarStatsList.style.width = '100%';
    sidebarStatsList.style.background = '#3f51b5';
    sidebarStatsList.style.borderRadius = '5px';
    sidebarStatsList.style.padding = '10px';
    sidebarStatsList.style.marginTop = '10px';
    sidebarStatsList.style.maxHeight = '200px';
    sidebarStatsList.style.overflowY = 'auto';
    let sidebarStatsVisible = false;

    let stream = null;
    let codeReader = null;
    let lastScanTime = 0;
    const scanDelay = 2000;
    let isProcessing = false;

    // === Защита: Проверка наличия важных DOM-элементов ===
    if (!sidebarMenu) console.warn('sidebarMenu не найден!');
    if (!sidebarToggle) console.warn('sidebarToggle не найден!');
    if (!addDataButton) console.warn('addDataButton не найден!');
    if (!submitRawDataButton) console.warn('submitRawDataButton не найден!');
    if (!showStatsButton) console.warn('showStatsButton не найден!');
    if (!statsContainer) console.warn('statsContainer не найден!');
    if (!statsList) console.warn('statsList не найден!');
    if (!rawDataInput) console.warn('rawDataInput не найден!');
    if (!sidebarDataForm) console.warn('sidebarDataForm не найден!');
    if (!sidebarDataInput) console.warn('sidebarDataInput не найден!');
    if (!sidebarMenuNav) console.warn('sidebarMenuNav не найден!');

    // Dynamically adjust the overlay width to match the button
    if (inputModeButton && qrResultOverlay) {
        syncOverlayStyles(); // Синхронизируем стили при загрузке
    }

    // === ФУНКЦИЯ ДЛЯ СИНХРОНИЗАЦИИ ШИРИНЫ МОДАЛЬНЫХ ОКОН ===
    function setModalContentWidth(modalContent) {
        if (!inputModeButton || !modalContent) return;
        const buttonWidth = inputModeButton.offsetWidth;
        modalContent.style.width = buttonWidth + 'px';
        modalContent.style.minWidth = buttonWidth + 'px';
        modalContent.style.maxWidth = buttonWidth + 'px';
    }

    function syncOverlayStyles() {
        if (inputModeButton && qrResultOverlay) {
            // overlay теперь абсолютный и занимает всю .button-group, не нужно подгонять размеры
            qrResultOverlay.style.position = 'absolute';
            qrResultOverlay.style.top = '0';
            qrResultOverlay.style.left = '0';
            qrResultOverlay.style.width = '100%';
            qrResultOverlay.style.height = '100%';
            qrResultOverlay.style.margin = '0';
            qrResultOverlay.style.padding = '0';
            qrResultOverlay.style.boxSizing = 'border-box';
            qrResultOverlay.style.borderRadius = window.getComputedStyle(inputModeButton).borderRadius;
            // Можно убрать копирование других стилей, чтобы overlay всегда совпадал с кнопкой
        }
    }

    // Синхронизируем стили overlay при изменении размера окна
    window.addEventListener('resize', syncOverlayStyles);

    // Синхронизируем стили overlay при изменении размеров inputModeButton
    if (window.ResizeObserver && inputModeButton) {
        const ro = new ResizeObserver(syncOverlayStyles);
        ro.observe(inputModeButton);
    }

    if (scanButton) {
        scanButton.addEventListener('click', () => {
            scanButton.classList.add('released');
            startQrScanner();
            setTimeout(() => scanButton.classList.remove('released'), 500);
        });
    }

    // Показ сообщения
    window.showMessage = function(status, message, courier, previousCourier, rawData) {
        if (!qrResultOverlay) return;
        syncOverlayStyles(); // Синхронизировать стили overlay с inputModeButton
        let text = '';
        let colorClass = '';
        if (status === 'already_scanned') {
            text = courier ? courier : '';
            colorClass = 'already_scanned';
        } else if (status === 'success') {
            text = courier ? courier : '';
            colorClass = 'success';
        } else if (status === 'not_found') {
            text = message ? `Передача с ID ${message} не найдена` : 'Передача не найдена';
            colorClass = 'error';
        } else if (status === 'error') {
            text = message;
            colorClass = 'error';
        } else {
            text = message;
            colorClass = '';
        }
        qrResultOverlay.innerHTML = `<div class='qr-overlay-box'>${text.trim()}</div>`;
        qrResultOverlay.className = `show ${colorClass}`;
        resultDiv.style.display = 'none';
        // Таймер скрытия для всех уведомлений
        clearTimeout(qrResultOverlay._hideTimer);
        qrResultOverlay._hideTimer = setTimeout(() => {
            qrResultOverlay.className = '';
            qrResultOverlay.innerHTML = '';
        }, 2200);
    }

    // Обработчики событий
    if (inputModeButton) {
        inputModeButton.addEventListener('click', () => {
                inputModeButton.classList.add('active');
                manualInputContainer.classList.add('active');
                stopQrScanner();
                showAllQrIcons();
                if (videoElement) videoElement.style.display = 'none';
                manualTransferIdInput.focus();
        });
    }

    if (manualSubmitButton) {
        manualSubmitButton.addEventListener('click', () => {
            const transferId = manualTransferIdInput.value.trim();
            stopQrScanner();
            showAllQrIcons();
            if (videoElement) videoElement.style.display = 'none';
            if (/^\d{4}$/.test(transferId) || /^\d{10}$/.test(transferId)) {
                processTransferId(transferId).finally(() => {
                    stopQrScanner();
                    showAllQrIcons();
                    if (videoElement) videoElement.style.display = 'none';
                });
            } else {
                showMessage('error', 'Неверный формат ID', '', '', '');
            }
        });
    }

    if (manualTransferIdInput) {
        manualTransferIdInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') manualSubmitButton.click();
        });
    }

    // === Сайдбар: только чекбокс+label, без JS-открытия ===
    // Удаляем JS-обработчик sidebarToggle, работаем только с чекбоксом
    // === Закрытие сайдбара по клику вне его ===
    function handleSidebarClose(e) {
        const sidebarMenu = document.getElementById('sidebarMenu');
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (!sidebarMenu || !sidebarToggle) return;
        // Проверяем открыт ли сайдбар (чекбокс активен)
        const isOpen = sidebarToggle.checked;
        // Если клик вне меню и вне label (крестика/бургера)
        const label = document.querySelector('label[for="sidebarToggle"]');
        if (
            isOpen &&
            !sidebarMenu.contains(e.target) &&
            (!label || !label.contains(e.target))
        ) {
            sidebarToggle.checked = false;
        }
    }
    document.addEventListener('mousedown', handleSidebarClose);
    document.addEventListener('touchstart', handleSidebarClose);

    if (addDataButton) {
        addDataButton.addEventListener('click', async () => {
            if (!sidebarMenu || !rawDataInput || !submitRawDataButton || !statsContainer) return;
            sidebarMenu.style.display = 'block';
            rawDataInput.style.display = 'block';
            submitRawDataButton.style.display = 'block';
            statsContainer.style.display = 'none';
        });
    }

    if (submitRawDataButton) {
        submitRawDataButton.addEventListener('click', async () => {
            if (!rawDataInput) return;
            const rawData = rawDataInput.value.trim();
            if (!rawData) {
                showMessage('error', 'Введите данные', '', '', '');
                return;
            }
            let courierName, deliveryIds;
            try {
                ({ courierName, deliveryIds } = parseRawData(rawData));
            } catch (e) {
                showMessage('error', 'Ошибка разбора данных', '', '', '');
                return;
            }
            if (!courierName) {
                showMessage('error', 'Не найдено имя курьера', '', '', '');
                return;
            }
            if (!deliveryIds || deliveryIds.length === 0) {
                showMessage('error', 'Не найдены номера передач', '', '', '');
                return;
            }
            try {
                await saveCourierAndDeliveries(courierName, deliveryIds);
            } catch (e) {
                showMessage('error', 'Ошибка сохранения данных', '', '', '');
                return;
            }
            rawDataInput.value = '';
        });
    }

    if (showStatsButton) {
        showStatsButton.addEventListener('click', async () => {
            if (!rawDataInput || !submitRawDataButton || !statsContainer) return;
            rawDataInput.style.display = 'none';
            submitRawDataButton.style.display = 'none';
            statsContainer.style.display = 'block';
            try {
                await loadStats();
            } catch (e) {
                showMessage('error', 'Ошибка загрузки статистики', '', '', '');
            }
        });
    }

    if (sidebarDataForm && sidebarDataInput) {
        sidebarDataForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = sidebarDataInput.value.trim();
            if (!text) {
                showMessage('error', 'Введите данные', '', '', '');
                return;
            }
            let courierName, deliveryIds;
            try {
                ({ courierName, deliveryIds } = parseRawData(text));
            } catch (e) {
                showMessage('error', 'Ошибка разбора данных', '', '', '');
                return;
            }
            if (!courierName) {
                showMessage('error', 'Не найдено имя курьера', '', '', '');
                return;
            }
            if (!deliveryIds || deliveryIds.length === 0) {
                showMessage('error', 'Не найдены номера передач', '', '', '');
                return;
            }
            try {
                await saveCourierAndDeliveries(courierName, deliveryIds);
            } catch (e) {
                showMessage('error', 'Ошибка сохранения данных', '', '', '');
                return;
            }
            sidebarDataInput.value = '';
        });
    }

    if (sidebarShowStatsButton) sidebarShowStatsButton.remove();
    if (sidebarStatsList) sidebarStatsList.remove();

    // Переименовываем кнопку и переносим в неё функционал показа передач по курьеру
    const processButton = document.createElement('button');
    processButton.textContent = 'Курьеры';
    processButton.id = 'processScanButton';
    processButton.style.background = 'none';
    processButton.style.color = '#fff';
    processButton.style.border = 'none';
    processButton.style.fontSize = '13px';
    processButton.style.fontWeight = '500';
    processButton.style.fontFamily = 'Inter, sans-serif';
    processButton.style.textAlign = 'center';
    processButton.style.borderRadius = '18px';
    processButton.style.transition = 'background 0.2s';
    processButton.style.letterSpacing = 'normal';
    processButton.style.cursor = 'pointer';
    processButton.style.marginTop = '1px';
    processButton.style.padding = '12px 0 10px 0';
    processButton.style.width = '100%';
    sidebarMenuNav.appendChild(processButton);

    // === КНОПКА АРХИВ (ВСЕГДА ВНИЗУ) ===
    const archiveButton = document.createElement('button');
    archiveButton.id = 'archiveButton';
    archiveButton.style.background = 'none';
    archiveButton.style.color = '#fff';
    archiveButton.style.border = 'none';
    archiveButton.style.fontSize = '15px';
    archiveButton.style.fontWeight = '500';
    archiveButton.style.fontFamily = 'Inter, sans-serif';
    archiveButton.style.textAlign = 'center';
    archiveButton.style.borderRadius = '18px';
    archiveButton.style.transition = 'background 0.2s';
    archiveButton.style.letterSpacing = 'normal';
    archiveButton.style.cursor = 'pointer';
    archiveButton.style.padding = '12px 0 10px 0';
    archiveButton.style.width = '100%';
    archiveButton.style.display = 'flex';
    archiveButton.style.alignItems = 'center';
    archiveButton.style.justifyContent = 'center';
    archiveButton.style.marginTop = 'auto';
    archiveButton.style.marginBottom = '8px';
    archiveButton.innerHTML = `<span style="display:flex;align-items:center;width:20px;justify-content:flex-start;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 6.5V16a2 2 0 002 2h12a2 2 0 002-2V6.5M2 6.5L4.5 3h11L18 6.5M2 6.5h16" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span style="flex:1;text-align:left;padding-left:12px;">Архив</span>`;
    archiveButton.innerHTML = `<span style="display:flex;align-items:center;width:20px;justify-content:flex-start;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="7" width="10" height="9" rx="2" stroke="#fff" stroke-width="1.5"/><path d="M3 7h14" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><rect x="8" y="3" width="4" height="2" rx="1" stroke="#fff" stroke-width="1.5"/><path d="M7 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke="#fff" stroke-width="1.5"/></svg></span><span style="flex:1;text-align:left;padding-left:12px;">Удаление данных</span>`;
    sidebarMenuNav.appendChild(archiveButton);

    // === МОДАЛЬНОЕ ОКНО АРХИВА ===
    let archiveModal = null;
    let archiveModalContent = null;
    archiveButton.addEventListener('click', async () => {
        if (archiveModal) archiveModal.remove();
        archiveModal = document.createElement('div');
        archiveModal.style.position = 'fixed';
        archiveModal.style.top = '0';
        archiveModal.style.left = '0';
        archiveModal.style.width = '100vw';
        archiveModal.style.height = '100vh';
        archiveModal.style.background = 'rgba(0,0,0,0.7)';
        archiveModal.style.display = 'flex';
        archiveModal.style.alignItems = 'center';
        archiveModal.style.justifyContent = 'center';
        archiveModal.style.zIndex = '9999';
        archiveModal.addEventListener('click', () => archiveModal.remove());

        const modalContent = document.createElement('div');
        modalContent.style.background = '#3f51b5';
        modalContent.style.borderRadius = '32px';
        modalContent.style.padding = '32px 24px';
        modalContent.style.color = 'white';
        modalContent.style.textAlign = 'center';
        modalContent.style.position = 'relative';
        modalContent.style.fontFamily = 'Inter, sans-serif';
        modalContent.style.fontSize = '13px';
        modalContent.classList.add('archive-modal-content');
        archiveModalContent = modalContent;
        setModalContentWidth(modalContent);
        // Не закрывать модалку при клике внутри окна
        modalContent.addEventListener('click', e => e.stopPropagation());

        // === Ширина модального окна архива ===
        function setArchiveModalWidth() {
            if (inputModeButton) {
                const w = Math.min(inputModeButton.offsetWidth, 420); // ограничим ширину
                modalContent.style.width = w + 'px';
                modalContent.style.minWidth = '220px';
                modalContent.style.maxWidth = '90vw';
            } else {
                modalContent.style.minWidth = '220px';
                modalContent.style.maxWidth = '90vw';
            }
            modalContent.style.maxHeight = '80vh'; // ограничим высоту
            modalContent.style.overflowY = 'auto';
        }
        setArchiveModalWidth();
        window.addEventListener('resize', setArchiveModalWidth);

        // Заголовок
        const title = document.createElement('div');
        title.textContent = 'Удаление данных';
        title.style.fontSize = '13px';
        title.style.fontWeight = '500';
        title.style.marginBottom = '18px';
        title.style.fontFamily = 'Inter, sans-serif';
        modalContent.appendChild(title);

        // Получаем список курьеров
        const couriersSnap = await get(query(ref(database, 'couriers')));
        let couriers = [];
        if (couriersSnap.exists()) {
            couriersSnap.forEach(child => {
                const c = child.val();
                if (c.name) couriers.push({ name: c.name, id: child.key });
            });
        }
    couriers = [...new Set(couriers.map(c => c.name))].sort((a, b) => a.localeCompare(b, 'ru'));

        // Выбор курьера
        const courierSelect = document.createElement('select');
        courierSelect.style.width = '100%';
        courierSelect.style.marginBottom = '18px';
        courierSelect.style.fontSize = '13px';
        courierSelect.style.padding = '7px 0 7px 10px';
        courierSelect.style.borderRadius = '10px';
        courierSelect.style.border = 'none';
        courierSelect.style.background = '#3f51b5';
        courierSelect.style.color = '#fff';
        courierSelect.style.fontFamily = 'Inter, sans-serif';
        courierSelect.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';
        courierSelect.style.outline = 'none';
        courierSelect.classList.add('archive-courier-select');

        modalContent.appendChild(courierSelect);

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Выберите курьера';
        courierSelect.appendChild(defaultOption);
        couriers.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            courierSelect.appendChild(opt);
        });

        // После добавления всех курьеров в select
        const allOption = document.createElement('option');
        allOption.value = '__all__';
        allOption.textContent = 'Все';
        courierSelect.appendChild(allOption);

        // Кнопка удаления курьера (перемещаем сразу после select)
    // Кнопка удаления у выбранного курьера
    const deleteCourierBtn = document.createElement('button');
    deleteCourierBtn.textContent = 'Удалить курьера';
        deleteCourierBtn.style.background = '#ea1e63';
        deleteCourierBtn.style.color = '#fff';
        deleteCourierBtn.style.border = 'none';
        deleteCourierBtn.style.borderRadius = '18px';
        deleteCourierBtn.style.fontSize = '13px';
        deleteCourierBtn.style.fontWeight = '500';
        deleteCourierBtn.style.fontFamily = 'Inter, sans-serif';
        deleteCourierBtn.style.padding = '12px 0 10px 0';
        deleteCourierBtn.style.width = '100%';
        deleteCourierBtn.style.marginTop = '8px';
        deleteCourierBtn.style.cursor = 'pointer';
        deleteCourierBtn.classList.add('archive-delete-courier-btn');
        modalContent.appendChild(deleteCourierBtn);

        deleteCourierBtn.addEventListener('click', async () => {
            const selectedCourier = courierSelect.value;
            if (!selectedCourier) {
                window.showMessage('error', 'Выберите курьера для удаления');
                return;
            }
            if (selectedCourier === '__all__') {
                // Модальное окно подтверждения для удаления всех курьеров
                const confirmModal = document.createElement('div');
                confirmModal.style.position = 'fixed';
                confirmModal.style.top = '0';
                confirmModal.style.left = '0';
                confirmModal.style.width = '100vw';
                confirmModal.style.height = '100vh';
                confirmModal.style.background = 'rgba(0,0,0,0.7)';
                confirmModal.style.display = 'flex';
                confirmModal.style.alignItems = 'center';
                confirmModal.style.justifyContent = 'center';
                confirmModal.style.zIndex = '10000';
                confirmModal.addEventListener('click', () => confirmModal.remove());

                const confirmBox = document.createElement('div');
                confirmBox.style.background = '#3f51b5';
                confirmBox.style.borderRadius = '24px';
                confirmBox.style.padding = '28px 20px';
                confirmBox.style.color = 'white';
                confirmBox.style.textAlign = 'center';
                confirmBox.style.position = 'relative';
                confirmBox.style.fontFamily = 'Inter, sans-serif';
                confirmBox.style.fontSize = '15px';
                confirmBox.classList.add('archive-confirm-box');
                confirmBox.innerHTML = `<div style=\"margin-bottom:18px;\">Вы действительно хотите удалить <b style='font-size:16px;'>всех курьеров</b>?</div>`;

                const yesBtn = document.createElement('button');
                yesBtn.textContent = 'Удалить всех курьеров';
                yesBtn.style.background = '#ea1e63';
                yesBtn.style.color = '#fff';
                yesBtn.style.border = 'none';
                yesBtn.style.borderRadius = '18px';
                yesBtn.style.fontSize = '13px';
                yesBtn.style.fontWeight = '500';
                yesBtn.style.fontFamily = 'Inter, sans-serif';
                yesBtn.style.padding = '10px 0';
                yesBtn.style.width = '100%';
                yesBtn.style.cursor = 'pointer';
                yesBtn.style.marginBottom = '10px';
                yesBtn.classList.add('archive-confirm-btn');
                confirmBox.appendChild(yesBtn);

                const noBtn = document.createElement('button');
                noBtn.textContent = 'Отмена';
                noBtn.style.background = 'none';
                noBtn.style.color = '#fff';
                noBtn.style.border = '1px solid #fff';
                noBtn.style.borderRadius = '18px';
                noBtn.style.fontSize = '13px';
                noBtn.style.fontWeight = '500';
                noBtn.style.fontFamily = 'Inter, sans-serif';
                noBtn.style.padding = '10px 0';
                noBtn.style.width = '100%';
                noBtn.style.cursor = 'pointer';
                noBtn.classList.add('archive-cancel-btn');
                confirmBox.appendChild(noBtn);

                confirmModal.appendChild(confirmBox);
                document.body.appendChild(confirmModal);
                noBtn.addEventListener('click', () => confirmModal.remove());
                yesBtn.addEventListener('click', async () => {
                    yesBtn.disabled = true;
                    yesBtn.textContent = 'Удаление...';
                    // Удаляем всех курьеров
                    await set(ref(database, 'couriers'), null);
                    yesBtn.textContent = 'Готово!';
                    setTimeout(() => {
                        confirmModal.remove();
                        // Очищаем select
                        while (courierSelect.options.length > 1) {
                            courierSelect.remove(1);
                        }
                        showSuccessMessage('Все курьеры удалены!');
                    }, 1200);
                });
                return;
            }
            // Модальное окно подтверждения
            const confirmModal = document.createElement('div');
            confirmModal.style.position = 'fixed';
            confirmModal.style.top = '0';
            confirmModal.style.left = '0';
            confirmModal.style.width = '100vw';
            confirmModal.style.height = '100vh';
            confirmModal.style.background = 'rgba(0,0,0,0.7)';
            confirmModal.style.display = 'flex';
            confirmModal.style.alignItems = 'center';
            confirmModal.style.justifyContent = 'center';
            confirmModal.style.zIndex = '10000';
            confirmModal.addEventListener('click', () => confirmModal.remove());

            const confirmBox = document.createElement('div');
            confirmBox.style.background = '#3f51b5';
            confirmBox.style.borderRadius = '24px';
            confirmBox.style.padding = '28px 20px';
            confirmBox.style.color = 'white';
            confirmBox.style.textAlign = 'center';
            confirmBox.style.position = 'relative';
            confirmBox.style.fontFamily = 'Inter, sans-serif';
            confirmBox.style.fontSize = '15px';
            confirmBox.classList.add('archive-confirm-box');
            confirmBox.innerHTML = `<div style="margin-bottom:18px;">Вы действительно хотите удалить курьера <b style='font-size:16px;'>${selectedCourier}</b>?</div>`;

            const yesBtn = document.createElement('button');
            yesBtn.textContent = 'Удалить курьера';
            yesBtn.style.background = '#ea1e63';
            yesBtn.style.color = '#fff';
            yesBtn.style.border = 'none';
            yesBtn.style.borderRadius = '18px';
            yesBtn.style.fontSize = '13px';
            yesBtn.style.fontWeight = '500';
            yesBtn.style.fontFamily = 'Inter, sans-serif';
            yesBtn.style.padding = '10px 0';
            yesBtn.style.width = '100%';
            yesBtn.style.cursor = 'pointer';
            yesBtn.style.marginBottom = '10px';
            yesBtn.classList.add('archive-confirm-btn');
            confirmBox.appendChild(yesBtn);

            const noBtn = document.createElement('button');
            noBtn.textContent = 'Отмена';
            noBtn.style.background = 'none';
            noBtn.style.color = '#fff';
            noBtn.style.border = '1px solid #fff';
            noBtn.style.borderRadius = '18px';
            noBtn.style.fontSize = '13px';
            noBtn.style.fontWeight = '500';
            noBtn.style.fontFamily = 'Inter, sans-serif';
            noBtn.style.padding = '10px 0';
            noBtn.style.width = '100%';
            noBtn.style.cursor = 'pointer';
            noBtn.classList.add('archive-cancel-btn');
            confirmBox.appendChild(noBtn);

            confirmModal.appendChild(confirmBox);
            document.body.appendChild(confirmModal);
            noBtn.addEventListener('click', () => confirmModal.remove());
            yesBtn.addEventListener('click', async () => {
                yesBtn.disabled = true;
                yesBtn.textContent = 'Удаление...';
                // Удаляем курьера из базы
                const couriersSnap = await get(query(ref(database, 'couriers')));
                if (couriersSnap.exists()) {
                    couriersSnap.forEach(child => {
                        const c = child.val();
                        if (c.name === selectedCourier) {
                            set(child.ref, null);
                        }
                    });
                }
                yesBtn.textContent = 'Готово!';
                setTimeout(() => {
                    confirmModal.remove();
                    // Обновляем выпадающий список курьеров
                    while (courierSelect.options.length > 1) {
                        courierSelect.remove(1);
                    }
                    // Получаем обновлённый список курьеров
                    get(query(ref(database, 'couriers'))).then(snap => {
                        let updated = [];
                        if (snap.exists()) {
                            snap.forEach(child => {
                                const c = child.val();
                                if (c.name) updated.push(c.name);
                            });
                        }
                        updated = [...new Set(updated)].sort((a, b) => a.localeCompare(b, 'ru'));
                        updated.forEach(name => {
                            const opt = document.createElement('option');
                            opt.value = name;
                            opt.textContent = name;
                            courierSelect.appendChild(opt);
                        });
                    });
                }, 1200);
            });
        });

        // После добавления кнопки 'Удалить курьера'
        const deleteCourierDeliveriesBtn = document.createElement('button');
deleteCourierDeliveriesBtn.textContent = 'Удалить передачи у курьера';
deleteCourierDeliveriesBtn.style.background = '#ea1e63';
deleteCourierDeliveriesBtn.style.color = '#fff';
deleteCourierDeliveriesBtn.style.border = 'none';
deleteCourierDeliveriesBtn.style.borderRadius = '18px';
deleteCourierDeliveriesBtn.style.fontSize = '13px';
deleteCourierDeliveriesBtn.style.fontWeight = '500';
deleteCourierDeliveriesBtn.style.fontFamily = 'Inter, sans-serif';
deleteCourierDeliveriesBtn.style.padding = '12px 0 10px 0';
deleteCourierDeliveriesBtn.style.width = '100%';
deleteCourierDeliveriesBtn.style.marginTop = '8px';
deleteCourierDeliveriesBtn.style.cursor = 'pointer';
deleteCourierDeliveriesBtn.classList.add('archive-delete-btn');
modalContent.appendChild(deleteCourierDeliveriesBtn);

deleteCourierDeliveriesBtn.addEventListener('click', async () => {
    const selectedCourier = courierSelect.value;
    if (!selectedCourier) {
        window.showMessage('error', 'Выберите курьера для удаления передач');
        return;
    }
    // Модальное окно подтверждения
    const confirmModal = document.createElement('div');
    confirmModal.style.position = 'fixed';
    confirmModal.style.top = '0';
    confirmModal.style.left = '0';
    confirmModal.style.width = '100vw';
    confirmModal.style.height = '100vh';
    confirmModal.style.background = 'rgba(0,0,0,0.7)';
    confirmModal.style.display = 'flex';
    confirmModal.style.alignItems = 'center';
    confirmModal.style.justifyContent = 'center';
    confirmModal.style.zIndex = '10000';
    confirmModal.addEventListener('click', () => confirmModal.remove());

    const confirmBox = document.createElement('div');
    confirmBox.style.background = '#3f51b5';
    confirmBox.style.borderRadius = '24px';
    confirmBox.style.padding = '28px 20px';
    confirmBox.style.color = 'white';
    confirmBox.style.textAlign = 'center';
    confirmBox.style.position = 'relative';
    confirmBox.style.fontFamily = 'Inter, sans-serif';
    confirmBox.style.fontSize = '15px';
    confirmBox.classList.add('archive-confirm-box');
    confirmBox.innerHTML = `<div style="margin-bottom:18px;">Вы действительно хотите удалить все передачи у <b style='font-size:16px;'>${selectedCourier}</b>?</div>`;

    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Удалить передачи';
    yesBtn.style.background = '#ea1e63';
    yesBtn.style.color = '#fff';
    yesBtn.style.border = 'none';
    yesBtn.style.borderRadius = '18px';
    yesBtn.style.fontSize = '13px';
    yesBtn.style.fontWeight = '500';
    yesBtn.style.fontFamily = 'Inter, sans-serif';
    yesBtn.style.padding = '10px 0';
    yesBtn.style.width = '100%';
    yesBtn.style.cursor = 'pointer';
    yesBtn.style.marginBottom = '10px';
    yesBtn.classList.add('archive-confirm-btn');
    confirmBox.appendChild(yesBtn);

    const noBtn = document.createElement('button');
    noBtn.textContent = 'Отмена';
    noBtn.style.background = 'none';
    noBtn.style.color = '#fff';
    noBtn.style.border = '1px solid #fff';
    noBtn.style.borderRadius = '18px';
    noBtn.style.fontSize = '13px';
    noBtn.style.fontWeight = '500';
    noBtn.style.fontFamily = 'Inter, sans-serif';
    noBtn.style.padding = '10px 0';
    noBtn.style.width = '100%';
    noBtn.style.cursor = 'pointer';
    noBtn.classList.add('archive-cancel-btn');
    confirmBox.appendChild(noBtn);

    confirmModal.appendChild(confirmBox);
    document.body.appendChild(confirmModal);
    noBtn.addEventListener('click', () => confirmModal.remove());
    yesBtn.addEventListener('click', async () => {
        yesBtn.disabled = true;
        yesBtn.textContent = 'Удаление...';
        // Удаляем передачи выбранного курьера
        const deliveriesRef = ref(database, 'deliveries');
        const deliveriesSnap = await get(deliveriesRef);
        if (deliveriesSnap.exists()) {
            deliveriesSnap.forEach(child => {
                const d = child.val();
                if (d.courier_name === selectedCourier) {
                    set(child.ref, null);
                }
            });
        }
        yesBtn.textContent = 'Готово!';
        setTimeout(() => {
            confirmModal.remove();
            window.showMessage('success', '', '', '', `Передачи курьера "${selectedCourier}" удалены!`);
        }, 1200);
    });
});

const deleteAllDeliveriesBtn = document.createElement('button');
deleteAllDeliveriesBtn.textContent = 'Удалить все передачи';
deleteAllDeliveriesBtn.style.background = '#ea1e63';
deleteAllDeliveriesBtn.style.color = '#fff';
deleteAllDeliveriesBtn.style.border = 'none';
deleteAllDeliveriesBtn.style.borderRadius = '18px';
deleteAllDeliveriesBtn.style.fontSize = '13px';
deleteAllDeliveriesBtn.style.fontWeight = '500';
deleteAllDeliveriesBtn.style.fontFamily = 'Inter, sans-serif';
deleteAllDeliveriesBtn.style.padding = '12px 0 10px 0';
deleteAllDeliveriesBtn.style.width = '100%';
deleteAllDeliveriesBtn.style.marginTop = '8px';
deleteAllDeliveriesBtn.style.cursor = 'pointer';
deleteAllDeliveriesBtn.classList.add('archive-delete-all-btn');
modalContent.appendChild(deleteAllDeliveriesBtn);

deleteAllDeliveriesBtn.addEventListener('click', async () => {
    if (!confirm('Удалить все передачи и сканы для всех курьеров?')) return;
    await set(ref(database, 'deliveries'), null);
    window.showMessage('success', '', '', '', 'Все передачи удалены!');
});

        archiveModal.appendChild(modalContent);
        document.body.appendChild(archiveModal);
    });

    // Модальное окно для вывода статистики по курьеру (оставляем как было)
    let courierStatsModal = null;
    let courierStatsModalContent = null;
    function showCourierStatsModal(courierName) {
        if (courierStatsModal) courierStatsModal.remove();
        courierStatsModal = document.createElement('div');
        courierStatsModal.style.position = 'fixed';
        courierStatsModal.style.top = '0';
        courierStatsModal.style.left = '0';
        courierStatsModal.style.width = '100vw';
        courierStatsModal.style.height = '100vh';
        courierStatsModal.style.background = 'rgba(0,0,0,0.7)';
        courierStatsModal.style.display = 'flex';
        courierStatsModal.style.alignItems = 'center';
        courierStatsModal.style.justifyContent = 'center';
        courierStatsModal.style.zIndex = '9999';
        courierStatsModal.addEventListener('click', () => courierStatsModal.remove());

        const modalContent = document.createElement('div');
        modalContent.style.background = '#3f51b5';
        modalContent.style.borderRadius = '32px';
        modalContent.style.padding = '32px 24px';
        modalContent.style.color = 'white';
        modalContent.style.textAlign = 'center';
        modalContent.style.position = 'relative';
        modalContent.style.fontFamily = 'Inter, sans-serif';
        modalContent.style.fontSize = '13px';
        modalContent.classList.add('courierStatsModalContent');
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflowY = 'auto';
        courierStatsModalContent = modalContent;
        setModalContentWidth(modalContent);

        const title = document.createElement('div');
        title.textContent = courierName;
        title.style.fontSize = '13px';
        title.style.fontWeight = '500';
        title.style.marginBottom = '18px';
        title.style.fontFamily = 'Inter, sans-serif';
        modalContent.appendChild(title);

        // Добавим кнопку закрытия для удобства
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '12px';
        closeBtn.style.right = '18px';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#fff';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontFamily = 'Inter, sans-serif';
        closeBtn.addEventListener('click', () => courierStatsModal.remove());
        modalContent.appendChild(closeBtn);

        // Получаем все передачи и сканы для этого курьера
        Promise.all([
            get(query(ref(database, 'deliveries'))),
            get(query(ref(database, 'scans')))
        ]).then(([deliveriesSnap, scansSnap]) => {
            const allDeliveries = [];
            if (deliveriesSnap.exists()) {
                deliveriesSnap.forEach(child => {
                    const d = child.val();
                    if (d.courier_name === courierName) allDeliveries.push(d.id);
                });
            }
            const scanned = new Set();
            if (scansSnap.exists()) {
                scansSnap.forEach(child => {
                    const s = child.val();
                    if (s.courier_name === courierName) scanned.add(s.delivery_id);
                });
            }
            // Неотсканированные сверху, отсканированные снизу (opacity 0.6)
            const notScanned = allDeliveries.filter(id => !scanned.has(id));
            const scannedList = allDeliveries.filter(id => scanned.has(id));
            const list = document.createElement('div');
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '6px';
            list.style.maxHeight = '55vh';
            list.style.overflowY = 'auto';
            notScanned.forEach(id => {
                const el = document.createElement('div');
                el.textContent = id;
                el.style.fontSize = '13px';
                el.style.opacity = '1';
                el.style.transition = 'opacity 0.3s';
                el.style.fontFamily = 'Inter, sans-serif';
                list.appendChild(el);
            });
            scannedList.forEach(id => {
                const el = document.createElement('div');
                el.textContent = id;
                el.classList.add('scanned'); // Класс для перечеркивания и прозрачности
                el.style.opacity = '0.6';
                el.style.fontSize = '13px';
                el.style.transition = 'opacity 0.3s';
                el.style.fontFamily = 'Inter, sans-serif';
                list.appendChild(el);
            });
            modalContent.appendChild(list);
        });

        courierStatsModal.appendChild(modalContent);
        document.body.appendChild(courierStatsModal);
    }

    processButton.addEventListener('click', async () => {
        // Получаем список всех курьеров
        const couriersSnap = await get(query(ref(database, 'couriers')));
        let couriers = [];
        if (couriersSnap.exists()) {
            couriersSnap.forEach(child => {
                const c = child.val();
                if (c.name) couriers.push(c.name);
            });
        }
    couriers = [...new Set(couriers)].sort((a, b) => a.localeCompare(b, 'ru'));
        // Показываем выбор курьера
        const selectModal = document.createElement('div');
        selectModal.style.position = 'fixed';
        selectModal.style.top = '0';
        selectModal.style.left = '0';
        selectModal.style.width = '100vw';
        selectModal.style.height = '100vh';
        selectModal.style.background = 'rgba(0,0,0,0.7)';
        selectModal.style.display = 'flex';
        selectModal.style.alignItems = 'center';
        selectModal.style.justifyContent = 'center';
        selectModal.style.zIndex = '9999';
        selectModal.addEventListener('click', () => selectModal.remove());
        const modalContent = document.createElement('div');
        modalContent.style.background = '#3f51b5';
        modalContent.style.borderRadius = '32px';
        modalContent.style.padding = '32px 24px';
        modalContent.style.color = 'white';
        modalContent.style.textAlign = 'center';
        modalContent.style.position = 'relative';
        modalContent.style.fontFamily = 'Inter, sans-serif';
        modalContent.style.fontSize = '13px';
        modalContent.classList.add('select-modal-content');
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflowY = 'auto';
        setModalContentWidth(modalContent);

        const title = document.createElement('div');
        title.textContent = 'Выберите курьера';
        title.style.fontSize = '13px';
        title.style.fontWeight = '500';
        title.style.marginBottom = '18px';
        title.style.fontFamily = 'Inter, sans-serif';
        modalContent.appendChild(title);
        couriers.forEach(name => {
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.margin = '8px 0';
            btn.style.padding = '10px 0';
            btn.style.background = '#ea1e63';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '18px';
            btn.style.fontSize = '13px';
            btn.style.fontWeight = '500';
            btn.style.fontFamily = 'Inter, sans-serif';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', () => {
                selectModal.remove();
                showCourierStatsModal(name);
            });
            modalContent.appendChild(btn);
        });
        selectModal.appendChild(modalContent);
        document.body.appendChild(selectModal);
    });

    // --- Удаление курьеров ---
const deleteCouriersButton = document.getElementById('deleteCouriersButton');
const couriersDeleteList = document.getElementById('couriersDeleteList');

// Получить и отсортировать курьеров по алфавиту
function fetchAndRenderCouriersForDelete() {
    couriersDeleteList.innerHTML = '<div style="color:#888;font-size:14px;">Загрузка...</div>';
    firebase.database().ref('couriers').once('value', snapshot => {
        const couriers = snapshot.val() || {};
        const courierArr = Object.entries(couriers).map(([id, data]) => ({ id, name: data.name || '' }));
        courierArr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        if (courierArr.length === 0) {
            couriersDeleteList.innerHTML = '<div style="color:#888;font-size:14px;">Нет курьеров для удаления</div>';
            return;
        }
        couriersDeleteList.innerHTML = `
            <form id="couriersDeleteForm">
                ${courierArr.map(c => `
                    <label style="display:flex;align-items:center;margin-bottom:8px;font-size:15px;">
                        <input type="checkbox" name="courier" value="${c.id}" style="margin-right:8px;">
                        ${c.name}
                    </label>
                `).join('')}
                <button type="submit" style="background:#ea1e63;color:white;border:none;padding:8px 20px;border-radius:20px;font-size:14px;cursor:pointer;margin-top:12px;">Удалить выбранных</button>
            </form>
        `;
        document.getElementById('couriersDeleteForm').onsubmit = function(e) {
            e.preventDefault();
            const checked = Array.from(this.elements.courier).filter(cb => cb.checked).map(cb => cb.value);
            if (checked.length === 0) return;
            Promise.all(checked.map(id => firebase.database().ref('couriers/' + id).remove()))
                .then(() => {
                    fetchAndRenderCouriersForDelete();
                });
        };
    });
}

deleteCouriersButton.onclick = function() {
    couriersDeleteList.style.display = couriersDeleteList.style.display === 'none' ? 'block' : 'none';
    if (couriersDeleteList.style.display === 'block') {
        fetchAndRenderCouriersForDelete();
    }
};
// Логика удаления курьера теперь реализуется в archive-modal-content

    // === ОБНОВЛЕНИЕ ШИРИНЫ И СТИЛЕЙ МОДАЛОК И ВСПЛЫВАЮЩИХ ОКОН ПРИ РЕСАЙЗЕ ===
    function updateAllModalWidths() {
        setModalContentWidth(archiveModalContent);
        setModalContentWidth(courierStatsModalContent);
        // Для selectModal ищем по классу, т.к. он создается динамически
        const selectModalContent = document.querySelector('.select-modal-content');
        if (selectModalContent) setModalContentWidth(selectModalContent);
        // Для всплывающего окна результата
        syncOverlayStyles();
    }
    window.addEventListener('resize', updateAllModalWidths);
    updateAllModalWidths();

    // Функции
    function parseRawData(text) {
        if (!text || typeof text !== 'string') return { courierName: '', deliveryIds: [] };
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        if (lines.length === 0) return { courierName: '', deliveryIds: [] };

        // Фамилия — только первое слово первой строки, только буквы (рус/лат)
        const firstLine = lines[0];
        const courierNameMatch = firstLine.match(/^([А-Яа-яA-ZaZ]+)/);
        const courierName = courierNameMatch ? courierNameMatch[1] : '';

        // Все 10-значные числа из всех строк
        const deliveryIds = lines
            .map(line => line.match(/\b\d{10}\b/g))
            .filter(Boolean)
            .flat();

        return { courierName, deliveryIds };
    }

    async function saveCourierAndDeliveries(courierName, deliveryIds) {
        if (!courierName || !deliveryIds || deliveryIds.length === 0) {
            showMessage('error', 'Нет данных для сохранения', '', '', '');
            return;
        }
        try {
            console.log('Сохранение курьера:', courierName, 'и передач:', deliveryIds);
            const couriersRef = ref(database, 'couriers');
            const deliveriesRef = ref(database, 'deliveries');
            const newCourierRef = push(couriersRef);
            await set(newCourierRef, {
                name: courierName,
                timestamp: Date.now()
            });
            const courierId = newCourierRef.key;
            if (!courierId) throw new Error('Не удалось получить ID курьера');
            console.log('Курьер сохранен с ID:', courierId);
            for (const id of deliveryIds) {
                if (!id) continue;
                const newDeliveryRef = push(deliveriesRef);
                await set(newDeliveryRef, {
                    id,
                    courier_id: courierId,
                    courier_name: courierName,
                    timestamp: Date.now()
                });
                console.log('Передача сохранена с ID:', id);
            }
            showMessage('success', '', `Добавлен курьер: ${courierName}`, `Передач: ${deliveryIds.length}`);
        } catch (e) {
            console.error("Ошибка сохранения в Firebase: ", e);
            showMessage('error', 'Ошибка при сохранении', '', '', '');
        }
    }

    async function startQrScanner(cameraIdOverride) {
        try {
            if (!qrIcons.length) throw new Error('qrIcons не найдены');
            if (qrSpinner) qrSpinner.classList.add('active');
            hideAllQrIcons();
            let cameraIdToUse = cameraIdOverride || selectedCameraId;
            if (isIOS()) {
                // Для iPhone всегда environment
                cameraIdToUse = null;
            }
            if (!cameraIdToUse) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cameras = devices.filter(device => device.kind === 'videoinput');
                let camera = cameras.find(c => c.label && /camera2 2,? facing back/i.test(c.label));
                if (!camera) camera = cameras.find(c => c.label && /back/i.test(c.label));
                if (!camera) camera = cameras.find(c => c.label && /wide/i.test(c.label));
                if (!camera) camera = cameras[0] || null;
                // Для iOS — только environment
                if (isIOS() && cameras.length) {
                    camera = cameras.find(c => c.label && /back|environment/i.test(c.label)) || cameras[0];
                }
                cameraIdToUse = camera ? camera.deviceId : null;
            }
            if (!cameraIdToUse && isIOS()) {
                // Просто environment, deviceId не нужен
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 480, max: 480 },
                        height: { ideal: 480, max: 480 },
                        aspectRatio: 1
                    }
                });
            } else if (cameraIdToUse) {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: cameraIdToUse },
                        facingMode: { ideal: "environment" },
                        width: { ideal: 480, max: 480 },
                        height: { ideal: 480, max: 480 },
                        aspectRatio: 1
                    }
                });
            } else {
                showMessage('error', 'Камеры не найдены на устройстве', '', '', '');
                showAllQrIcons();
                if (qrSpinner) qrSpinner.classList.remove('active');
                return;
            }
            if (!videoElement) throw new Error('videoElement не найден');
            videoElement.srcObject = stream;
            videoElement.style.objectFit = 'cover';
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.aspectRatio = '1/1';
            await videoElement.play();
            if (qrSpinner) qrSpinner.classList.remove('active');
            if (!codeReader) {
                codeReader = new ZXing.BrowserMultiFormatReader();
            }
            codeReader.decodeFromVideoDevice(cameraIdToUse, 'qr-video', (result, err) => {
                if (result) {
                    onScanSuccess(result.getText());
                    codeReader.reset();
                    stopQrScanner();
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Ошибка сканирования:', err);
                }
            });
        } catch (err) {
            console.error('Ошибка камеры:', err.name, err.message, err.constraint);
            showMessage('error', 'Ошибка камеры: ' + (err.message || err), '', '', '');
            showAllQrIcons();
            if (qrSpinner) qrSpinner.classList.remove('active');
        } finally {
            if (qrSpinner && (!stream || !videoElement || videoElement.paused)) {
                qrSpinner.classList.remove('active');
            }
        }
    }

    function onScanSuccess(decodedText) {
        const now = Date.now();
        if (now - lastScanTime < scanDelay) return;
        lastScanTime = now;

        navigator.vibrate?.(200);
        flashFrame();
        processTransferId(decodedText).finally(() => {
            // После завершения обработки — снова открыть камеру через 1 секунду
            setTimeout(() => {
                startQrScanner();
            }, 1000); // Задержка 1 секунда, чтобы пользователь успел убрать QR
        });
    }

    function flashFrame() {
        qrContainer.classList.remove('flash');
        setTimeout(() => qrContainer.classList.add('flash'), 0);
    }

    async function processTransferId(transferId) {
        if (isProcessing) return;
        isProcessing = true;
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (qrSpinner) qrSpinner.classList.add('active');
        hideAllQrIcons();
        try {
            // Из QR берем либо 10-значное число, либо 4-значное
            let cleanedId = '';
            let isShort = false;
            const match10 = transferId.match(/\b\d{10}\b/);
            const match4 = transferId.match(/\b\d{4}\b/);
            if (match10) {
                cleanedId = match10[0];
            } else if (match4) {
                cleanedId = match4[0];
                isShort = true;
            }

            if (!cleanedId) {
                showMessage('error', 'Неверный формат QR', '', '', '');
                isProcessing = false;
                return;
            }

            const deliveriesQuery = query(ref(database, 'deliveries'));
            const snapshot = await get(deliveriesQuery);

            let found = false;
            let courierName = '';
            let courierId = '';
            let matchedDeliveries = [];

            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    const data = childSnapshot.val();
                    if (isShort) {
                        if (data.id && data.id.endsWith(cleanedId)) {
                            matchedDeliveries.push(data);
                        }
                    } else {
                        if (data.id === cleanedId) {
                            matchedDeliveries.push(data);
                        }
                    }
                });
            }

            if (matchedDeliveries.length === 0) {
                showMessage('not_found', cleanedId);
                isProcessing = false;
                return;
            }

            if (matchedDeliveries.length === 1) {
                // Обычная логика для одной передачи
                const data = matchedDeliveries[0];
                await processDeliveryScan(data);
                isProcessing = false;
                return;
            }

            // Если найдено несколько — показать выбор
            showTransferSelectModal(matchedDeliveries, async (selectedDelivery) => {
                await processDeliveryScan(selectedDelivery);
                isProcessing = false;
            });
        } catch (e) {
            console.error('Ошибка поиска:', e);
            showMessage('error', 'Ошибка при поиске', '', '', '');
            isProcessing = false;
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (qrSpinner) qrSpinner.classList.remove('active');
            showAllQrIcons();
            isProcessing = false;
        }
    }

    // Обработка выбранной передачи (или единственной)
    async function processDeliveryScan(data) {
        const cleanedId = data.id;
        const courierName = data.courier_name;
        // Проверяем на дубликат
        const scansRef = ref(database, 'scans');
        const scansQuery = query(scansRef);
        const scansSnapshot = await get(scansQuery);
        let duplicate = false;
        let prevCourier = '';
        if (scansSnapshot.exists()) {
            scansSnapshot.forEach(scanSnap => {
                const scan = scanSnap.val();
                if (scan.delivery_id === cleanedId) {
                    duplicate = true;
                    prevCourier = scan.courier_name || '';
                }
            });
        }
        if (duplicate) {
            showMessage('already_scanned', cleanedId, courierName, `Ранее сканировал: ${prevCourier}`);
        } else {
            const newScanRef = push(ref(database, 'scans'));
            await set(newScanRef, {
                delivery_id: cleanedId,
                courier_name: courierName,
                timestamp: Date.now()
            });
            showMessage('success', cleanedId, courierName);
        }
    }

    // Модалка выбора передачи по 4 цифрам
    function showTransferSelectModal(deliveries, onSelect) {
        // Удалить старую модалку если есть
        let selectModal = document.getElementById('transferSelectModal');
        if (selectModal) selectModal.remove(); // <-- Исправлено: удаляем старую модалку
        selectModal = document.createElement('div');
        selectModal.id = 'transferSelectModal';
        selectModal.style.position = 'fixed';
        selectModal.style.top = '0';
        selectModal.style.left = '0';
        selectModal.style.width = '100vw';
        selectModal.style.height = '100vh';
        selectModal.style.background = 'rgba(0,0,0,0.7)';
        selectModal.style.display = 'flex';
        selectModal.style.alignItems = 'center';
        selectModal.style.justifyContent = 'center';
        selectModal.style.zIndex = '10001';
        selectModal.addEventListener('click', () => selectModal.remove());

        const modalContent = document.createElement('div');
        modalContent.style.background = '#3f51b5';
        modalContent.style.borderRadius = '24px';
        modalContent.style.padding = '28px 20px';
        modalContent.style.color = 'white';
        modalContent.style.textAlign = 'center';
        modalContent.style.position = 'relative';
        modalContent.style.fontFamily = 'Inter, sans-serif';
        modalContent.style.fontSize = '13px';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflowY = 'auto';
        modalContent.style.minWidth = '220px';
        modalContent.style.maxWidth = '90vw';
        modalContent.addEventListener('click', e => e.stopPropagation());

        const title = document.createElement('div');
        title.textContent = 'Выберите передачу:';
        title.style.fontWeight = '500';
        title.style.marginBottom = '18px';
        modalContent.appendChild(title);

        deliveries.forEach(d => {
            const btn = document.createElement('button');
            btn.textContent = `${d.id} (${d.courier_name || 'Без курьера'})` + (d.timestamp ? `, ${new Date(d.timestamp).toLocaleDateString('ru-RU')}` : '');
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.margin = '8px 0';
            btn.style.padding = '10px 0';
            btn.style.background = '#ea1e63';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '18px';
            btn.style.fontSize = '13px';
            btn.style.fontWeight = '500';
            btn.style.fontFamily = 'Inter, sans-serif';
            btn.style.cursor = 'pointer';
            btn.addEventListener('click', () => {
                selectModal.remove();
                onSelect(d);
            });
            modalContent.appendChild(btn);
        });

        selectModal.appendChild(modalContent);
        document.body.appendChild(selectModal);
    }

    async function loadStats() {
        if (!statsList) return;
        statsList.innerHTML = '';
        console.log('Загрузка статистики...');
        try {
            const scansRef = ref(database, 'scans');
            const scansQuery = query(scansRef);
            const scansSnapshot = await get(scansQuery);
            if (scansSnapshot.exists()) {
                scansSnapshot.forEach(scanSnap => {
                    const scanData = scanSnap.val();
                    if (!scanData || !scanData.delivery_id || !scanData.courier_name || !scanData.timestamp) return;
                    const li = document.createElement('li');
                    let date;
                    try {
                        date = new Date(scanData.timestamp).toLocaleString('ru-RU');
                    } catch (e) {
                        date = 'неизвестно';
                    }
                    li.textContent = `ID: ${scanData.delivery_id}, Курьер: ${scanData.courier_name}, Время: ${date}`;
                    statsList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'Сканирований пока нет.';
                statsList.appendChild(li);
            }
            console.log('Статистика загружена успешно.');
        } catch (e) {
            console.error('Ошибка загрузки статистики:', e);
            const li = document.createElement('li');
            li.textContent = 'Ошибка загрузки статистики.';
            statsList.appendChild(li);
        }
    }

    function stopQrScanner() {
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
                if (videoElement) videoElement.srcObject = null;
            }
            if (codeReader) codeReader.reset();
            showAllQrIcons();
            if (qrSpinner) qrSpinner.classList.remove('active');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        } catch (e) {
            console.warn('Ошибка при остановке сканера:', e);
        }
    }

    function showSuccessMessage(text) {
        const msg = document.createElement('div');
        msg.textContent = text;
        msg.style.position = 'fixed';
        msg.style.top = '24px';
        msg.style.left = '50%';
        msg.style.transform = 'translateX(-50%)';
        msg.style.background = '#43ea7c';
        msg.style.color = '#fff';
        msg.style.fontFamily = 'Inter, sans-serif';
        msg.style.fontSize = '15px';
        msg.style.fontWeight = '500';
        msg.style.padding = '14px 32px';
        msg.style.borderRadius = '24px';
        msg.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
        msg.style.zIndex = '99999';
        msg.style.opacity = '0';
        msg.style.transition = 'opacity 0.3s, background 0.3s';
        document.body.appendChild(msg);
        setTimeout(() => { msg.style.opacity = '1'; }, 50);
        setTimeout(() => { msg.style.opacity = '0'; }, 1200);
        setTimeout(() => { msg.remove(); }, 1600);
    }
});