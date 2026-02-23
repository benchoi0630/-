// 파일 역할: 창고 아이템 데이터를 물리 시뮬레이션용 원형 바디로 변환/유지한다.
// 핵심 책임: 반지름 계산, 초기 바디 생성, 기존 바디 재사용(reconcile), 렌더 서브셋 샘플링을 담당한다.
// 연동 범위: index 런타임 생성/갱신 단계에서 호출되어 physics·renderer가 사용할 바디 배열을 제공한다.

import { createMarimoFaceAnimationState } from "../../ui/marimoRender.js";
import { getMarimoType, getMarimoVolume, volumeToDiameter } from "../../utils/marimoData.js";
import { clamp, getMarimoPhysicsBodyRadiusScale, randomBetween } from "./utils.js";

export const DEFAULT_MAX_RENDER_COUNT = 50;
const WORLD_PADDING = 8;
const MIN_BODY_RADIUS = 12;
const MAX_BODY_RADIUS = 39;
const BASKET_MARIMO_RADIUS_MULTIPLIER = 20;

export function getItemId(item, fallbackIndex) {
    if (typeof item?.id === "string" && item.id.length > 0) {
        return item.id;
    }

    return `basket-item-${fallbackIndex}`;
}

export function computeBodyRadius(item, bodyRadiusScale = getMarimoPhysicsBodyRadiusScale()) {
    const volume = getMarimoVolume(item);
    const diameter = volumeToDiameter(Math.max(volume, 0.0001));
    return clamp(diameter * BASKET_MARIMO_RADIUS_MULTIPLIER * bodyRadiusScale, MIN_BODY_RADIUS, MAX_BODY_RADIUS);
}

export function ensureBodyAnimationState(body) {
    if (!body || typeof body !== "object") {
        return;
    }

    if (!Number.isFinite(body.angle)) {
        body.angle = randomBetween(0, Math.PI * 2);
    }

    if (!Number.isFinite(body.angularVelocity)) {
        body.angularVelocity = randomBetween(-0.04, 0.04);
    }

    if (!Number.isFinite(body.faceIntervalMs) || !Number.isFinite(body.faceDurationMs) || !Number.isFinite(body.facePhaseMs)) {
        const faceState = createMarimoFaceAnimationState();
        body.faceIntervalMs = faceState.intervalMs;
        body.faceDurationMs = faceState.durationMs;
        body.facePhaseMs = faceState.phaseMs;
    }
}

export function createBasketBody(item, width, height, index, bodyRadiusScale = getMarimoPhysicsBodyRadiusScale()) {
    const radius = computeBodyRadius(item, bodyRadiusScale);
    const minX = WORLD_PADDING + radius;
    const maxX = Math.max(minX, width - WORLD_PADDING - radius);
    const x = minX + Math.random() * Math.max(1, maxX - minX);
    const spawnHeight = Math.max(16, Math.min(40, height * 0.12));
    const y = WORLD_PADDING + radius + Math.random() * spawnHeight;
    const vx = (Math.random() - 0.5) * 1.6;
    const vy = Math.random() * 0.4;

    const body = {
        itemId: getItemId(item, index),
        radius,
        x,
        y,
        vx,
        vy,
        type: getMarimoType(item),
        isPointerDragging: false
    };

    ensureBodyAnimationState(body);
    return body;
}

export function createBasketBodies(renderItems, width, height) {
    const bodyRadiusScale = getMarimoPhysicsBodyRadiusScale();
    const bodies = [];

    for (let i = 0; i < renderItems.length; i += 1) {
        const item = renderItems[i];
        bodies.push(createBasketBody(item, width, height, i, bodyRadiusScale));
    }

    return bodies;
}

function normalizeMaxRenderCount(maxRenderCount) {
    if (!Number.isFinite(maxRenderCount)) {
        return DEFAULT_MAX_RENDER_COUNT;
    }

    return Math.max(1, Math.round(maxRenderCount));
}

export function buildBasketRenderSubset(stackItems, stackRepresentativeVolume, maxRenderCount = DEFAULT_MAX_RENDER_COUNT) {
    const safeMaxRenderCount = normalizeMaxRenderCount(maxRenderCount);
    if (stackItems.length <= safeMaxRenderCount) {
        return [...stackItems];
    }

    const sortedByHeterogeneity = [...stackItems].sort((a, b) => {
        const scoreA = Math.abs(getMarimoVolume(a) - stackRepresentativeVolume);
        const scoreB = Math.abs(getMarimoVolume(b) - stackRepresentativeVolume);
        const scoreDiff = scoreB - scoreA;
        if (scoreDiff !== 0) {
            return scoreDiff;
        }

        const idA = typeof a.id === "string" ? a.id : "";
        const idB = typeof b.id === "string" ? b.id : "";
        return idA.localeCompare(idB);
    });

    const prioritizedCount = Math.max(1, Math.floor(safeMaxRenderCount * 0.5));
    const prioritized = sortedByHeterogeneity.slice(0, prioritizedCount);
    const remaining = sortedByHeterogeneity.slice(prioritizedCount);
    const sampleNeed = safeMaxRenderCount - prioritized.length;

    if (remaining.length <= sampleNeed) {
        return prioritized.concat(remaining);
    }

    const sampled = [];
    const usedIndices = new Set();
    const step = remaining.length / sampleNeed;

    for (let i = 0; i < sampleNeed; i += 1) {
        const rawIndex = Math.min(remaining.length - 1, Math.floor(i * step));
        if (!usedIndices.has(rawIndex)) {
            sampled.push(remaining[rawIndex]);
            usedIndices.add(rawIndex);
        }
    }

    for (let i = 0; i < remaining.length && sampled.length < sampleNeed; i += 1) {
        if (!usedIndices.has(i)) {
            sampled.push(remaining[i]);
            usedIndices.add(i);
        }
    }

    return prioritized.concat(sampled).slice(0, safeMaxRenderCount);
}

export function reconcileBasketBodies(runtime, renderItems) {
    const bodyRadiusScale = getMarimoPhysicsBodyRadiusScale();
    const existingMap = new Map();
    for (let i = 0; i < runtime.bodies.length; i += 1) {
        const body = runtime.bodies[i];
        existingMap.set(body.itemId, body);
    }

    const nextBodies = [];
    for (let i = 0; i < renderItems.length; i += 1) {
        const item = renderItems[i];
        const itemId = getItemId(item, i);
        const existingBody = existingMap.get(itemId);
        if (existingBody) {
            existingBody.type = getMarimoType(item);
            existingBody.radius = computeBodyRadius(item, bodyRadiusScale);
            ensureBodyAnimationState(existingBody);
            existingBody.x = clamp(existingBody.x, WORLD_PADDING + existingBody.radius, runtime.width - WORLD_PADDING - existingBody.radius);
            existingBody.y = clamp(existingBody.y, WORLD_PADDING + existingBody.radius, runtime.height - WORLD_PADDING - existingBody.radius);
            nextBodies.push(existingBody);
            continue;
        }

        nextBodies.push(createBasketBody(item, runtime.width, runtime.height, i, bodyRadiusScale));
    }

    runtime.bodies = nextBodies;
}
