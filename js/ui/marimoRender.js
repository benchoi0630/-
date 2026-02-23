// 파일 역할: 마리모 에셋 경로/DOM 렌더/캔버스 렌더 규칙을 단일 파일에서 제공한다.
// 핵심 책임: 본체·표정 이미지 선택, DOM 레이어 렌더, 캔버스 스프라이트 렌더를 중앙화한다.
// 연동 범위: main/warehouse/dictionary/detail DOM 렌더와 warehouse physics 캔버스 렌더가 모두 이 모듈을 사용한다.

const MARIMO_ASSET_ROOT = new URL("./assets/", import.meta.url);

const FACE_VARIANT_FILE_NAME = Object.freeze({
    1: "marimo face 1.png",
    2: "marimo face 2.png"
});
const DEFAULT_FACE_VARIANT = 1;

function resolveMarimoAsset(fileName) {
    return new URL(fileName, MARIMO_ASSET_ROOT).href;
}

function normalizeFaceVariant(variant) {
    const parsed = Number.parseInt(variant, 10);
    if (parsed === 2) {
        return 2;
    }
    return 1;
}

export const MARIMO_BODY_SRC = resolveMarimoAsset("marimo 1.png");

export const MARIMO_FACE_SRC_BY_VARIANT = Object.freeze({
    1: resolveMarimoAsset(FACE_VARIANT_FILE_NAME[1]),
    2: resolveMarimoAsset(FACE_VARIANT_FILE_NAME[2])
});

export function getMarimoBodyImageCandidates() {
    return [MARIMO_BODY_SRC];
}

export function getMarimoFaceImageCandidates(variant) {
    const normalizedVariant = normalizeFaceVariant(variant);
    return [MARIMO_FACE_SRC_BY_VARIANT[normalizedVariant]];
}

export function getMarimoFaceImageSrc(variant) {
    const normalizedVariant = normalizeFaceVariant(variant);
    return MARIMO_FACE_SRC_BY_VARIANT[normalizedVariant];
}

const BODY_IMAGE_CANDIDATES = getMarimoBodyImageCandidates();
const FACE_IMAGE_CANDIDATES = Object.freeze({
    1: getMarimoFaceImageCandidates(1),
    2: getMarimoFaceImageCandidates(2)
});

// 이 함수는 렌더 컨테이너에 필요한 이미지 레이어를 보장한다.
function ensureLayer(container, className) {
    const existing = container.querySelector(`.${className}`);
    if (existing) {
        return existing;
    }

    const image = document.createElement("img");
    image.className = className;
    image.alt = "";
    image.draggable = false;
    image.loading = "lazy";
    image.decoding = "async";
    container.appendChild(image);
    return image;
}

// 이 함수는 후보 경로를 순차 시도해 첫 성공 이미지로 자동 대체한다.
function applyImageWithFallback(image, candidates) {
    const safeCandidates = Array.isArray(candidates) ? candidates.filter((path) => typeof path === "string" && path) : [];
    const key = safeCandidates.join("|");

    const hasVisibleSource = image.dataset.sourceKey === key
        && image.classList.contains("hidden") === false
        && Boolean(image.getAttribute("src"));

    if (hasVisibleSource) {
        return;
    }

    image.dataset.sourceKey = key;

    if (safeCandidates.length === 0) {
        image.removeAttribute("src");
        image.classList.add("hidden");
        return;
    }

    let index = 0;

    const trySet = () => {
        if (index >= safeCandidates.length) {
            image.removeAttribute("src");
            image.classList.add("hidden");
            image.onerror = null;
            image.onload = null;
            return;
        }

        image.classList.remove("hidden");
        image.src = safeCandidates[index];
    };

    image.onerror = () => {
        index += 1;
        trySet();
    };

    image.onload = () => {
        image.onerror = null;
        image.onload = null;
    };

    trySet();
}

/** 이 함수는 마리모 컨테이너 비주얼을 초기화해 비운다. */
export function clearMarimoVisual(container) {
    if (!container) {
        return;
    }

    container.textContent = "";
    container.style.background = "transparent";
    container.style.borderRadius = "0";
}

/** 이 함수는 마리모 몸체와 얼굴 이미지를 DOM 레이어로 렌더링한다. */
export function renderMarimoVisual(container, options = {}) {
    if (!container) {
        return;
    }

    const showFace = options.showFace !== false;
    const faceVariant = Number.isFinite(options.faceVariant)
        ? Math.max(1, Math.min(2, Math.round(options.faceVariant)))
        : DEFAULT_FACE_VARIANT;

    container.classList.add("marimo-render");
    container.style.background = "transparent";
    container.style.borderRadius = "0";

    const bodyLayer = ensureLayer(container, "marimo-layer-body");
    const faceLayer = ensureLayer(container, "marimo-layer-face");

    applyImageWithFallback(bodyLayer, BODY_IMAGE_CANDIDATES);

    if (showFace) {
        applyImageWithFallback(faceLayer, FACE_IMAGE_CANDIDATES[faceVariant] || FACE_IMAGE_CANDIDATES[1]);
        faceLayer.classList.remove("hidden");
    } else {
        faceLayer.classList.add("hidden");
    }
}

export const MARIMO_FACE_SWAP_INTERVAL_MIN_MS = 2200;
export const MARIMO_FACE_SWAP_INTERVAL_MAX_MS = 4800;
export const MARIMO_FACE_SWAP_DURATION_MIN_MS = 220;
export const MARIMO_FACE_SWAP_DURATION_MAX_MS = 520;

// 이 함수는 최소/최대 사이의 실수 난수를 반환한다.
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

// 이 함수는 캔버스 렌더에서 사용할 랜덤 표정 주기 상태를 생성한다.
export function createMarimoFaceAnimationState() {
    const intervalMs = randomBetween(MARIMO_FACE_SWAP_INTERVAL_MIN_MS, MARIMO_FACE_SWAP_INTERVAL_MAX_MS);
    const durationMs = randomBetween(MARIMO_FACE_SWAP_DURATION_MIN_MS, MARIMO_FACE_SWAP_DURATION_MAX_MS);
    const cycle = intervalMs + durationMs;

    return {
        intervalMs,
        durationMs,
        phaseMs: randomBetween(0, cycle)
    };
}

// 이 함수는 현재 프레임에서 표정2를 렌더해야 하는지 계산한다.
export function shouldUseMarimoFaceVariant2(animationState, elapsedMs) {
    const intervalMs = Number.isFinite(animationState?.faceIntervalMs)
        ? animationState.faceIntervalMs
        : MARIMO_FACE_SWAP_INTERVAL_MAX_MS;
    const durationMs = Number.isFinite(animationState?.faceDurationMs)
        ? animationState.faceDurationMs
        : MARIMO_FACE_SWAP_DURATION_MAX_MS;
    const phaseOffsetMs = Number.isFinite(animationState?.facePhaseMs)
        ? animationState.facePhaseMs
        : 0;
    const cycle = intervalMs + durationMs;
    const phase = Math.max(0, elapsedMs) % cycle;
    return ((phase + phaseOffsetMs) % cycle) >= intervalMs;
}

// 이 함수는 이미지 엘리먼트를 생성하고 비동기 로드를 시작한다.
function createSprite(src) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    return image;
}

// 이 함수는 이미지가 실제로 렌더 가능한 상태인지 확인한다.
function isSpriteReady(image) {
    return Boolean(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

// 이 함수는 이미지 로드 전 임시 원형 마리모를 그린다.
function drawFallbackMarimo(ctx, radius, marimoType) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = marimoType === "normal" ? "#89c778" : "#6ea6e8";
    ctx.fill();
}

// 이 함수는 캔버스 마리모 렌더에서 재사용할 스프라이트 캐시를 생성한다.
export function createMarimoSpriteCache() {
    return {
        body: createSprite(MARIMO_BODY_SRC),
        face1: createSprite(getMarimoFaceImageSrc(1)),
        face2: createSprite(getMarimoFaceImageSrc(2))
    };
}

// 이 함수는 캔버스에 마리모 본체/표정을 렌더한다.
export function drawMarimoOnCanvas(options = {}) {
    const ctx = options?.ctx;
    if (!ctx) {
        return;
    }

    const x = Number.isFinite(options?.x) ? options.x : 0;
    const y = Number.isFinite(options?.y) ? options.y : 0;
    const radius = Number.isFinite(options?.radius) ? Math.max(0, options.radius) : 0;
    if (radius <= 0) {
        return;
    }

    const angle = Number.isFinite(options?.angle) ? options.angle : 0;
    const marimoType = typeof options?.marimoType === "string" ? options.marimoType : "normal";
    const faceVariant = normalizeFaceVariant(options?.faceVariant);
    const faceScaleRaw = Number.isFinite(options?.faceScale) ? options.faceScale : 1;
    const faceScale = Math.max(0, faceScaleRaw);
    const spriteCache = options?.spriteCache && typeof options.spriteCache === "object" ? options.spriteCache : null;
    const bodySprite = spriteCache?.body || null;
    const faceSprite = faceVariant === 2 ? (spriteCache?.face2 || null) : (spriteCache?.face1 || null);
    const size = radius * 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (isSpriteReady(bodySprite)) {
        ctx.drawImage(bodySprite, -radius, -radius, size, size);
    } else {
        drawFallbackMarimo(ctx, radius, marimoType);
    }

    if (faceScale > 0 && isSpriteReady(faceSprite)) {
        const faceSize = size * faceScale;
        const faceRadius = faceSize / 2;
        ctx.drawImage(faceSprite, -faceRadius, -faceRadius, faceSize, faceSize);
    }

    ctx.restore();

    if (options?.drawOutline !== true) {
        return;
    }

    const outlineColor = typeof options?.outlineColor === "string" ? options.outlineColor : "rgba(0, 0, 0, 0.22)";
    const outlineWidth = Number.isFinite(options?.outlineWidth) ? options.outlineWidth : 1;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
}
