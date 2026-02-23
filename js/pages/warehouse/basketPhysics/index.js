// 파일 역할: 바구니 물리 모듈의 진입점으로 루프 시작/중지와 런타임 생명주기를 관리한다.
// 핵심 책임: 외부 API(start/stop/replace) 제공과 프레임 루프(크기 동기화→물리→렌더) 실행을 조율한다.
// 연동 범위: warehouse 목록 화면과 stack 상세 모달에서 공통으로 호출되는 오케스트레이션 계층이다.

import { createMarimoSpriteCache } from "../../../ui/marimoRender.js";
import { buildBasketRenderSubset, createBasketBodies, createBasketBody, reconcileBasketBodies } from "./bodies.js";
import { updateBasketPhysics } from "./physics.js";
import { drawBasket } from "./renderer.js";
import { clamp, getNowMs } from "./utils.js";
const WORLD_PADDING = 8;
const MIN_BODY_RADIUS = 12;
const MAX_BODY_RADIUS = 39;

let basketAnimationFrameId = null;
let basketRuntime = null;
const spriteCache = createMarimoSpriteCache();

export function startBasketAnimation(options) {
    const canvas = options?.canvas;
    const stackItems = Array.isArray(options?.stackItems) ? options.stackItems : [];
    const stackRepresentativeVolume = Number.isFinite(options?.stackRepresentativeVolume) ? options.stackRepresentativeVolume : 0;
    const onSelectItem = typeof options?.onSelectItem === "function" ? options.onSelectItem : () => {};

    if (!canvas) {
        stopBasketAnimation();
        return;
    }

    if (stackItems.length <= 0) {
        stopBasketAnimation({ canvas });
        return;
    }

    const physicsWidth = Number.isFinite(options?.physicsWidth) ? Math.max(120, options.physicsWidth) : Math.max(120, canvas.clientWidth || 360);
    const physicsHeight = Number.isFinite(options?.physicsHeight) ? Math.max(120, options.physicsHeight) : Math.max(120, canvas.clientHeight || 300);
    const pixelRatioRaw = Number.isFinite(options?.devicePixelRatio) ? options.devicePixelRatio : (window.devicePixelRatio || 1);
    const pixelRatio = Math.max(1, Math.min(3, pixelRatioRaw));

    if (basketRuntime && basketRuntime.canvas === canvas) {
        reconcileBasketRuntime(basketRuntime, {
            stackItems,
            stackRepresentativeVolume,
            onSelectItem,
            width: physicsWidth,
            height: physicsHeight,
            pixelRatio
        });
        ensureBasketAnimationLoop();
        return;
    }

    stopBasketAnimation();

    const runtime = createBasketRuntime({
        canvas,
        stackItems,
        stackRepresentativeVolume,
        onSelectItem,
        width: physicsWidth,
        height: physicsHeight,
        pixelRatio
    });

    if (!runtime) {
        return;
    }

    basketRuntime = runtime;
    canvas.addEventListener("click", runtime.onCanvasClick);
    ensureBasketAnimationLoop();
}

export function stopBasketAnimation(options = {}) {
    const targetCanvas = options?.canvas || null;
    if (targetCanvas && basketRuntime?.canvas && basketRuntime.canvas !== targetCanvas) {
        return;
    }

    if (basketAnimationFrameId) {
        cancelAnimationFrame(basketAnimationFrameId);
        basketAnimationFrameId = null;
    }

    if (basketRuntime?.canvas && basketRuntime?.onCanvasClick) {
        basketRuntime.canvas.removeEventListener("click", basketRuntime.onCanvasClick);
    }

    basketRuntime = null;
}

export function replaceBasketItem(options = {}) {
    if (!basketRuntime || !Array.isArray(basketRuntime.bodies) || basketRuntime.bodies.length <= 0) {
        return false;
    }

    const targetItemId = typeof options?.targetItemId === "string" ? options.targetItemId : "";
    if (!targetItemId) {
        return false;
    }

    const hasCanvasCtor = typeof HTMLCanvasElement !== "undefined";
    const targetCanvas = hasCanvasCtor && options?.canvas instanceof HTMLCanvasElement ? options.canvas : null;
    if (targetCanvas && basketRuntime.canvas !== targetCanvas) {
        return false;
    }

    const bodyIndex = basketRuntime.bodies.findIndex((body) => body.itemId === targetItemId);
    if (bodyIndex < 0) {
        return false;
    }

    const targetBody = basketRuntime.bodies[bodyIndex];
    const replacementItem = options?.replacementItem && typeof options.replacementItem === "object" ? options.replacementItem : null;

    if (!replacementItem) {
        basketRuntime.bodies.splice(bodyIndex, 1);
        return true;
    }

    const replacementBody = createBasketBody(replacementItem, basketRuntime.width, basketRuntime.height, bodyIndex);
    replacementBody.x = targetBody.x;
    replacementBody.y = targetBody.y;
    replacementBody.vx = targetBody.vx;
    replacementBody.vy = targetBody.vy - 0.28;
    replacementBody.angle = targetBody.angle;
    replacementBody.angularVelocity = targetBody.angularVelocity;

    basketRuntime.bodies[bodyIndex] = replacementBody;
    return true;
}

function ensureBasketAnimationLoop() {
    if (basketAnimationFrameId !== null) {
        return;
    }

    basketAnimationFrameId = requestAnimationFrame(tickBasketAnimationFrame);
}

function tickBasketAnimationFrame() {
    basketAnimationFrameId = null;

    if (!basketRuntime) {
        return;
    }

    syncRuntimeToDisplayedCanvasSize(basketRuntime);
    updateBasketPhysics(basketRuntime);
    drawBasket(basketRuntime, spriteCache);

    ensureBasketAnimationLoop();
}

function createBasketRuntime(options) {
    const canvas = options.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return null;
    }

    const runtime = {
        canvas,
        ctx,
        width: 0,
        height: 0,
        pixelRatio: 1,
        bodies: [],
        faceClockStartMs: getNowMs(),
        onSelectItem: typeof options.onSelectItem === "function" ? options.onSelectItem : () => {},
        onCanvasClick: null
    };

    updateRuntimeCanvasMetrics(runtime, options.width, options.height, options.pixelRatio);

    const renderSubset = buildBasketRenderSubset(options.stackItems, options.stackRepresentativeVolume);
    runtime.bodies = createBasketBodies(renderSubset, runtime.width, runtime.height);
    runtime.onCanvasClick = (event) => {
        handleBasketCanvasClick(runtime, event);
    };

    return runtime;
}

function reconcileBasketRuntime(runtime, options) {
    runtime.onSelectItem = typeof options.onSelectItem === "function" ? options.onSelectItem : () => {};
    updateRuntimeCanvasMetrics(runtime, options.width, options.height, options.pixelRatio);
    const renderSubset = buildBasketRenderSubset(options.stackItems, options.stackRepresentativeVolume);
    reconcileBasketBodies(runtime, renderSubset);
}

function handleBasketCanvasClick(runtime, event) {
    if (!basketRuntime || basketRuntime !== runtime) {
        return;
    }

    const rect = runtime.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return;
    }

    const x = (event.clientX - rect.left) * (runtime.width / rect.width);
    const y = (event.clientY - rect.top) * (runtime.height / rect.height);

    for (let i = runtime.bodies.length - 1; i >= 0; i -= 1) {
        const body = runtime.bodies[i];
        const dx = x - body.x;
        const dy = y - body.y;
        if (dx * dx + dy * dy <= body.radius * body.radius) {
            runtime.onSelectItem(body.itemId);
            return;
        }
    }
}

function readDisplayedCanvasSize(canvas, fallbackWidth, fallbackHeight) {
    const rect = canvas.getBoundingClientRect();
    const widthFromRect = Number.isFinite(rect.width) ? rect.width : 0;
    const heightFromRect = Number.isFinite(rect.height) ? rect.height : 0;
    const width = widthFromRect > 0 ? widthFromRect : (canvas.clientWidth || fallbackWidth || 360);
    const height = heightFromRect > 0 ? heightFromRect : (canvas.clientHeight || fallbackHeight || 300);

    return {
        width: Math.max(120, Math.round(width)),
        height: Math.max(120, Math.round(height))
    };
}

function updateRuntimeCanvasMetrics(runtime, rawWidth, rawHeight, rawPixelRatio) {
    const width = Math.max(120, Math.round(Number.isFinite(rawWidth) ? rawWidth : 360));
    const height = Math.max(120, Math.round(Number.isFinite(rawHeight) ? rawHeight : 300));
    const pixelRatio = Math.max(1, Math.min(3, Number.isFinite(rawPixelRatio) ? rawPixelRatio : 1));
    const didResize = runtime.width !== width || runtime.height !== height || runtime.pixelRatio !== pixelRatio;

    if (!didResize) {
        return;
    }

    const previousWidth = runtime.width;
    const previousHeight = runtime.height;

    runtime.width = width;
    runtime.height = height;
    runtime.pixelRatio = pixelRatio;
    runtime.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    runtime.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    runtime.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (previousWidth <= 0 || previousHeight <= 0 || runtime.bodies.length <= 0) {
        return;
    }

    const scaleX = width / previousWidth;
    const scaleY = height / previousHeight;

    for (let i = 0; i < runtime.bodies.length; i += 1) {
        const body = runtime.bodies[i];
        body.x *= scaleX;
        body.y *= scaleY;
        body.radius = clamp(body.radius, MIN_BODY_RADIUS, MAX_BODY_RADIUS);
        body.x = clamp(body.x, WORLD_PADDING + body.radius, width - WORLD_PADDING - body.radius);
        body.y = clamp(body.y, WORLD_PADDING + body.radius, height - WORLD_PADDING - body.radius);
    }
}

function syncRuntimeToDisplayedCanvasSize(runtime) {
    const displaySize = readDisplayedCanvasSize(runtime.canvas, runtime.width, runtime.height);
    const widthDiff = Math.abs(displaySize.width - runtime.width);
    const heightDiff = Math.abs(displaySize.height - runtime.height);

    if (widthDiff < 1 && heightDiff < 1) {
        return;
    }

    updateRuntimeCanvasMetrics(runtime, displaySize.width, displaySize.height, runtime.pixelRatio);
}
