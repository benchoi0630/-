// 파일 역할: 뜰채 레이어 커서와 포집 상호작용 로직을 전담한다.
// 핵심 책임: 드래그/스윕 세션, 뜰채 좌표, 충돌 포집, 뜰채 추종 이동을 관리한다.
// 연동 범위: transportMode controller/source hooks가 호출해 창고 메인/스택/no_stack 모두에 공통 적용한다.

import { getBasketItemIdsNearClientPoint, pullBasketItemsTowardClientPoint } from "../../../modules/basketPhysics/index.js";
import { captureItemsIntoPending } from "../transportModeTransfer.js";
import {
    clearTransportModeNetCursor,
    isTransportModeEnabled,
    setTransportModeNetCursor
} from "../transportModeState.js";
import { getTransportModeElements } from "../transportModeView.js";
import {
    clearTransportNetDropStack,
    playTransportNetAbsorbAnimation,
    pulseTransportNetStackVisual
} from "./visualiseStackedMarimo.js";

export const TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN = "warehouse-main-basket";
export const TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK = "warehouse-stack-basket";
export const TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST = "warehouse-no-stack-list";

export const TAP_COMMIT_DELAY_MS = 130;
export const DRAG_COMMIT_DELAY_MS = 180;

const NET_CAPTURE_RADIUS = 56;
const NET_PULL_STRENGTH = 0.34;
const TRANSPORT_SWEEP_SOURCE_CANVAS_SELECTOR = ".warehouse-physics-canvas, .stack-detail-canvas";

const activeDragSession = {
    pointerId: null,
    sourceKind: "",
    capturedItemIds: new Set(),
    dragBody: null,
    dragBodyAbsorbed: false
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
    activeDragSession.dragBody = null;
    activeDragSession.dragBodyAbsorbed = false;
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

function collectCollisionBodies(runtime, pointerX, pointerY, includeDraggingBody, capturedSet) {
    if (!runtime || !Array.isArray(runtime.bodies) || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
        return [];
    }

    const collisionBodies = [];
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

        collisionBodies.push(body);
    }

    return collisionBodies;
}

function getClientPointFromRuntimePoint(runtime, x, y) {
    if (!(runtime?.canvas instanceof HTMLCanvasElement) || !Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    const width = Number.isFinite(runtime.width) ? runtime.width : 0;
    const height = Number.isFinite(runtime.height) ? runtime.height : 0;
    if (width <= 0 || height <= 0) {
        return null;
    }

    const rect = runtime.canvas.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    return {
        clientX: rect.left + ((x / width) * rect.width),
        clientY: rect.top + ((y / height) * rect.height)
    };
}

function playAbsorbAnimations(runtime, newlyCapturedItemIds, collisionBodyById, targetClientX, targetClientY) {
    if (!Array.isArray(newlyCapturedItemIds) || newlyCapturedItemIds.length <= 0) {
        return;
    }

    if (!Number.isFinite(targetClientX) || !Number.isFinite(targetClientY)) {
        return;
    }

    const elements = getTransportModeElements();
    if (!(elements.layer instanceof HTMLElement)) {
        return;
    }

    let hasPlayedAbsorbAnimation = false;
    for (let i = 0; i < newlyCapturedItemIds.length; i += 1) {
        const capturedId = newlyCapturedItemIds[i];
        const body = collisionBodyById.get(capturedId);
        if (!body) {
            continue;
        }

        const startPoint = getClientPointFromRuntimePoint(runtime, body.x, body.y);
        if (!startPoint) {
            continue;
        }

        playTransportNetAbsorbAnimation({
            host: elements.layer,
            startClientX: startPoint.clientX,
            startClientY: startPoint.clientY,
            targetClientX,
            targetClientY
        });
        hasPlayedAbsorbAnimation = true;
    }

    if (hasPlayedAbsorbAnimation) {
        pulseTransportNetStackVisual(elements.netCursor);
    }
}

function absorbDragBodyIntoPending(payload, newlyCapturedItemIds, collisionBodyById) {
    if (activeDragSession.dragBodyAbsorbed === true) {
        return;
    }

    const dragBody = activeDragSession.dragBody;
    const dragItemId = typeof dragBody?.itemId === "string" ? dragBody.itemId : "";
    if (!dragItemId) {
        return;
    }

    // 다른 마리모를 첫 포집한 순간부터 시작 드래그 마리모도 stack으로 합쳐서 단일 stack UX로 전환한다.
    if (activeDragSession.capturedItemIds.size <= 0) {
        return;
    }

    if (activeDragSession.capturedItemIds.has(dragItemId)) {
        activeDragSession.dragBodyAbsorbed = true;
        return;
    }

    const absorbedItemIds = captureItemsIntoPending([dragItemId]);
    if (absorbedItemIds.length <= 0) {
        return;
    }

    activeDragSession.dragBodyAbsorbed = true;
    for (let i = 0; i < absorbedItemIds.length; i += 1) {
        const absorbedId = absorbedItemIds[i];
        activeDragSession.capturedItemIds.add(absorbedId);
        newlyCapturedItemIds.push(absorbedId);
    }

    if (!collisionBodyById.has(dragItemId)) {
        const fallbackBodyPoint = {
            itemId: dragItemId,
            x: Number.isFinite(payload?.pointX) ? payload.pointX : dragBody.x,
            y: Number.isFinite(payload?.pointY) ? payload.pointY : dragBody.y
        };
        collisionBodyById.set(dragItemId, fallbackBodyPoint);
    }
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

function resolveSweepCollisionItemIds(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || typeof document === "undefined") {
        return [];
    }

    const targetAtPoint = document.elementFromPoint(clientX, clientY);
    const sourceCanvas = targetAtPoint?.closest?.(TRANSPORT_SWEEP_SOURCE_CANVAS_SELECTOR);
    if (!(sourceCanvas instanceof HTMLCanvasElement)) {
        return [];
    }

    return getBasketItemIdsNearClientPoint({
        canvas: sourceCanvas,
        clientX,
        clientY,
        captureRadius: NET_CAPTURE_RADIUS,
        includeDraggingBody: false
    });
}

export function resetTransportNetInteraction() {
    clearTransportModeNetCursor();
    clearTransportNetDropStack();
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
    activeDragSession.dragBody = options?.body && typeof options.body === "object" ? options.body : null;
    activeDragSession.dragBodyAbsorbed = false;
    setNetCursorFromClientPoint(options?.clientX, options?.clientY);
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

    if (payload?.body && typeof payload.body === "object") {
        activeDragSession.dragBody = payload.body;
    }

    const collisionBodies = collectCollisionBodies(
        payload.runtime,
        payload.pointX,
        payload.pointY,
        includeDraggingBody,
        activeDragSession.capturedItemIds
    );
    const collisionItemIds = [];
    const collisionBodyById = new Map();
    for (let i = 0; i < collisionBodies.length; i += 1) {
        const body = collisionBodies[i];
        if (!body || typeof body.itemId !== "string" || body.itemId.length <= 0) {
            continue;
        }

        if (!collisionBodyById.has(body.itemId)) {
            collisionBodyById.set(body.itemId, body);
            collisionItemIds.push(body.itemId);
        }
    }

    const newlyCapturedItemIds = captureItemsIntoPending(collisionItemIds);
    for (let i = 0; i < newlyCapturedItemIds.length; i += 1) {
        activeDragSession.capturedItemIds.add(newlyCapturedItemIds[i]);
    }

    absorbDragBodyIntoPending(payload, newlyCapturedItemIds, collisionBodyById);

    const capturedItemIds = [...activeDragSession.capturedItemIds];
    pullPendingItemsTowardNet(capturedItemIds, payload.clientX, payload.clientY);

    if (capturedItemIds.length >= 2) {
        playAbsorbAnimations(
            payload.runtime,
            newlyCapturedItemIds,
            collisionBodyById,
            payload.clientX,
            payload.clientY
        );
    }

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
    const captureCandidateIds = [];
    if (itemId) {
        captureCandidateIds.push(itemId);
    } else if (sourceKind !== TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST) {
        const collisionItemIds = resolveSweepCollisionItemIds(options?.clientX, options?.clientY);
        for (let i = 0; i < collisionItemIds.length; i += 1) {
            captureCandidateIds.push(collisionItemIds[i]);
        }
    }

    const nextCaptureIds = [];
    for (let i = 0; i < captureCandidateIds.length; i += 1) {
        const captureId = captureCandidateIds[i];
        if (activeExternalSweepSession.capturedItemIds.has(captureId)) {
            continue;
        }
        nextCaptureIds.push(captureId);
    }

    const newlyCapturedItemIds = captureItemsIntoPending(nextCaptureIds);
    for (let i = 0; i < newlyCapturedItemIds.length; i += 1) {
        activeExternalSweepSession.capturedItemIds.add(newlyCapturedItemIds[i]);
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

export function clearTransportModeExternalCursor() {
    clearTransportModeNetCursor();
    resetExternalSweepSession();
}
