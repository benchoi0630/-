// 파일 역할: 바구니 물리 캔버스의 클릭/드래그 포인터 상호작용을 관리한다.
// 핵심 책임: 바디 hit test, 드래그 이동, 탭 선택(onSelectItem) 판별을 담당한다.
// 연동 범위: basketPhysics/index 런타임에 attach/detach되어 warehouse/stack 상세 모두에서 재사용된다.

import { clamp, getNowMs } from "./utils.js";

const WORLD_PADDING = 8;
const TAP_MAX_DURATION_MS = 280;
const TAP_MAX_MOVEMENT_SQ = 36;
const VELOCITY_FRAME_MS = 1000 / 60;
const DRAG_VELOCITY_BLEND = 0.35;

function getCanvasPoint(runtime, event) {
    if (!runtime?.canvas || !event) {
        return null;
    }

    const rect = runtime.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    return {
        x: (event.clientX - rect.left) * (runtime.width / rect.width),
        y: (event.clientY - rect.top) * (runtime.height / rect.height)
    };
}

function pickBodyAtPoint(runtime, x, y) {
    if (!runtime || !Array.isArray(runtime.bodies)) {
        return null;
    }

    for (let i = runtime.bodies.length - 1; i >= 0; i -= 1) {
        const body = runtime.bodies[i];
        const dx = x - body.x;
        const dy = y - body.y;
        if ((dx * dx) + (dy * dy) <= body.radius * body.radius) {
            return body;
        }
    }

    return null;
}

function moveBodyToTop(runtime, body) {
    if (!runtime || !body) {
        return;
    }

    const index = runtime.bodies.indexOf(body);
    if (index < 0 || index === runtime.bodies.length - 1) {
        return;
    }

    runtime.bodies.splice(index, 1);
    runtime.bodies.push(body);
}

function clearDragState(dragState) {
    if (!dragState) {
        return;
    }

    if (dragState.body && typeof dragState.body === "object") {
        dragState.body.isPointerDragging = false;
    }

    dragState.pointerId = null;
    dragState.body = null;
    dragState.offsetX = 0;
    dragState.offsetY = 0;
    dragState.downX = 0;
    dragState.downY = 0;
    dragState.lastBodyX = 0;
    dragState.lastBodyY = 0;
    dragState.downTimeMs = 0;
    dragState.lastTimeMs = 0;
    dragState.moved = false;
}

function invokePointerHook(runtime, hookName, payload) {
    const pointerHooks = runtime?.pointerHooks;
    if (!pointerHooks || typeof pointerHooks !== "object") {
        return undefined;
    }

    const hook = pointerHooks[hookName];
    if (typeof hook !== "function") {
        return undefined;
    }

    try {
        return hook(payload);
    } catch {
        return undefined;
    }
}

export function createBasketPointerInteraction(runtime) {
    const dragState = {
        pointerId: null,
        body: null,
        offsetX: 0,
        offsetY: 0,
        downX: 0,
        downY: 0,
        lastBodyX: 0,
        lastBodyY: 0,
        downTimeMs: 0,
        lastTimeMs: 0,
        moved: false
    };
    let isAttached = false;

    function isActivePointer(event) {
        return dragState.pointerId !== null && event?.pointerId === dragState.pointerId;
    }

    function isActiveBodyValid() {
        return Boolean(
            dragState.body
            && Array.isArray(runtime?.bodies)
            && runtime.bodies.includes(dragState.body)
        );
    }

    function updateDraggedBodyFromEvent(event) {
        if (!isActivePointer(event) || !isActiveBodyValid()) {
            return false;
        }

        const point = getCanvasPoint(runtime, event);
        if (!point) {
            return false;
        }

        const body = dragState.body;
        const targetX = clamp(
            point.x - dragState.offsetX,
            WORLD_PADDING + body.radius,
            runtime.width - WORLD_PADDING - body.radius
        );
        const targetY = clamp(
            point.y - dragState.offsetY,
            WORLD_PADDING + body.radius,
            runtime.height - WORLD_PADDING - body.radius
        );

        const nowMs = Number.isFinite(event.timeStamp) ? event.timeStamp : getNowMs();
        const dtMs = Math.max(1, nowMs - dragState.lastTimeMs);
        const pointerVx = ((targetX - dragState.lastBodyX) / dtMs) * VELOCITY_FRAME_MS;
        const pointerVy = ((targetY - dragState.lastBodyY) / dtMs) * VELOCITY_FRAME_MS;

        body.x = targetX;
        body.y = targetY;
        body.vx = (body.vx * (1 - DRAG_VELOCITY_BLEND)) + (pointerVx * DRAG_VELOCITY_BLEND);
        body.vy = (body.vy * (1 - DRAG_VELOCITY_BLEND)) + (pointerVy * DRAG_VELOCITY_BLEND);
        body.angularVelocity *= 0.72;

        dragState.lastBodyX = targetX;
        dragState.lastBodyY = targetY;
        dragState.lastTimeMs = nowMs;

        const dragDx = point.x - dragState.downX;
        const dragDy = point.y - dragState.downY;
        if ((dragDx * dragDx) + (dragDy * dragDy) > TAP_MAX_MOVEMENT_SQ) {
            dragState.moved = true;
        }

        return true;
    }

    function finishActivePointer(event, shouldTriggerSelect, isCanceled = false) {
        if (!isActivePointer(event)) {
            return;
        }

        const hadBody = isActiveBodyValid();
        const itemId = hadBody ? dragState.body.itemId : null;
        const elapsedMs = Math.max(0, getNowMs() - dragState.downTimeMs);
        const point = getCanvasPoint(runtime, event);
        const pointX = point ? point.x : dragState.lastBodyX;
        const pointY = point ? point.y : dragState.lastBodyY;
        const dragBody = hadBody ? dragState.body : null;
        const pointerPayload = {
            runtime,
            body: dragBody,
            itemId,
            pointerId: event.pointerId,
            moved: dragState.moved === true,
            canceled: isCanceled === true,
            pointX,
            pointY,
            clientX: Number.isFinite(event.clientX) ? event.clientX : null,
            clientY: Number.isFinite(event.clientY) ? event.clientY : null
        };
        const shouldSelect = Boolean(
            shouldTriggerSelect
            && hadBody
            && !dragState.moved
            && elapsedMs <= TAP_MAX_DURATION_MS
            && typeof itemId === "string"
            && itemId.length > 0
        );
        const hookTapResult = shouldSelect ? invokePointerHook(runtime, "onTap", pointerPayload) : undefined;
        const shouldSkipSelect = hookTapResult === true;

        invokePointerHook(runtime, "onDragEnd", pointerPayload);

        if (runtime?.canvas && typeof runtime.canvas.releasePointerCapture === "function") {
            try {
                runtime.canvas.releasePointerCapture(event.pointerId);
            } catch {
                // pointer capture가 이미 해제된 경우를 무시한다.
            }
        }

        clearDragState(dragState);

        if (shouldSelect && !shouldSkipSelect && typeof runtime?.onSelectItem === "function") {
            runtime.onSelectItem(itemId);
        }
    }

    function handlePointerDown(event) {
        if (dragState.pointerId !== null) {
            return;
        }

        const point = getCanvasPoint(runtime, event);
        if (!point) {
            return;
        }

        const body = pickBodyAtPoint(runtime, point.x, point.y);
        if (!body) {
            return;
        }

        moveBodyToTop(runtime, body);

        const nowMs = Number.isFinite(event.timeStamp) ? event.timeStamp : getNowMs();
        dragState.pointerId = event.pointerId;
        dragState.body = body;
        dragState.offsetX = point.x - body.x;
        dragState.offsetY = point.y - body.y;
        dragState.downX = point.x;
        dragState.downY = point.y;
        dragState.lastBodyX = body.x;
        dragState.lastBodyY = body.y;
        dragState.downTimeMs = nowMs;
        dragState.lastTimeMs = nowMs;
        dragState.moved = false;
        body.isPointerDragging = true;
        body.vx = 0;
        body.vy = 0;

        invokePointerHook(runtime, "onDragStart", {
            runtime,
            body,
            itemId: body.itemId,
            pointerId: event.pointerId,
            moved: false,
            canceled: false,
            pointX: point.x,
            pointY: point.y,
            clientX: Number.isFinite(event.clientX) ? event.clientX : null,
            clientY: Number.isFinite(event.clientY) ? event.clientY : null
        });

        if (runtime?.canvas && typeof runtime.canvas.setPointerCapture === "function") {
            try {
                runtime.canvas.setPointerCapture(event.pointerId);
            } catch {
                // 일부 브라우저는 조건 불충족 시 throw한다.
            }
        }

        if (event.cancelable) {
            event.preventDefault();
        }
    }

    function handlePointerMove(event) {
        if (!isActivePointer(event)) {
            return;
        }

        const moved = updateDraggedBodyFromEvent(event);
        if (!moved) {
            finishActivePointer(event, false, true);
            return;
        }

        invokePointerHook(runtime, "onDragMove", {
            runtime,
            body: dragState.body,
            itemId: dragState.body?.itemId || null,
            pointerId: event.pointerId,
            moved: dragState.moved === true,
            canceled: false,
            pointX: dragState.lastBodyX,
            pointY: dragState.lastBodyY,
            clientX: Number.isFinite(event.clientX) ? event.clientX : null,
            clientY: Number.isFinite(event.clientY) ? event.clientY : null
        });

        if (event.cancelable) {
            event.preventDefault();
        }
    }

    function handlePointerUp(event) {
        if (!isActivePointer(event)) {
            return;
        }

        updateDraggedBodyFromEvent(event);
        finishActivePointer(event, true);

        if (event.cancelable) {
            event.preventDefault();
        }
    }

    function handlePointerCancel(event) {
        if (!isActivePointer(event)) {
            return;
        }

        finishActivePointer(event, false, true);
    }

    function attach() {
        if (isAttached || !runtime?.canvas) {
            return;
        }

        runtime.canvas.style.touchAction = "none";
        runtime.canvas.addEventListener("pointerdown", handlePointerDown);
        runtime.canvas.addEventListener("pointermove", handlePointerMove);
        runtime.canvas.addEventListener("pointerup", handlePointerUp);
        runtime.canvas.addEventListener("pointercancel", handlePointerCancel);
        runtime.canvas.addEventListener("lostpointercapture", handlePointerCancel);
        isAttached = true;
    }

    function detach() {
        if (!isAttached || !runtime?.canvas) {
            return;
        }

        runtime.canvas.removeEventListener("pointerdown", handlePointerDown);
        runtime.canvas.removeEventListener("pointermove", handlePointerMove);
        runtime.canvas.removeEventListener("pointerup", handlePointerUp);
        runtime.canvas.removeEventListener("pointercancel", handlePointerCancel);
        runtime.canvas.removeEventListener("lostpointercapture", handlePointerCancel);
        clearDragState(dragState);
        isAttached = false;
    }

    return {
        attach,
        detach
    };
}
