// 파일 역할: 창고 원본(source) 입력 훅과 외부 sweep 포집 API를 제공한다.
// 핵심 책임: net interaction 결과를 pending/commit/render 흐름으로 연결해 일관된 포집 UX를 만든다.
// 연동 범위: transportMode controller가 생성해 warehouse/stack detail 입력 경로에서 재사용한다.

import { schedulePendingCommit } from "../transportModeCommitQueue.js";
import {
    clearTransportModeExternalCursor as clearTransportModeExternalCursorFromNet,
    DRAG_COMMIT_DELAY_MS,
    endTransportExternalSweep as endTransportExternalSweepFromNet,
    endTransportSourceDrag,
    handleTransportSourceTap as handleTransportSourceTapFromNet,
    startTransportExternalSweep as startTransportExternalSweepFromNet,
    startTransportSourceDrag,
    stepTransportSourceDrag,
    TAP_COMMIT_DELAY_MS,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK,
    moveTransportExternalSweep as moveTransportExternalSweepFromNet
} from "./transportModeNetInteraction.js";
import { notifyTransportWarehouseChanged } from "../transportModeTransfer.js";
import { consumeTransportNetDropStackItems, startTransportNetDropStack } from "./visualiseStackedMarimo.js";

const STACK_DROP_COMMIT_INTERVAL_MS = 85;

export function createTransportModeSourceHooks(options = {}) {
    const renderTransportMode = typeof options?.renderTransportMode === "function" ? options.renderTransportMode : () => {};
    const rerenderWarehousePage = typeof options?.rerenderWarehousePage === "function" ? options.rerenderWarehousePage : () => {};
    const placeTransportItemsAtDropPoint = typeof options?.placeTransportItemsAtDropPoint === "function"
        ? options.placeTransportItemsAtDropPoint
        : () => {};

    function notifyWarehouseChangeForCapture(sourceKind) {
        if (sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK) {
            notifyTransportWarehouseChanged({ liveStackCountOnly: true, sourceKind });
            return;
        }

        notifyTransportWarehouseChanged();
    }

    function buildTransportModeSourcePointerHooks(hookOptions = {}) {
        const sourceKind = typeof hookOptions?.sourceKind === "string" ? hookOptions.sourceKind : "";

        return {
            allowEmptyDragStart: true,
            onDragStart: (payload) => {
                return startTransportSourceDrag({
                    sourceKind,
                    pointerId: payload?.pointerId,
                    body: payload?.body,
                    clientX: payload?.clientX,
                    clientY: payload?.clientY
                });
            },
            onDragMove: (payload) => {
                if (payload?.moved !== true) {
                    return;
                }

                const stepResult = stepTransportSourceDrag({
                    sourceKind,
                    pointerId: payload?.pointerId,
                    payload,
                    includeDraggingBody: false
                });

                // 스택 상세 모달은 드래그 중 전체 재렌더를 피하고 count 라벨만 갱신한다.
                if (stepResult.newlyCapturedItemIds.length > 0) {
                    notifyWarehouseChangeForCapture(sourceKind);
                }
                renderTransportMode();
            },
            onDragEnd: (payload) => {
                const dropClientX = payload?.clientX;
                const dropClientY = payload?.clientY;
                if (payload?.moved === true) {
                    const endStepResult = stepTransportSourceDrag({
                        sourceKind,
                        pointerId: payload?.pointerId,
                        payload,
                        includeDraggingBody: true
                    });

                    if (endStepResult.newlyCapturedItemIds.length > 0) {
                        notifyWarehouseChangeForCapture(sourceKind);
                    }
                }

                const capturedIds = endTransportSourceDrag({
                    sourceKind,
                    pointerId: payload?.pointerId
                });

                if (capturedIds.length > 0 && Number.isFinite(dropClientX) && Number.isFinite(dropClientY)) {
                    startTransportNetDropStack({
                        itemIds: capturedIds,
                        clientX: dropClientX,
                        clientY: dropClientY
                    });
                }
                renderTransportMode();

                if (capturedIds.length > 0) {
                    notifyTransportWarehouseChanged();
                    schedulePendingCommit(capturedIds, DRAG_COMMIT_DELAY_MS, (committedItemIds) => {
                        consumeTransportNetDropStackItems(committedItemIds);
                        renderTransportMode();
                        placeTransportItemsAtDropPoint(committedItemIds, dropClientX, dropClientY);
                    }, {
                        intervalMs: capturedIds.length > 1 ? STACK_DROP_COMMIT_INTERVAL_MS : 0
                    });
                    rerenderWarehousePage();
                }
            }
        };
    }

    function handleTransportModeSourceTap(tapOptions = {}) {
        const sourceKind = typeof tapOptions?.sourceKind === "string" ? tapOptions.sourceKind : "";
        const dropClientX = tapOptions?.clientX;
        const dropClientY = tapOptions?.clientY;
        const capturedIds = handleTransportSourceTapFromNet(tapOptions);
        if (capturedIds.length <= 0) {
            return false;
        }

        notifyTransportWarehouseChanged();
        renderTransportMode();
        schedulePendingCommit(capturedIds, TAP_COMMIT_DELAY_MS, (committedItemIds) => {
            renderTransportMode();
            placeTransportItemsAtDropPoint(committedItemIds, dropClientX, dropClientY);
        });

        if (sourceKind !== TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST) {
            rerenderWarehousePage();
        }
        return true;
    }

    function startTransportModeExternalSweep(sweepOptions = {}) {
        const started = startTransportExternalSweepFromNet(sweepOptions);
        if (started) {
            renderTransportMode();
        }
        return started;
    }

    function moveTransportModeExternalSweep(sweepOptions = {}) {
        const sourceKind = typeof sweepOptions?.sourceKind === "string" ? sweepOptions.sourceKind : "";
        const stepResult = moveTransportExternalSweepFromNet(sweepOptions);
        if (stepResult.newlyCapturedItemIds.length > 0) {
            notifyWarehouseChangeForCapture(sourceKind);
        }

        renderTransportMode();
        return stepResult.newlyCapturedItemIds;
    }

    function endTransportModeExternalSweep(sweepOptions = {}) {
        const sourceKind = typeof sweepOptions?.sourceKind === "string" ? sweepOptions.sourceKind : "";
        const dropClientX = sweepOptions?.clientX;
        const dropClientY = sweepOptions?.clientY;
        const capturedIds = endTransportExternalSweepFromNet(sweepOptions);

        if (capturedIds.length > 0 && Number.isFinite(dropClientX) && Number.isFinite(dropClientY)) {
            startTransportNetDropStack({
                itemIds: capturedIds,
                clientX: dropClientX,
                clientY: dropClientY
            });
        }
        renderTransportMode();

        if (capturedIds.length > 0) {
            schedulePendingCommit(capturedIds, DRAG_COMMIT_DELAY_MS, (committedItemIds) => {
                consumeTransportNetDropStackItems(committedItemIds);
                renderTransportMode();
                placeTransportItemsAtDropPoint(committedItemIds, dropClientX, dropClientY);
            }, {
                intervalMs: capturedIds.length > 1 ? STACK_DROP_COMMIT_INTERVAL_MS : 0
            });

            if (sourceKind !== TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST) {
                rerenderWarehousePage();
            }
            return true;
        }

        return false;
    }

    function clearTransportModeExternalCursor() {
        clearTransportModeExternalCursorFromNet();
        renderTransportMode();
    }

    return {
        buildTransportModeSourcePointerHooks,
        handleTransportModeSourceTap,
        startTransportModeExternalSweep,
        moveTransportModeExternalSweep,
        endTransportModeExternalSweep,
        clearTransportModeExternalCursor
    };
}
