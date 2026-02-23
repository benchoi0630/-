// 파일 역할: 바구니 물리 모듈의 공용 진입점으로 루프 시작/중지와 런타임 생명주기를 관리한다.
// 핵심 책임: 외부 API(start/stop/replace) 제공과 프레임 루프(크기 동기화→물리→렌더) 실행을 조율한다.
// 연동 범위: warehouse/stack/transport 등 페이지별 캔버스가 공통으로 재사용하는 오케스트레이션 계층이다.

import { createMarimoSpriteCache } from "../../ui/marimoRender.js";
import {
    DEFAULT_MAX_RENDER_COUNT,
    buildBasketRenderSubset,
    createBasketBodies,
    createBasketBody,
    reconcileBasketBodies
} from "./bodies.js";
import { getOrCreateBasketShapeAsset } from "./basketShapeAsset.js";
import { updateBasketPhysics } from "./physics.js";
import { createBasketPointerInteraction } from "./pointerInteraction.js";
import { drawBasket } from "./renderer.js";
import { clamp, getNowMs } from "./utils.js";

const WORLD_PADDING = 8;
const MIN_BODY_RADIUS = 12;
const MAX_BODY_RADIUS = 39;

let basketAnimationFrameId = null;
const basketRuntimeByCanvas = new Map();
const spriteCache = createMarimoSpriteCache();

function hasHtmlCanvasCtor() {
    return typeof HTMLCanvasElement !== "undefined";
}

function normalizeCanvas(value) {
    if (hasHtmlCanvasCtor() && value instanceof HTMLCanvasElement) {
        return value;
    }

    return null;
}

function resolveRenderItems(options) {
    if (Array.isArray(options?.stackItems)) {
        return options.stackItems;
    }

    if (Array.isArray(options?.items)) {
        return options.items;
    }

    if (Array.isArray(options?.sourceItems)) {
        return options.sourceItems;
    }

    if (typeof options?.getItems === "function") {
        const resolved = options.getItems();
        if (Array.isArray(resolved)) {
            return resolved;
        }
    }

    return [];
}

function resolveRepresentativeVolume(options) {
    if (Number.isFinite(options?.stackRepresentativeVolume)) {
        return options.stackRepresentativeVolume;
    }

    if (Number.isFinite(options?.representativeVolume)) {
        return options.representativeVolume;
    }

    return 0;
}

function resolveMaxRenderCount(options) {
    if (Number.isFinite(options?.maxRenderCount)) {
        return Math.max(1, Math.round(options.maxRenderCount));
    }

    if (Number.isFinite(options?.maxBodies)) {
        return Math.max(1, Math.round(options.maxBodies));
    }

    return DEFAULT_MAX_RENDER_COUNT;
}

function resolveRenderSubsetBuilder(options) {
    if (typeof options?.buildRenderSubset === "function") {
        return options.buildRenderSubset;
    }

    return buildBasketRenderSubset;
}

function resolveBasketImageSrc(options) {
    if (typeof options?.basketImageSrc === "string" && options.basketImageSrc.trim().length > 0) {
        return options.basketImageSrc.trim();
    }

    if (typeof options?.basketSpriteSrc === "string" && options.basketSpriteSrc.trim().length > 0) {
        return options.basketSpriteSrc.trim();
    }

    return "";
}

function buildRuntimeStartOptions(options) {
    const canvas = normalizeCanvas(options?.canvas);
    const renderItems = resolveRenderItems(options);
    const width = Number.isFinite(options?.physicsWidth) ? Math.max(120, options.physicsWidth) : Math.max(120, canvas?.clientWidth || 360);
    const height = Number.isFinite(options?.physicsHeight) ? Math.max(120, options.physicsHeight) : Math.max(120, canvas?.clientHeight || 300);
    const pixelRatioRaw = Number.isFinite(options?.devicePixelRatio) ? options.devicePixelRatio : (window.devicePixelRatio || 1);
    const pixelRatio = Math.max(1, Math.min(3, pixelRatioRaw));

    return {
        canvas,
        renderItems,
        representativeVolume: resolveRepresentativeVolume(options),
        onSelectItem: typeof options?.onSelectItem === "function" ? options.onSelectItem : () => {},
        width,
        height,
        pixelRatio,
        maxRenderCount: resolveMaxRenderCount(options),
        buildRenderSubset: resolveRenderSubsetBuilder(options),
        basketImageSrc: resolveBasketImageSrc(options),
        allowEmpty: options?.allowEmpty === true,
        drawBasketShape: options?.drawBasketShape !== false,
        pointerHooks: options?.pointerHooks && typeof options.pointerHooks === "object" ? options.pointerHooks : null
    };
}

function buildRenderSubset(runtime, renderItems, representativeVolume) {
    const subsetBuilder = typeof runtime?.buildRenderSubset === "function" ? runtime.buildRenderSubset : buildBasketRenderSubset;
    const nextSubset = subsetBuilder(renderItems, representativeVolume, runtime?.maxRenderCount);
    if (!Array.isArray(nextSubset)) {
        return [];
    }

    return nextSubset;
}

export function startBasketAnimation(options = {}) {
    const runtimeOptions = buildRuntimeStartOptions(options);
    const canvas = runtimeOptions.canvas;

    if (!canvas) {
        stopBasketAnimation();
        return;
    }

    if (runtimeOptions.renderItems.length <= 0 && runtimeOptions.allowEmpty !== true) {
        stopBasketAnimation({ canvas });
        return;
    }

    const existingRuntime = basketRuntimeByCanvas.get(canvas);
    if (existingRuntime) {
        reconcileBasketRuntime(existingRuntime, runtimeOptions);
        ensureBasketAnimationLoop();
        return;
    }

    const runtime = createBasketRuntime(runtimeOptions);
    if (!runtime) {
        return;
    }

    basketRuntimeByCanvas.set(canvas, runtime);
    runtime.pointerInteraction?.attach();
    ensureBasketAnimationLoop();
}

export function stopBasketAnimation(options = {}) {
    const targetCanvas = normalizeCanvas(options?.canvas);

    if (!targetCanvas) {
        if (basketAnimationFrameId !== null) {
            cancelAnimationFrame(basketAnimationFrameId);
            basketAnimationFrameId = null;
        }

        for (const runtime of basketRuntimeByCanvas.values()) {
            runtime.pointerInteraction?.detach();
        }
        basketRuntimeByCanvas.clear();
        return;
    }

    const targetRuntime = basketRuntimeByCanvas.get(targetCanvas);
    if (!targetRuntime) {
        return;
    }

    targetRuntime.pointerInteraction?.detach();
    basketRuntimeByCanvas.delete(targetCanvas);

    if (basketRuntimeByCanvas.size <= 0 && basketAnimationFrameId !== null) {
        cancelAnimationFrame(basketAnimationFrameId);
        basketAnimationFrameId = null;
    }
}

function findRuntimeForReplacement(targetCanvas, targetItemId) {
    if (targetCanvas) {
        const runtime = basketRuntimeByCanvas.get(targetCanvas);
        if (!runtime || !Array.isArray(runtime.bodies)) {
            return null;
        }

        const bodyIndex = runtime.bodies.findIndex((body) => body.itemId === targetItemId);
        if (bodyIndex < 0) {
            return null;
        }

        return {
            runtime,
            bodyIndex
        };
    }

    for (const runtime of basketRuntimeByCanvas.values()) {
        if (!Array.isArray(runtime.bodies) || runtime.bodies.length <= 0) {
            continue;
        }

        const bodyIndex = runtime.bodies.findIndex((body) => body.itemId === targetItemId);
        if (bodyIndex >= 0) {
            return {
                runtime,
                bodyIndex
            };
        }
    }

    return null;
}

export function replaceBasketItem(options = {}) {
    const targetItemId = typeof options?.targetItemId === "string" ? options.targetItemId : "";
    if (!targetItemId) {
        return false;
    }

    const targetCanvas = normalizeCanvas(options?.canvas);
    const target = findRuntimeForReplacement(targetCanvas, targetItemId);
    if (!target) {
        return false;
    }

    const { runtime, bodyIndex } = target;
    const targetBody = runtime.bodies[bodyIndex];
    const replacementItem = options?.replacementItem && typeof options.replacementItem === "object" ? options.replacementItem : null;

    if (!replacementItem) {
        runtime.bodies.splice(bodyIndex, 1);
        return true;
    }

    const replacementBody = createBasketBody(replacementItem, runtime.width, runtime.height, bodyIndex);
    replacementBody.x = targetBody.x;
    replacementBody.y = targetBody.y;
    replacementBody.vx = targetBody.vx;
    replacementBody.vy = targetBody.vy - 0.28;
    replacementBody.angle = targetBody.angle;
    replacementBody.angularVelocity = targetBody.angularVelocity;

    runtime.bodies[bodyIndex] = replacementBody;
    return true;
}

function toItemIdSet(itemIds) {
    if (!Array.isArray(itemIds)) {
        return new Set();
    }

    const itemIdSet = new Set();
    for (let i = 0; i < itemIds.length; i += 1) {
        const itemId = itemIds[i];
        if (typeof itemId === "string" && itemId.length > 0) {
            itemIdSet.add(itemId);
        }
    }
    return itemIdSet;
}

function removeBodiesByItemIdSet(runtime, itemIdSet) {
    if (!runtime || !Array.isArray(runtime.bodies) || itemIdSet.size <= 0) {
        return 0;
    }

    let removedCount = 0;
    for (let i = runtime.bodies.length - 1; i >= 0; i -= 1) {
        const body = runtime.bodies[i];
        if (itemIdSet.has(body?.itemId)) {
            runtime.bodies.splice(i, 1);
            removedCount += 1;
        }
    }

    return removedCount;
}

function getRuntimePointFromClient(runtime, clientX, clientY) {
    if (!runtime?.canvas || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return null;
    }

    const rect = runtime.canvas.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    return {
        x: (clientX - rect.left) * (runtime.width / rect.width),
        y: (clientY - rect.top) * (runtime.height / rect.height)
    };
}

export function removeBasketItems(options = {}) {
    const itemIdSet = toItemIdSet(options?.itemIds);
    if (itemIdSet.size <= 0) {
        return 0;
    }

    const targetCanvas = normalizeCanvas(options?.canvas);
    if (targetCanvas) {
        const runtime = basketRuntimeByCanvas.get(targetCanvas);
        return removeBodiesByItemIdSet(runtime, itemIdSet);
    }

    let removedCount = 0;
    for (const runtime of basketRuntimeByCanvas.values()) {
        removedCount += removeBodiesByItemIdSet(runtime, itemIdSet);
    }

    return removedCount;
}

export function pullBasketItemsTowardClientPoint(options = {}) {
    const targetCanvas = normalizeCanvas(options?.canvas);
    if (!targetCanvas) {
        return 0;
    }

    const runtime = basketRuntimeByCanvas.get(targetCanvas);
    if (!runtime || !Array.isArray(runtime.bodies)) {
        return 0;
    }

    const itemIdSet = toItemIdSet(options?.itemIds);
    if (itemIdSet.size <= 0) {
        return 0;
    }

    const targetPoint = getRuntimePointFromClient(runtime, options?.clientX, options?.clientY);
    if (!targetPoint) {
        return 0;
    }

    const pullStrengthRaw = Number.isFinite(options?.pullStrength) ? options.pullStrength : 0.28;
    const pullStrength = clamp(pullStrengthRaw, 0.05, 0.7);
    let movedCount = 0;

    for (let i = 0; i < runtime.bodies.length; i += 1) {
        const body = runtime.bodies[i];
        if (!itemIdSet.has(body?.itemId)) {
            continue;
        }

        const dx = targetPoint.x - body.x;
        const dy = targetPoint.y - body.y;
        body.x += dx * pullStrength;
        body.y += dy * pullStrength;
        body.x = clamp(body.x, WORLD_PADDING + body.radius, runtime.width - WORLD_PADDING - body.radius);
        body.y = clamp(body.y, WORLD_PADDING + body.radius, runtime.height - WORLD_PADDING - body.radius);
        body.vx = (body.vx * 0.78) + (dx * 0.05);
        body.vy = (body.vy * 0.78) + (dy * 0.05);
        movedCount += 1;
    }

    return movedCount;
}

function ensureBasketAnimationLoop() {
    if (basketAnimationFrameId !== null || basketRuntimeByCanvas.size <= 0) {
        return;
    }

    basketAnimationFrameId = requestAnimationFrame(tickBasketAnimationFrame);
}

function tickBasketAnimationFrame() {
    basketAnimationFrameId = null;

    if (basketRuntimeByCanvas.size <= 0) {
        return;
    }

    for (const runtime of basketRuntimeByCanvas.values()) {
        syncRuntimeToDisplayedCanvasSize(runtime);
        updateBasketPhysics(runtime);
        drawBasket(runtime, spriteCache);
    }

    ensureBasketAnimationLoop();
}

function createBasketRuntime(options) {
    const canvas = options.canvas;
    if (!canvas) {
        return null;
    }

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
        onSelectItem: options.onSelectItem,
        pointerInteraction: null,
        maxRenderCount: options.maxRenderCount,
        buildRenderSubset: options.buildRenderSubset,
        basketShapeAsset: getOrCreateBasketShapeAsset(options.basketImageSrc),
        drawBasketShape: options.drawBasketShape !== false,
        pointerHooks: options.pointerHooks
    };

    updateRuntimeCanvasMetrics(runtime, options.width, options.height, options.pixelRatio);

    const renderSubset = buildRenderSubset(runtime, options.renderItems, options.representativeVolume);
    runtime.bodies = createBasketBodies(renderSubset, runtime.width, runtime.height);
    runtime.pointerInteraction = createBasketPointerInteraction(runtime);

    return runtime;
}

function reconcileBasketRuntime(runtime, options) {
    runtime.onSelectItem = options.onSelectItem;
    runtime.maxRenderCount = options.maxRenderCount;
    runtime.buildRenderSubset = options.buildRenderSubset;
    runtime.basketShapeAsset = getOrCreateBasketShapeAsset(options.basketImageSrc);
    runtime.drawBasketShape = options.drawBasketShape !== false;
    runtime.pointerHooks = options.pointerHooks;

    updateRuntimeCanvasMetrics(runtime, options.width, options.height, options.pixelRatio);

    const renderSubset = buildRenderSubset(runtime, options.renderItems, options.representativeVolume);
    reconcileBasketBodies(runtime, renderSubset);
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
