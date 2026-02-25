// 파일 역할: 운송모드 전역 오케스트레이션과 외부 공개 API 구현을 담당한다.
// 핵심 책임: state/view/net/transfer 모듈을 조합해 초기화·렌더·토글·입력 흐름을 일관 제어한다.
// 연동 범위: globalController, warehouse, shop가 호출하는 transportMode의 실제 컨트롤러 계층이다.

import { bindEventOnce } from "../../utils/domEvents.js";
import { initTransportBasketLayer } from "./basketLayer/index.js";
import { clearAllPendingCommitTimers } from "./transportModeCommitQueue.js";
import {
    initTransportNetLayer,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
} from "./netLayer/index.js";
import { placeTransportItemsAtDropPoint } from "./netLayer/transportModePlacement.js";
import {
    notifyTransportWarehouseChanged,
    removeTransportItemsByIds,
    restoreTransportItemsToWarehouse,
    syncSourceItemsFromWarehouse
} from "./transportModeTransfer.js";
import {
    clearTransportModeItems,
    getTransportModeRuntimeState,
    isTransportModeEnabled,
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
let basketLayerRef = null;
let netLayerRef = null;
let sourceHooksRef = null;

const TRANSPORT_GLOBAL_DRAG_ACTIVATE_DISTANCE_SQ = 64;
const TRANSPORT_GLOBAL_DRAG_IGNORE_SELECTOR = [
    "button",
    "a[href]",
    "input",
    "select",
    "textarea",
    "label",
    "summary",
    "[role=\"button\"]",
    "[role=\"link\"]",
    "[contenteditable=\"true\"]",
    "[data-transport-global-drag-ignore=\"true\"]"
].join(", ");

const activeGlobalDragCursorSession = {
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    lastClientX: 0,
    lastClientY: 0,
    activated: false,
    sweepStarted: false,
    sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN
};

function resetGlobalDragCursorSession() {
    activeGlobalDragCursorSession.pointerId = null;
    activeGlobalDragCursorSession.startClientX = 0;
    activeGlobalDragCursorSession.startClientY = 0;
    activeGlobalDragCursorSession.lastClientX = 0;
    activeGlobalDragCursorSession.lastClientY = 0;
    activeGlobalDragCursorSession.activated = false;
    activeGlobalDragCursorSession.sweepStarted = false;
    activeGlobalDragCursorSession.sourceKind = TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN;
}

function shouldIgnoreGlobalDragCursorStart(targetNode) {
    if (!(targetNode instanceof Element)) {
        return false;
    }

    if (targetNode.closest(TRANSPORT_GLOBAL_DRAG_IGNORE_SELECTOR)) {
        return true;
    }

    if (targetNode.closest("#warehouseGrid")) {
        return true;
    }

    const sourceCanvasNode = targetNode.closest?.(".warehouse-physics-canvas, .stack-detail-canvas");
    if (sourceCanvasNode) {
        return true;
    }

    return false;
}

function isConnectedVisibleCanvas(canvas) {
    return canvas instanceof HTMLCanvasElement
        && canvas.isConnected === true
        && canvas.getClientRects().length > 0;
}

function resolveGlobalDragSourceKind() {
    const stackCanvas = document.querySelector(".stack-detail-canvas");
    if (isConnectedVisibleCanvas(stackCanvas)) {
        return TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK;
    }

    return TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN;
}

function handleGlobalDragCursorPointerDown(event) {
    if (!isTransportModeEnabled() || activeGlobalDragCursorSession.pointerId !== null) {
        return;
    }

    if (!Number.isFinite(event?.pointerId)
        || !Number.isFinite(event?.clientX)
        || !Number.isFinite(event?.clientY)) {
        return;
    }

    if (shouldIgnoreGlobalDragCursorStart(event.target)) {
        return;
    }

    activeGlobalDragCursorSession.pointerId = event.pointerId;
    activeGlobalDragCursorSession.startClientX = event.clientX;
    activeGlobalDragCursorSession.startClientY = event.clientY;
    activeGlobalDragCursorSession.lastClientX = event.clientX;
    activeGlobalDragCursorSession.lastClientY = event.clientY;
    activeGlobalDragCursorSession.activated = false;
    activeGlobalDragCursorSession.sweepStarted = false;
    activeGlobalDragCursorSession.sourceKind = resolveGlobalDragSourceKind();
}

function handleGlobalDragCursorPointerMove(event) {
    if (activeGlobalDragCursorSession.pointerId === null || event?.pointerId !== activeGlobalDragCursorSession.pointerId) {
        return;
    }

    if (!isTransportModeEnabled()) {
        clearTransportModeExternalCursor();
        resetGlobalDragCursorSession();
        return;
    }

    if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) {
        return;
    }
    activeGlobalDragCursorSession.lastClientX = event.clientX;
    activeGlobalDragCursorSession.lastClientY = event.clientY;

    if (!activeGlobalDragCursorSession.activated) {
        const dx = event.clientX - activeGlobalDragCursorSession.startClientX;
        const dy = event.clientY - activeGlobalDragCursorSession.startClientY;
        if ((dx * dx) + (dy * dy) < TRANSPORT_GLOBAL_DRAG_ACTIVATE_DISTANCE_SQ) {
            return;
        }
        activeGlobalDragCursorSession.activated = true;
        const sweepStarted = startTransportModeExternalSweep({
            sourceKind: activeGlobalDragCursorSession.sourceKind,
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY
        });
        if (!sweepStarted) {
            clearTransportModeExternalCursor();
            resetGlobalDragCursorSession();
            return;
        }
        activeGlobalDragCursorSession.sweepStarted = true;
    }

    moveTransportModeExternalSweep({
        sourceKind: activeGlobalDragCursorSession.sourceKind,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY
    });
}

function completeGlobalDragCursorSession() {
    if (activeGlobalDragCursorSession.sweepStarted) {
        endTransportModeExternalSweep({
            sourceKind: activeGlobalDragCursorSession.sourceKind,
            pointerId: activeGlobalDragCursorSession.pointerId,
            clientX: activeGlobalDragCursorSession.lastClientX,
            clientY: activeGlobalDragCursorSession.lastClientY
        });
    } else if (activeGlobalDragCursorSession.activated) {
        clearTransportModeExternalCursor();
    }

    resetGlobalDragCursorSession();
}

function finishGlobalDragCursorSession(event) {
    if (activeGlobalDragCursorSession.pointerId === null || event?.pointerId !== activeGlobalDragCursorSession.pointerId) {
        return;
    }

    completeGlobalDragCursorSession();
}

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

function ensureControllerModules() {
    if (!basketLayerRef) {
        basketLayerRef = initTransportBasketLayer({
            isTransportBasketInteractionAllowed,
            getTransportElements: getTransportModeElements,
            onMerchantDrop: invokeTransportBasketDropHandler
        });
    }

    if (!netLayerRef) {
        netLayerRef = initTransportNetLayer({
            renderTransportMode,
            rerenderWarehousePage,
            placeTransportItemsAtDropPoint
        });
    }

    if (!sourceHooksRef && netLayerRef?.sourceHooks) {
        sourceHooksRef = netLayerRef.sourceHooks;
    }
}

function renderTransportMode() {
    ensureControllerModules();

    const snapshot = getTransportModeRuntimeState();
    const elements = ensureTransportModeLayer();
    const isBasketInteractive = snapshot.enabled === true && isTransportShopPageVisible();

    syncTransportModeBodyClass(snapshot.enabled === true);

    if (elements.layer) {
        elements.layer.classList.toggle("transport-mode-basket-interactive", isBasketInteractive);
    }

    renderTransportModeLayerView(snapshot);
    basketLayerRef.renderBasketLayers({
        enabled: snapshot.enabled,
        pendingItems: snapshot.pendingItems,
        transportItems: snapshot.transportItems,
        netCanvas: elements.netCanvas,
        basketCanvas: elements.basketCanvas
    });
}

function handleTransportModeToggleClick() {
    toggleTransportMode();
}

function bindTransportModeEvents() {
    ensureControllerModules();

    const elements = ensureTransportModeLayer();

    bindEventOnce(elements.toggleBtn, "click", "listenerTransportModeToggleBound", handleTransportModeToggleClick);
    bindEventOnce(elements.basketCanvas, "click", "listenerTransportBasketCanvasClickBound", basketLayerRef.handleBasketCanvasClick);

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
    window.addEventListener("pointerdown", handleGlobalDragCursorPointerDown);
    window.addEventListener("pointermove", handleGlobalDragCursorPointerMove);
    window.addEventListener("pointerup", finishGlobalDragCursorSession);
    window.addEventListener("pointercancel", finishGlobalDragCursorSession);
    window.addEventListener("blur", () => {
        if (activeGlobalDragCursorSession.pointerId !== null) {
            completeGlobalDragCursorSession();
        }
    });
}

function disableTransportMode(restoreWarehouse) {
    ensureControllerModules();

    clearAllPendingCommitTimers();
    resetGlobalDragCursorSession();
    netLayerRef.resetNetLayerInteraction();
    basketLayerRef.resetBasketLayerInteraction();

    if (restoreWarehouse) {
        const restoredCount = restoreTransportItemsToWarehouse();
        if (restoredCount > 0) {
            notifyTransportWarehouseChanged();
        }
    }

    setTransportModeEnabled(false);
    clearTransportModeItems();
    syncSourceItemsFromWarehouse();
    renderTransportMode();
    rerenderWarehousePage();
}

export function initTransportMode(options = {}) {
    renderWarehousePageRef = typeof options?.renderWarehousePage === "function" ? options.renderWarehousePage : () => {};

    ensureControllerModules();
    if (!isInitialized) {
        ensureTransportModeLayer();
        bindTransportModeEvents();
        isInitialized = true;
    }

    // 재시작 이후 초기 진입에서는 운송모드를 항상 끈 상태로 시작한다.
    clearAllPendingCommitTimers();
    resetGlobalDragCursorSession();
    netLayerRef.resetNetLayerInteraction();
    basketLayerRef.resetBasketLayerInteraction();
    setTransportModeEnabled(false);
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
    ensureControllerModules();
    return sourceHooksRef.buildTransportModeSourcePointerHooks(options);
}

export function handleTransportModeSourceTap(options = {}) {
    ensureControllerModules();
    return sourceHooksRef.handleTransportModeSourceTap(options);
}

export function startTransportModeExternalSweep(options = {}) {
    ensureControllerModules();
    return sourceHooksRef.startTransportModeExternalSweep(options);
}

export function moveTransportModeExternalSweep(options = {}) {
    ensureControllerModules();
    return sourceHooksRef.moveTransportModeExternalSweep(options);
}

export function endTransportModeExternalSweep(options = {}) {
    ensureControllerModules();
    return sourceHooksRef.endTransportModeExternalSweep(options);
}

export function clearTransportModeExternalCursor() {
    ensureControllerModules();
    sourceHooksRef.clearTransportModeExternalCursor();
}

export function renderTransportModeLayer() {
    renderTransportMode();
}
