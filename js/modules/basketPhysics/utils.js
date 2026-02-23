// 파일 역할: basketPhysics 전반에서 재사용하는 공통 유틸 함수를 제공한다.
// 핵심 책임: 값 보정(clamp), 난수 생성, CSS 변수 숫자 해석, 물리 스케일/시간 값 조회를 담당한다.
// 연동 범위: bodies·physics·renderer·index에서 공통으로 import하는 기반 유틸 계층이다.

const DEFAULT_BODY_RADIUS_SCALE = 1.5;
const DEFAULT_FACE_RENDER_SCALE = 0.65;
const MARIMO_PHYSICS_BODY_RADIUS_SCALE_TOKEN = "--marimo-render-body-radius-scale";
const MARIMO_PHYSICS_FACE_SCALE_TOKEN = "--marimo-render-face-scale";
const BASKET_IMAGE_ASPECT_RATIO = 1224 / 792;
const BASKET_MAX_WIDTH_RATIO = 0.96;
const BASKET_MAX_HEIGHT_RATIO = 0.62;
const BASKET_BOTTOM_MARGIN = 4;

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

export function getBasketRenderLayout(rawWidth, rawHeight) {
    const width = Math.max(120, Number.isFinite(rawWidth) ? rawWidth : 120);
    const height = Math.max(120, Number.isFinite(rawHeight) ? rawHeight : 120);

    const widthByCanvas = width * BASKET_MAX_WIDTH_RATIO;
    const widthByHeight = height * BASKET_MAX_HEIGHT_RATIO * BASKET_IMAGE_ASPECT_RATIO;
    const basketWidth = Math.max(64, Math.min(widthByCanvas, widthByHeight));
    const basketHeight = basketWidth / BASKET_IMAGE_ASPECT_RATIO;

    const basketRect = {
        x: (width - basketWidth) * 0.5,
        y: height - basketHeight - BASKET_BOTTOM_MARGIN,
        width: basketWidth,
        height: basketHeight
    };

    return {
        basketRect
    };
}

function resolveCssNumberFromRaw(rawValue, computedStyle, fallback, depth = 0) {
    if (depth > 8 || typeof rawValue !== "string") {
        return fallback;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return fallback;
    }

    const numericValue = Number.parseFloat(trimmed);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    const varMatch = trimmed.match(/^var\(\s*(--[A-Za-z0-9\-_]+)\s*(?:,\s*(.+))?\)$/);
    if (!varMatch) {
        return fallback;
    }

    const referencedTokenName = varMatch[1];
    const referencedRawValue = computedStyle.getPropertyValue(referencedTokenName);
    if (referencedRawValue && referencedRawValue.trim().length > 0) {
        return resolveCssNumberFromRaw(referencedRawValue, computedStyle, fallback, depth + 1);
    }

    const inlineFallbackRaw = varMatch[2];
    if (typeof inlineFallbackRaw === "string" && inlineFallbackRaw.trim().length > 0) {
        return resolveCssNumberFromRaw(inlineFallbackRaw, computedStyle, fallback, depth + 1);
    }

    return fallback;
}

function readRootCssNumberToken(tokenName, fallback) {
    if (
        typeof document === "undefined"
        || typeof HTMLElement === "undefined"
        || typeof getComputedStyle !== "function"
        || !(document.documentElement instanceof HTMLElement)
    ) {
        return fallback;
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const raw = computedStyle.getPropertyValue(tokenName);
    return resolveCssNumberFromRaw(raw, computedStyle, fallback);
}

export function getMarimoPhysicsBodyRadiusScale() {
    return clamp(readRootCssNumberToken(MARIMO_PHYSICS_BODY_RADIUS_SCALE_TOKEN, DEFAULT_BODY_RADIUS_SCALE), 0.4, 4);
}

export function getMarimoPhysicsFaceScale() {
    return clamp(readRootCssNumberToken(MARIMO_PHYSICS_FACE_SCALE_TOKEN, DEFAULT_FACE_RENDER_SCALE), 0.1, 2);
}

export function getNowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }

    return Date.now();
}
