// 파일 역할: 운송모드 전역 컨트롤러 오케스트레이션을 담당한다.
// 핵심 책임: 모드 on/off, 이벤트 바인딩, drag/tap 포집 흐름을 조합해 실행한다.
// 연동 범위: global controller 및 warehouse/stack detail이 단일 API로 호출한다.

import { pullBasketItemsTowardClientPoint } from "../../modules/basketPhysics/index.js";
import { bindEventOnce } from "../../utils/domEvents.js";
import {
    DRAG_COMMIT_DELAY_MS,
    isSupportedTransportSourceKind,
    NET_CAPTURE_RADIUS,
    NET_PULL_STRENGTH,
    TAP_COMMIT_DELAY_MS,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK,
    TRANSPORT_WAREHOUSE_CHANGED_EVENT
} from "./transportModeConstants.js";
import { clearAllPendingCommitTimers, schedulePendingCommit } from "./transportModeCommitQueue.js";
import { renderTransportMode } from "./transportModeRender.js";
import {
    captureItemsIntoPending,
    restoreTransportItemsToWarehouse,
    syncSourceItemsFromWarehouse
} from "./transportModeTransfer.js";
import {
    clearTransportModeItems,
    clearTransportModeNetCursor,
    isTransportModeEnabled,
    setTransportModeCollapsed,
    setTransportModeEnabled,
    setTransportModeNetCursor,
    setTransportModePendingItems,
    setTransportModeSourceItems,
    setTransportModeTransportItems
} from "./transportModeState.js";
import { ensureTransportModeLayer, getTransportModeElements } from "./transportModeView.js";

let isInitialized = false;
let renderWarehousePageRef = () => {};
const activeDragSession = {
    pointerId: null,
    sourceKind: "",
    capturedItemIds: new Set()
};
const activeExternalSweepSession = {
    pointerId: null,
    sourceKind: "",
    capturedItemIds: new Set()
};

function rerenderWarehousePage() {
    if (typeof renderWarehousePageRef === "function") {
        renderWarehousePageRef();
    }
}

function notifyTransportWarehouseChanged() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return;
    }

    if (typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent(TRANSPORT_WAREHOUSE_CHANGED_EVENT));
        return;
    }

    window.dispatchEvent(new Event(TRANSPORT_WAREHOUSE_CHANGED_EVENT));
}

function resetActiveDragSession() {
    activeDragSession.pointerId = null;
    activeDragSession.sourceKind = "";
    activeDragSession.capturedItemIds = new Set();
}

function resetActiveExternalSweepSession() {
    activeExternalSweepSession.pointerId = null;
    activeExternalSweepSession.sourceKind = "";
    activeExternalSweepSession.capturedItemIds = new Set();
}

function hideNetCursor() {
    clearTransportModeNetCursor();
}

function isTransportInteractionAllowed(sourceKind) {
    return isTransportModeEnabled() && isSupportedTransportSourceKind(sourceKind);
}

function updateNetCursorFromPayload(payload) {
    if (!Number.isFinite(payload?.clientX) || !Number.isFinite(payload?.clientY)) {
        return;
    }

    setTransportModeNetCursor({
        visible: true,
        clientX: payload.clientX,
        clientY: payload.clientY
    });
}

function collectNetCollisionItemIds(payload, includeDraggingBody) {
    const runtime = payload?.runtime;
    const pointerX = payload?.pointX;
    const pointerY = payload?.pointY;
    if (!runtime || !Array.isArray(runtime.bodies) || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
        return [];
    }

    const candidateItemIds = [];
    for (let i = 0; i < runtime.bodies.length; i += 1) {
        const body = runtime.bodies[i];
        if (!body || typeof body.itemId !== "string" || body.itemId.length <= 0) {
            continue;
        }

        if (!includeDraggingBody && body.isPointerDragging === true) {
            continue;
        }

        if (activeDragSession.capturedItemIds.has(body.itemId)) {
            continue;
        }

        const dx = body.x - pointerX;
        const dy = body.y - pointerY;
        const captureRadius = NET_CAPTURE_RADIUS + body.radius;
        if ((dx * dx) + (dy * dy) > captureRadius * captureRadius) {
            continue;
        }

        candidateItemIds.push(body.itemId);
    }

    return candidateItemIds;
}

function captureDragNetCollisions(payload, includeDraggingBody) {
    const collisionIds = collectNetCollisionItemIds(payload, includeDraggingBody);
    if (collisionIds.length <= 0) {
        return [];
    }

    const capturedIds = captureItemsIntoPending(collisionIds);
    for (let i = 0; i < capturedIds.length; i += 1) {
        activeDragSession.capturedItemIds.add(capturedIds[i]);
    }

    if (capturedIds.length > 0) {
        renderTransportMode();
    }

    return capturedIds;
}

function pullPendingItemsTowardNetByItemIds(sessionItemIds, payload) {
    if (!Array.isArray(sessionItemIds) || sessionItemIds.length <= 0) {
        return;
    }

    const netCanvas = getTransportModeElements().netCanvas;
    if (!(netCanvas instanceof HTMLCanvasElement)) {
        return;
    }

    pullBasketItemsTowardClientPoint({
        canvas: netCanvas,
        itemIds: sessionItemIds,
        clientX: payload?.clientX,
        clientY: payload?.clientY,
        pullStrength: NET_PULL_STRENGTH
    });
}

function pullPendingItemsTowardNet(payload) {
    pullPendingItemsTowardNetByItemIds([...activeDragSession.capturedItemIds], payload);
}

function handleTransportModeToggleClick() {
    toggleTransportMode();
}

function bindTransportModeEvents() {
    const elements = ensureTransportModeLayer();

    bindEventOnce(elements.toggleBtn, "click", "listenerTransportModeToggleBound", handleTransportModeToggleClick);

    window.addEventListener("resize", () => {
        if (!isInitialized) {
            return;
        }

        renderTransportMode();
    });
}

function disableTransportMode(restoreWarehouse) {
    clearAllPendingCommitTimers();
    hideNetCursor();
    resetActiveDragSession();
    resetActiveExternalSweepSession();

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
    hideNetCursor();
    resetActiveDragSession();
    resetActiveExternalSweepSession();
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

export function buildTransportModeSourcePointerHooks(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";

    return {
        onDragStart: (payload) => {
            if (!isTransportInteractionAllowed(sourceKind)) {
                return;
            }

            activeDragSession.pointerId = payload?.pointerId;
            activeDragSession.sourceKind = sourceKind;
            activeDragSession.capturedItemIds = new Set();
        },
        onDragMove: (payload) => {
            if (!isTransportInteractionAllowed(sourceKind)) {
                return;
            }

            if (activeDragSession.pointerId !== payload?.pointerId || activeDragSession.sourceKind !== sourceKind) {
                return;
            }

            if (payload?.moved !== true) {
                return;
            }

            updateNetCursorFromPayload(payload);
            captureDragNetCollisions(payload, false);
            pullPendingItemsTowardNet(payload);
        },
        onDragEnd: (payload) => {
            const isActiveSession = activeDragSession.pointerId === payload?.pointerId && activeDragSession.sourceKind === sourceKind;
            if (!isActiveSession) {
                return;
            }

            if (isTransportInteractionAllowed(sourceKind) && payload?.moved === true) {
                updateNetCursorFromPayload(payload);
                captureDragNetCollisions(payload, true);
                pullPendingItemsTowardNet(payload);

                const capturedIds = [...activeDragSession.capturedItemIds];
                if (capturedIds.length > 0) {
                    notifyTransportWarehouseChanged();
                    schedulePendingCommit(capturedIds, DRAG_COMMIT_DELAY_MS, () => {
                        renderTransportMode();
                    });
                    rerenderWarehousePage();
                }
            }

            hideNetCursor();
            resetActiveDragSession();
            renderTransportMode();
        }
    };
}

export function handleTransportModeSourceTap(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const itemId = typeof options?.itemId === "string" ? options.itemId : "";

    if (!isTransportInteractionAllowed(sourceKind) || !itemId) {
        return false;
    }

    const capturedIds = captureItemsIntoPending([itemId]);
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

export function updateTransportModeExternalCursor(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    if (!isTransportInteractionAllowed(sourceKind)) {
        return false;
    }

    const clientX = options?.clientX;
    const clientY = options?.clientY;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return false;
    }

    setTransportModeNetCursor({
        visible: true,
        clientX,
        clientY
    });
    renderTransportMode();
    return true;
}

export function clearTransportModeExternalCursor() {
    hideNetCursor();
    resetActiveExternalSweepSession();
    renderTransportMode();
}

export function startTransportModeExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    if (!isTransportInteractionAllowed(sourceKind) || !Number.isFinite(pointerId)) {
        return false;
    }

    activeExternalSweepSession.pointerId = pointerId;
    activeExternalSweepSession.sourceKind = sourceKind;
    activeExternalSweepSession.capturedItemIds = new Set();
    updateNetCursorFromPayload(options);
    renderTransportMode();
    return true;
}

export function moveTransportModeExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    const itemId = typeof options?.itemId === "string" ? options.itemId : "";

    const isActiveSession = Number.isFinite(pointerId)
        && activeExternalSweepSession.pointerId === pointerId
        && activeExternalSweepSession.sourceKind === sourceKind;

    if (!isActiveSession || !isTransportInteractionAllowed(sourceKind)) {
        return [];
    }

    updateNetCursorFromPayload(options);
    let newlyCapturedItemIds = [];

    if (itemId && !activeExternalSweepSession.capturedItemIds.has(itemId)) {
        const capturedIds = captureItemsIntoPending([itemId]);
        for (let i = 0; i < capturedIds.length; i += 1) {
            activeExternalSweepSession.capturedItemIds.add(capturedIds[i]);
        }
        newlyCapturedItemIds = capturedIds;
        if (capturedIds.length > 0) {
            notifyTransportWarehouseChanged();
        }
    }

    pullPendingItemsTowardNetByItemIds([...activeExternalSweepSession.capturedItemIds], options);
    renderTransportMode();
    return newlyCapturedItemIds;
}

export function endTransportModeExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;

    const isActiveSession = Number.isFinite(pointerId)
        && activeExternalSweepSession.pointerId === pointerId
        && activeExternalSweepSession.sourceKind === sourceKind;

    if (!isActiveSession) {
        return false;
    }

    const capturedIds = [...activeExternalSweepSession.capturedItemIds];
    if (capturedIds.length > 0) {
        schedulePendingCommit(capturedIds, DRAG_COMMIT_DELAY_MS, () => {
            renderTransportMode();
        });

        if (sourceKind !== TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST) {
            rerenderWarehousePage();
        }
    }

    hideNetCursor();
    resetActiveExternalSweepSession();
    renderTransportMode();
    return capturedIds.length > 0;
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
    isTransportModeEnabled
};
