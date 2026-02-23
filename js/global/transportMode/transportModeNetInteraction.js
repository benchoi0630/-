// 파일 역할: 뜰채 레이어 커서와 포집 상호작용 로직을 전담한다.
// 핵심 책임: 드래그/스윕 세션, 뜰채 좌표, 충돌 포집, 뜰채 추종 이동을 관리한다.
// 연동 범위: transportMode index가 호출해 창고 메인/스택/no_stack 모두에 공통 적용한다.

import { pullBasketItemsTowardClientPoint } from "../../modules/basketPhysics/index.js";
import { captureItemsIntoPending } from "./transportModeTransfer.js";
import {
    clearTransportModeNetCursor,
    isTransportModeEnabled,
    setTransportModeNetCursor
} from "./transportModeState.js";
import { getTransportModeElements } from "./transportModeView.js";

export const TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN = "warehouse-main-basket";
export const TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK = "warehouse-stack-basket";
export const TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST = "warehouse-no-stack-list";

export const TAP_COMMIT_DELAY_MS = 130;
export const DRAG_COMMIT_DELAY_MS = 180;

const NET_CAPTURE_RADIUS = 56;
const NET_PULL_STRENGTH = 0.34;

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

export function isSupportedTransportSourceKind(sourceKind) {
    return sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN
        || sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
        || sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST;
}

function isTransportInteractionAllowed(sourceKind) {
    return isTransportModeEnabled() && isSupportedTransportSourceKind(sourceKind);
}

function resetDragSession() {
    activeDragSession.pointerId = null;
    activeDragSession.sourceKind = "";
    activeDragSession.capturedItemIds = new Set();
}

function resetExternalSweepSession() {
    activeExternalSweepSession.pointerId = null;
    activeExternalSweepSession.sourceKind = "";
    activeExternalSweepSession.capturedItemIds = new Set();
}

function setNetCursorFromClientPoint(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return false;
    }

    setTransportModeNetCursor({
        visible: true,
        clientX,
        clientY
    });
    return true;
}

function collectCollisionItemIds(runtime, pointerX, pointerY, includeDraggingBody, capturedSet) {
    if (!runtime || !Array.isArray(runtime.bodies) || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
        return [];
    }

    const collisionItemIds = [];
    for (let i = 0; i < runtime.bodies.length; i += 1) {
        const body = runtime.bodies[i];
        if (!body || typeof body.itemId !== "string" || body.itemId.length <= 0) {
            continue;
        }

        if (!includeDraggingBody && body.isPointerDragging === true) {
            continue;
        }

        if (capturedSet.has(body.itemId)) {
            continue;
        }

        const dx = body.x - pointerX;
        const dy = body.y - pointerY;
        const captureRadius = NET_CAPTURE_RADIUS + body.radius;
        if ((dx * dx) + (dy * dy) > captureRadius * captureRadius) {
            continue;
        }

        collisionItemIds.push(body.itemId);
    }

    return collisionItemIds;
}

function pullPendingItemsTowardNet(itemIds, clientX, clientY) {
    if (!Array.isArray(itemIds) || itemIds.length <= 0) {
        return;
    }

    const netCanvas = getTransportModeElements().netCanvas;
    if (!(netCanvas instanceof HTMLCanvasElement)) {
        return;
    }

    pullBasketItemsTowardClientPoint({
        canvas: netCanvas,
        itemIds,
        clientX,
        clientY,
        pullStrength: NET_PULL_STRENGTH
    });
}

export function resetTransportNetInteraction() {
    clearTransportModeNetCursor();
    resetDragSession();
    resetExternalSweepSession();
}

export function startTransportSourceDrag(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    if (!isTransportInteractionAllowed(sourceKind) || !Number.isFinite(pointerId)) {
        return false;
    }

    activeDragSession.pointerId = pointerId;
    activeDragSession.sourceKind = sourceKind;
    activeDragSession.capturedItemIds = new Set();
    return true;
}

export function stepTransportSourceDrag(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    const payload = options?.payload && typeof options.payload === "object" ? options.payload : {};
    const includeDraggingBody = options?.includeDraggingBody === true;

    const isActiveSession = Number.isFinite(pointerId)
        && activeDragSession.pointerId === pointerId
        && activeDragSession.sourceKind === sourceKind;

    if (!isActiveSession || !isTransportInteractionAllowed(sourceKind)) {
        return {
            newlyCapturedItemIds: [],
            capturedItemIds: []
        };
    }

    setNetCursorFromClientPoint(payload.clientX, payload.clientY);

    const collisionItemIds = collectCollisionItemIds(
        payload.runtime,
        payload.pointX,
        payload.pointY,
        includeDraggingBody,
        activeDragSession.capturedItemIds
    );

    const newlyCapturedItemIds = captureItemsIntoPending(collisionItemIds);
    for (let i = 0; i < newlyCapturedItemIds.length; i += 1) {
        activeDragSession.capturedItemIds.add(newlyCapturedItemIds[i]);
    }

    const capturedItemIds = [...activeDragSession.capturedItemIds];
    pullPendingItemsTowardNet(capturedItemIds, payload.clientX, payload.clientY);

    return {
        newlyCapturedItemIds,
        capturedItemIds
    };
}

export function endTransportSourceDrag(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    const isActiveSession = Number.isFinite(pointerId)
        && activeDragSession.pointerId === pointerId
        && activeDragSession.sourceKind === sourceKind;

    if (!isActiveSession) {
        return [];
    }

    const capturedItemIds = [...activeDragSession.capturedItemIds];
    clearTransportModeNetCursor();
    resetDragSession();
    return capturedItemIds;
}

export function handleTransportSourceTap(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const itemId = typeof options?.itemId === "string" ? options.itemId : "";
    if (!isTransportInteractionAllowed(sourceKind) || !itemId) {
        return [];
    }

    return captureItemsIntoPending([itemId]);
}

export function startTransportExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    if (!isTransportInteractionAllowed(sourceKind) || !Number.isFinite(pointerId)) {
        return false;
    }

    activeExternalSweepSession.pointerId = pointerId;
    activeExternalSweepSession.sourceKind = sourceKind;
    activeExternalSweepSession.capturedItemIds = new Set();
    setNetCursorFromClientPoint(options?.clientX, options?.clientY);
    return true;
}

export function moveTransportExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;
    const itemId = typeof options?.itemId === "string" ? options.itemId : "";

    const isActiveSession = Number.isFinite(pointerId)
        && activeExternalSweepSession.pointerId === pointerId
        && activeExternalSweepSession.sourceKind === sourceKind;

    if (!isActiveSession || !isTransportInteractionAllowed(sourceKind)) {
        return {
            newlyCapturedItemIds: [],
            capturedItemIds: []
        };
    }

    setNetCursorFromClientPoint(options?.clientX, options?.clientY);
    let newlyCapturedItemIds = [];
    if (itemId && !activeExternalSweepSession.capturedItemIds.has(itemId)) {
        newlyCapturedItemIds = captureItemsIntoPending([itemId]);
        for (let i = 0; i < newlyCapturedItemIds.length; i += 1) {
            activeExternalSweepSession.capturedItemIds.add(newlyCapturedItemIds[i]);
        }
    }

    const capturedItemIds = [...activeExternalSweepSession.capturedItemIds];
    pullPendingItemsTowardNet(capturedItemIds, options?.clientX, options?.clientY);
    return {
        newlyCapturedItemIds,
        capturedItemIds
    };
}

export function endTransportExternalSweep(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    const pointerId = options?.pointerId;

    const isActiveSession = Number.isFinite(pointerId)
        && activeExternalSweepSession.pointerId === pointerId
        && activeExternalSweepSession.sourceKind === sourceKind;

    if (!isActiveSession) {
        return [];
    }

    const capturedItemIds = [...activeExternalSweepSession.capturedItemIds];
    clearTransportModeNetCursor();
    resetExternalSweepSession();
    return capturedItemIds;
}

export function updateTransportModeExternalCursor(options = {}) {
    const sourceKind = typeof options?.sourceKind === "string" ? options.sourceKind : "";
    if (!isTransportInteractionAllowed(sourceKind)) {
        return false;
    }

    return setNetCursorFromClientPoint(options?.clientX, options?.clientY);
}

export function clearTransportModeExternalCursor() {
    clearTransportModeNetCursor();
    resetExternalSweepSession();
}
