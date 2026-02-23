// 파일 역할: 운송모드 전역 오케스트레이션과 공개 API 엔트리를 담당한다.
// 핵심 책임: 모드 토글/렌더/포집 훅을 조합하고 외부 모듈이 단일 진입점으로 호출하게 한다.
// 연동 범위: globalController, warehouseIndex, stackDetailModal, detailModal, shopTrade가 공통으로 사용한다.

import { bindEventOnce } from "../../utils/domEvents.js";
import { clearAllPendingCommitTimers, schedulePendingCommit } from "./transportModeCommitQueue.js";
import { renderTransportBasketLayer } from "./transportModeBasketLayer.js";
import {
    clearTransportModeExternalCursor as clearTransportModeExternalCursorFromNet,
    DRAG_COMMIT_DELAY_MS,
    endTransportExternalSweep as endTransportExternalSweepFromNet,
    endTransportSourceDrag,
    handleTransportSourceTap as handleTransportSourceTapFromNet,
    resetTransportNetInteraction,
    startTransportExternalSweep as startTransportExternalSweepFromNet,
    startTransportSourceDrag,
    stepTransportSourceDrag,
    TAP_COMMIT_DELAY_MS,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK,
    updateTransportModeExternalCursor as updateTransportModeExternalCursorFromNet,
    moveTransportExternalSweep as moveTransportExternalSweepFromNet
} from "./transportModeNetInteraction.js";
import {
    notifyTransportWarehouseChanged,
    removeTransportItemsByIds,
    restoreTransportItemsToWarehouse,
    syncSourceItemsFromWarehouse,
    TRANSPORT_WAREHOUSE_CHANGED_EVENT
} from "./transportModeTransfer.js";
import {
    clearTransportModeItems,
    getTransportModeRuntimeState,
    isTransportModeEnabled,
    setTransportModeCollapsed,
    setTransportModeEnabled,
    setTransportModePendingItems,
    setTransportModeSourceItems,
    setTransportModeTransportItems
} from "./transportModeState.js";
import {
    ensureTransportModeLayer,
    getTransportModeElements,
    renderTransportModeLayerView
} from "./transportModeView.js";

let isInitialized = false;
let renderWarehousePageRef = () => {};
let transportBasketDropHandlerRef = null;
let suppressTransportBasketCanvasClick = false;
let suppressTransportBasketCanvasClickUntilMs = 0;

const activeTransportBasketDragSession = {
    pointerId: null,
    itemId: "",
    moved: false
};

function rerenderWarehousePage() {
    if (typeof renderWarehousePageRef === "function") {
        renderWarehousePageRef();
    }
}

function syncTransportModeBodyClass(isEnabled) {
    if (!(document.body instanceof HTMLElement)) {
        return;
    }

    document.body.classList.toggle("transport-mode-enabled", isEnabled === true);
}

function isTransportShopPageVisible() {
    const pageContainer = document.getElementById("pageContainer");
    const shopPage = document.getElementById("shopPage");

    if (!(pageContainer instanceof HTMLElement) || !(shopPage instanceof HTMLElement)) {
        return false;
    }

    const pageWidth = Math.max(1, pageContainer.clientWidth);
    const currentPageIndex = Math.round(pageContainer.scrollLeft / pageWidth);
    const shopPageIndex = Math.round(shopPage.offsetLeft / pageWidth);
    return currentPageIndex === shopPageIndex;
}

function isTransportBasketInteractionAllowed() {
    return isTransportModeEnabled() && isTransportShopPageVisible();
}

function resetTransportBasketDragSession() {
    activeTransportBasketDragSession.pointerId = null;
    activeTransportBasketDragSession.itemId = "";
    activeTransportBasketDragSession.moved = false;
}

function consumeTransportBasketCanvasClickSuppression() {
    if (suppressTransportBasketCanvasClick !== true) {
        return false;
    }

    if (Date.now() > suppressTransportBasketCanvasClickUntilMs) {
        suppressTransportBasketCanvasClick = false;
        suppressTransportBasketCanvasClickUntilMs = 0;
        return false;
    }

    suppressTransportBasketCanvasClick = false;
    suppressTransportBasketCanvasClickUntilMs = 0;
    return true;
}

function markTransportBasketCanvasClickSuppressed() {
    suppressTransportBasketCanvasClick = true;
    suppressTransportBasketCanvasClickUntilMs = Date.now() + 480;
}

function resolveUnderlyingElementAtClientPoint(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return null;
    }

    const elements = getTransportModeElements();
    const basketCanvas = elements.basketCanvas;
    if (!(basketCanvas instanceof HTMLCanvasElement)) {
        return null;
    }

    const previousPointerEvents = basketCanvas.style.pointerEvents;
    basketCanvas.style.pointerEvents = "none";

    let target = null;
    try {
        target = document.elementFromPoint(clientX, clientY);
    } finally {
        basketCanvas.style.pointerEvents = previousPointerEvents;
    }

    return target;
}

function resolveMerchantDropTargetFromClientPoint(clientX, clientY) {
    const underlyingTarget = resolveUnderlyingElementAtClientPoint(clientX, clientY);
    const merchantNode = underlyingTarget?.closest?.(".merchant-card[data-merchant-id]");
    const merchantId = merchantNode?.dataset?.merchantId;
    if (!(merchantNode instanceof HTMLElement) || typeof merchantId !== "string" || merchantId.length <= 0) {
        return null;
    }

    return {
        merchantId,
        merchantNode
    };
}

function dispatchPassthroughClick(target, sourceEvent) {
    if (!(target instanceof Element) || typeof MouseEvent !== "function") {
        return;
    }

    const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: Number.isFinite(sourceEvent?.clientX) ? sourceEvent.clientX : 0,
        clientY: Number.isFinite(sourceEvent?.clientY) ? sourceEvent.clientY : 0,
        button: 0,
        ctrlKey: sourceEvent?.ctrlKey === true,
        shiftKey: sourceEvent?.shiftKey === true,
        altKey: sourceEvent?.altKey === true,
        metaKey: sourceEvent?.metaKey === true
    });
    target.dispatchEvent(clickEvent);
}

function handleTransportBasketCanvasClick(event) {
    if (!isTransportBasketInteractionAllowed()) {
        return;
    }

    if (consumeTransportBasketCanvasClickSuppression()) {
        if (event.cancelable) {
            event.preventDefault();
        }
        event.stopPropagation();
        return;
    }

    const passthroughTarget = resolveUnderlyingElementAtClientPoint(event.clientX, event.clientY);
    if (!(passthroughTarget instanceof Element)) {
        return;
    }

    const transportLayer = getTransportModeElements().layer;
    if (transportLayer instanceof HTMLElement && passthroughTarget.closest?.(`#${transportLayer.id}`)) {
        return;
    }

    dispatchPassthroughClick(passthroughTarget, event);

    if (event.cancelable) {
        event.preventDefault();
    }
    event.stopPropagation();
}

function invokeTransportBasketDropHandler(payload) {
    if (typeof transportBasketDropHandlerRef !== "function") {
        return;
    }

    try {
        transportBasketDropHandlerRef(payload);
    } catch {
        // drop handler 내부 실패로 transport 입력 흐름이 중단되지 않게 보호한다.
    }
}

function buildTransportBasketPointerHooks() {
    return {
        onDragStart: (payload) => {
            if (!isTransportBasketInteractionAllowed()) {
                resetTransportBasketDragSession();
                return;
            }

            activeTransportBasketDragSession.pointerId = Number.isFinite(payload?.pointerId) ? payload.pointerId : null;
            activeTransportBasketDragSession.itemId = typeof payload?.itemId === "string" ? payload.itemId : "";
            activeTransportBasketDragSession.moved = false;
            if (activeTransportBasketDragSession.itemId) {
                markTransportBasketCanvasClickSuppressed();
            }
        },
        onDragMove: (payload) => {
            if (!isTransportBasketInteractionAllowed()) {
                return;
            }

            const pointerId = payload?.pointerId;
            if (!Number.isFinite(pointerId) || pointerId !== activeTransportBasketDragSession.pointerId) {
                return;
            }

            if (payload?.moved === true) {
                activeTransportBasketDragSession.moved = true;
            }
        },
        onTap: () => true,
        onDragEnd: (payload) => {
            const pointerId = payload?.pointerId;
            const isActiveSession = Number.isFinite(pointerId) && pointerId === activeTransportBasketDragSession.pointerId;
            const draggedItemId = activeTransportBasketDragSession.itemId;
            const moved = payload?.moved === true || activeTransportBasketDragSession.moved === true;

            resetTransportBasketDragSession();

            if (!isActiveSession || !draggedItemId || !moved || !isTransportBasketInteractionAllowed()) {
                return;
            }

            const dropTarget = resolveMerchantDropTargetFromClientPoint(payload?.clientX, payload?.clientY);
            if (!dropTarget) {
                return;
            }

            invokeTransportBasketDropHandler({
                itemId: draggedItemId,
                merchantId: dropTarget.merchantId,
                merchantNode: dropTarget.merchantNode,
                clientX: payload?.clientX,
                clientY: payload?.clientY
            });
        }
    };
}

function renderTransportMode() {
    const snapshot = getTransportModeRuntimeState();
    const elements = ensureTransportModeLayer();
    const isBasketInteractive = snapshot.enabled === true && isTransportShopPageVisible();

    syncTransportModeBodyClass(snapshot.enabled === true);

    if (elements.layer) {
        elements.layer.classList.toggle("transport-mode-basket-interactive", isBasketInteractive);
    }

    renderTransportModeLayerView(snapshot);
    renderTransportBasketLayer({
        enabled: snapshot.enabled,
        pendingItems: snapshot.pendingItems,
        transportItems: snapshot.transportItems,
        netCanvas: elements.netCanvas,
        basketCanvas: elements.basketCanvas,
        transportPointerHooks: buildTransportBasketPointerHooks()
    });
}

function handleTransportModeToggleClick() {
    toggleTransportMode();
}

function bindTransportModeEvents() {
    const elements = ensureTransportModeLayer();

    bindEventOnce(elements.toggleBtn, "click", "listenerTransportModeToggleBound", handleTransportModeToggleClick);
    bindEventOnce(elements.basketCanvas, "click", "listenerTransportBasketCanvasClickBound", handleTransportBasketCanvasClick);

    const pageContainer = document.getElementById("pageContainer");
    bindEventOnce(pageContainer, "scroll", "listenerTransportModePageScrollBound", () => {
        if (!isInitialized) {
            return;
        }

        renderTransportMode();
    });

    window.addEventListener("resize", () => {
        if (!isInitialized) {
            return;
        }

        renderTransportMode();
    });
}

function disableTransportMode(restoreWarehouse) {
    clearAllPendingCommitTimers();
    resetTransportNetInteraction();
    resetTransportBasketDragSession();
    suppressTransportBasketCanvasClick = false;
    suppressTransportBasketCanvasClickUntilMs = 0;

    if (restoreWarehouse) {
        const restoredCount = restoreTransportItemsToWarehouse();
        if (restoredCount > 0) {
            notifyTransportWarehouseChanged();
        }
    }

    setTransportModeEnabled(false);
    setTransportModeCollapsed(false);
    clearTransportModeItems();
    syncSourceItemsFromWarehouse();
    renderTransportMode();
    rerenderWarehousePage();
}

export function initTransportMode(options = {}) {
    renderWarehousePageRef = typeof options?.renderWarehousePage === "function" ? options.renderWarehousePage : () => {};

    if (!isInitialized) {
        ensureTransportModeLayer();
        bindTransportModeEvents();
        isInitialized = true;
    }

    // 재시작 이후 초기 진입에서는 운송모드를 항상 끈 상태로 시작한다.
    clearAllPendingCommitTimers();
    resetTransportNetInteraction();
    resetTransportBasketDragSession();
    suppressTransportBasketCanvasClick = false;
    suppressTransportBasketCanvasClickUntilMs = 0;
    setTransportModeEnabled(false);
    setTransportModeCollapsed(false);
    clearTransportModeItems();
    syncSourceItemsFromWarehouse();
    renderTransportMode();

    return {
        renderTransportMode,
        isTransportModeEnabled
    };
}

export function toggleTransportMode(forceEnabled) {
    const nextEnabled = typeof forceEnabled === "boolean" ? forceEnabled : !isTransportModeEnabled();
    if (!nextEnabled) {
        disableTransportMode(true);
        return false;
    }

    setTransportModeEnabled(true);
    setTransportModeCollapsed(false);
    syncSourceItemsFromWarehouse();
    renderTransportMode();
    rerenderWarehousePage();
    return true;
}

export function setTransportModeVisibleItems(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, "sourceItems")) {
        setTransportModeSourceItems(options.sourceItems);
    }

    if (Object.prototype.hasOwnProperty.call(options, "pendingItems")) {
        setTransportModePendingItems(options.pendingItems);
    }

    if (Object.prototype.hasOwnProperty.call(options, "transportItems")) {
        setTransportModeTransportItems(options.transportItems);
    }

    renderTransportMode();
}

export function setTransportModeBasketDropHandler(handler) {
    transportBasketDropHandlerRef = typeof handler === "function" ? handler : null;
}

export function getTransportModeTransportItems() {
    const snapshot = getTransportModeRuntimeState();
    return snapshot.transportItems;
}

export function consumeTransportModeItemsByIds(itemIds) {
    const removedItems = removeTransportItemsByIds(itemIds);
    if (removedItems.length > 0) {
        renderTransportMode();
    }

    return removedItems;
}

export function buildTransportModeSourcePointerHooks(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";

    return {
        onDragStart: (payload) => {
            startTransportSourceDrag({
                sourceKind,
                pointerId: payload?.pointerId
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

            if (stepResult.newlyCapturedItemIds.length > 0) {
                notifyTransportWarehouseChanged();
            }
            renderTransportMode();
        },
        onDragEnd: (payload) => {
            if (payload?.moved === true) {
                const endStepResult = stepTransportSourceDrag({
                    sourceKind,
                    pointerId: payload?.pointerId,
                    payload,
                    includeDraggingBody: true
                });

                if (endStepResult.newlyCapturedItemIds.length > 0) {
                    notifyTransportWarehouseChanged();
                }
            }

            const capturedIds = endTransportSourceDrag({
                sourceKind,
                pointerId: payload?.pointerId
            });
            renderTransportMode();

            if (capturedIds.length > 0) {
                schedulePendingCommit(capturedIds, DRAG_COMMIT_DELAY_MS, () => {
                    renderTransportMode();
                });
                rerenderWarehousePage();
            }
        }
    };
}

export function handleTransportModeSourceTap(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const capturedIds = handleTransportSourceTapFromNet(options);
    if (capturedIds.length <= 0) {
        return false;
    }

    notifyTransportWarehouseChanged();
    renderTransportMode();
    schedulePendingCommit(capturedIds, TAP_COMMIT_DELAY_MS, () => {
        renderTransportMode();
    });

    if (sourceKind !== TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST) {
        rerenderWarehousePage();
    }
    return true;
}

export function startTransportModeExternalSweep(options = {}) {
    const started = startTransportExternalSweepFromNet(options);
    if (started) {
        renderTransportMode();
    }
    return started;
}

export function moveTransportModeExternalSweep(options = {}) {
    const stepResult = moveTransportExternalSweepFromNet(options);
    if (stepResult.newlyCapturedItemIds.length > 0) {
        notifyTransportWarehouseChanged();
    }

    renderTransportMode();
    return stepResult.newlyCapturedItemIds;
}

export function endTransportModeExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const capturedIds = endTransportExternalSweepFromNet(options);
    renderTransportMode();

    if (capturedIds.length > 0) {
        schedulePendingCommit(capturedIds, DRAG_COMMIT_DELAY_MS, () => {
            renderTransportMode();
        });

        if (sourceKind !== TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST) {
            rerenderWarehousePage();
        }
        return true;
    }

    return false;
}

export function updateTransportModeExternalCursor(options = {}) {
    const updated = updateTransportModeExternalCursorFromNet(options);
    if (updated) {
        renderTransportMode();
    }
    return updated;
}

export function clearTransportModeExternalCursor() {
    clearTransportModeExternalCursorFromNet();
    renderTransportMode();
}

export function renderTransportModeLayer() {
    renderTransportMode();
}

export function getTransportModeElementsForDebug() {
    return getTransportModeElements();
}

export {
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK,
    TRANSPORT_WAREHOUSE_CHANGED_EVENT,
    isTransportModeEnabled
};
