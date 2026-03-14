import { findMatchingDeliveries } from './deliveries.js';

export function createScannerController({
    state,
    service,
    ui,
    camera,
    scanDelay = 2000,
}) {
    async function processDeliveryScan(delivery) {
        const scans = await service.getScans();
        const duplicateScan = scans.find(
            (scan) => scan.delivery_id === delivery.id,
        );

        if (duplicateScan) {
            ui.showScanResult(
                'already_scanned',
                delivery.id,
                delivery.courier_name,
                `Ранее сканировал: ${duplicateScan.courier_name || ''}`,
            );
            return {
                status: 'already_scanned',
                delivery,
            };
        }

        await service.saveScan(delivery.id, delivery.courier_name, Date.now());
        ui.showScanResult('success', delivery.id, delivery.courier_name);

        return {
            status: 'success',
            delivery,
        };
    }

    async function processTransferId(transferId, options = {}) {
        if (state.isProcessing) {
            return null;
        }

        state.isProcessing = true;
        ui.setLoading(true);

        try {
            const deliveries = await service.getDeliveries();
            const matchedResult = findMatchingDeliveries(transferId, deliveries);

            if (!matchedResult.cleanedId) {
                ui.showScanResult('error', 'Неверный формат QR', '', '', '');
                return {
                    status: 'invalid',
                };
            }

            if (matchedResult.matches.length === 0) {
                ui.showScanResult('not_found', matchedResult.cleanedId);
                return {
                    status: 'not_found',
                    cleanedId: matchedResult.cleanedId,
                };
            }

            if (matchedResult.matches.length === 1) {
                return processDeliveryScan(matchedResult.matches[0]);
            }

            ui.showTransferSelectModal(matchedResult.matches, async (selected) => {
                await processDeliveryScan(selected);

                if (options.resumeAfterSelection) {
                    camera.scheduleRestartIfAllowed(1000);
                }
            });

            return {
                status: 'selection_required',
                cleanedId: matchedResult.cleanedId,
            };
        } catch (error) {
            console.error('Ошибка при поиске передачи:', error);
            ui.showScanResult('error', 'Ошибка при поиске', '', '', '');

            return {
                status: 'error',
                error,
            };
        } finally {
            state.isProcessing = false;
            ui.setLoading(false);
        }
    }

    async function handleScanSuccess(decodedText) {
        const now = Date.now();

        if (now - state.lastScanTime < scanDelay) {
            return;
        }

        state.lastScanTime = now;
        navigator.vibrate?.(200);
        ui.flashFrame();

        const result = await processTransferId(decodedText, {
            resumeAfterSelection: true,
        });

        if (result?.status !== 'selection_required') {
            camera.scheduleRestartIfAllowed(1000);
        }
    }

    return {
        handleScanSuccess,
        processDeliveryScan,
        processTransferId,
    };
}
