// 파일 역할: 스택 상세보기 모달에서 대표 정보와 물리 프리뷰를 렌더한다.
// 핵심 책임: 스택 아이디 정규화, 랜덤 선택, 디스플레이 설정 반영을 함께 처리한다.
// 연동 범위: basketPhysics 시작/중지와 연동되는 스택 모드 전용 뷰 로직을 제공한다.

import { state } from "../../../state.js";
import { startBasketAnimation, stopBasketAnimation } from "../../../modules/basketPhysics/index.js";
import {
    buildTransportModeSourcePointerHooks,
    handleTransportModeSourceTap,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
} from "../../../global/transportMode/index.js";

const DEFAULT_BASKET_CANVAS_WIDTH = 360;
const DEFAULT_BASKET_CANVAS_HEIGHT = 300;
const DEFAULT_BASKET_CANVAS_DPR = 1;

let activeStackRenderContext = null;
let devDisplayListenerBound = false;

/** 이 함수는 스택 상세 모달 본문을 렌더링하고 바구니 물리 루프를 시작한다. */
export function renderStackDetail(options) {
    bindDevDisplayListener();

    const detailBody = options?.detailBody;
    const detailSendToMainBtn = options?.detailSendToMainBtn;
    const stackMeta = options?.stackMeta;
    const onSelectItem = typeof options?.onSelectItem === "function" ? options.onSelectItem : () => {};

    if (!detailBody) {
        if (activeStackRenderContext?.canvas) {
            stopBasketAnimation({ canvas: activeStackRenderContext.canvas });
        }
        activeStackRenderContext = null;
        return;
    }

    if (activeStackRenderContext?.canvas) {
        stopBasketAnimation({ canvas: activeStackRenderContext.canvas });
    }

    const stackItems = getStackItemsByIds(stackMeta?.stackAllItemIds);
    detailBody.textContent = "";

    if (detailSendToMainBtn) {
        detailSendToMainBtn.classList.add("hidden");
    }

    const countLine = document.createElement("div");
    updateStackCountLine(countLine, stackItems.length);
    detailBody.appendChild(countLine);

    const canvasConfig = getBasketCanvasConfig();
    const canvas = document.createElement("canvas");
    canvas.className = "stack-detail-canvas";
    canvas.style.maxWidth = `${canvasConfig.width}px`;
    detailBody.appendChild(canvas);

    activeStackRenderContext = {
        detailBody,
        detailSendToMainBtn,
        stackMeta: {
            stackAllItemIds: Array.isArray(stackMeta?.stackAllItemIds) ? [...stackMeta.stackAllItemIds] : [],
            stackRepresentativeVolume: stackMeta?.stackRepresentativeVolume
        },
        onSelectItem,
        canvas,
        countLine
    };

    startBasketAnimation({
        canvas,
        items: stackItems,
        stackRepresentativeVolume: stackMeta?.stackRepresentativeVolume,
        onSelectItem: (itemId) => {
            const handledByTransportMode = handleTransportModeSourceTap({
                sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK,
                itemId
            });

            if (handledByTransportMode) {
                return;
            }

            onSelectItem(itemId);
        },
        pointerHooks: buildTransportModeSourcePointerHooks({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
        }),
        physicsWidth: canvasConfig.width,
        physicsHeight: canvasConfig.height,
        devicePixelRatio: canvasConfig.dpr,
        maxRenderCount: 50,
        allowEmpty: true
    });
}

/** 이 함수는 열려 있는 스택 상세 모달의 count 라벨만 갱신한다. */
export function refreshActiveStackDetailCount() {
    if (!activeStackRenderContext) {
        return false;
    }

    const countLine = activeStackRenderContext.countLine;
    if (!(countLine instanceof HTMLElement)) {
        return false;
    }

    if (!activeStackRenderContext.detailBody || activeStackRenderContext.detailBody.isConnected !== true) {
        return false;
    }

    const count = getStackItemIds(activeStackRenderContext.stackMeta?.stackAllItemIds).length;
    updateStackCountLine(countLine, count);
    return true;
}

/** 이 함수는 현재 스택에서 랜덤 아이템 아이디를 반환한다. */
export function pickRandomStackItemId(stackMeta) {
    const availableIds = getStackItemIds(stackMeta?.stackAllItemIds);
    if (availableIds.length <= 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * availableIds.length);
    return availableIds[randomIndex];
}

/** 이 함수는 스택 상세 렌더 루프를 중지한다. */
export function stopStackDetail() {
    if (activeStackRenderContext?.canvas) {
        stopBasketAnimation({ canvas: activeStackRenderContext.canvas });
    }
    activeStackRenderContext = null;
}

// 이 함수는 개발자 표시 설정 변경 시 열려 있는 스택 상세를 다시 렌더링한다.
function bindDevDisplayListener() {
    if (devDisplayListenerBound) {
        return;
    }

    window.addEventListener("marimo:dev-display-config-changed", () => {
        if (!activeStackRenderContext) {
            return;
        }

        if (!activeStackRenderContext.detailBody || activeStackRenderContext.detailBody.isConnected !== true) {
            if (activeStackRenderContext.canvas) {
                stopBasketAnimation({ canvas: activeStackRenderContext.canvas });
            }
            activeStackRenderContext = null;
            return;
        }

        renderStackDetail(activeStackRenderContext);
    });

    devDisplayListenerBound = true;
}

// 이 함수는 루트 CSS 변수에서 숫자 값을 읽는다.
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

function readRootCssNumber(variableName, fallback) {
    if (
        typeof document === "undefined"
        || typeof HTMLElement === "undefined"
        || typeof getComputedStyle !== "function"
        || !(document.documentElement instanceof HTMLElement)
    ) {
        return fallback;
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const rawValue = computedStyle.getPropertyValue(variableName);
    return resolveCssNumberFromRaw(rawValue, computedStyle, fallback);
}

// 이 함수는 스택 캔버스 표시 크기와 DPR 설정을 계산한다.
function getBasketCanvasConfig() {
    const width = Math.max(220, Math.min(640, readRootCssNumber("--basket-canvas-width", DEFAULT_BASKET_CANVAS_WIDTH)));
    const height = Math.max(180, Math.min(540, readRootCssNumber("--basket-canvas-height", DEFAULT_BASKET_CANVAS_HEIGHT)));
    const dpr = Math.max(1, Math.min(3, readRootCssNumber("--basket-canvas-dpr", DEFAULT_BASKET_CANVAS_DPR)));

    return {
        width,
        height,
        dpr
    };
}

function updateStackCountLine(countLine, count) {
    if (!(countLine instanceof HTMLElement)) {
        return;
    }

    countLine.textContent = `Stack count: ${count}`;
}

// 이 함수는 현재 창고에 존재하는 스택 아이디 목록만 필터링해 반환한다.
function getStackItemIds(rawIds) {
    if (!Array.isArray(rawIds)) {
        return [];
    }

    const availableIds = [];

    for (let i = 0; i < rawIds.length; i += 1) {
        const itemId = rawIds[i];
        const exists = state.warehouse.some((item) => item.id === itemId);
        if (exists) {
            availableIds.push(itemId);
        }
    }

    return availableIds;
}

// 이 함수는 스택 아이디 목록으로 실제 아이템 배열을 구성한다.
function getStackItemsByIds(rawIds) {
    const targetIds = getStackItemIds(rawIds);
    if (targetIds.length <= 0) {
        return [];
    }

    const itemMap = new Map();
    for (let i = 0; i < state.warehouse.length; i += 1) {
        const item = state.warehouse[i];
        if (item && typeof item.id === "string") {
            itemMap.set(item.id, item);
        }
    }

    const items = [];
    for (let i = 0; i < targetIds.length; i += 1) {
        const itemId = targetIds[i];
        const item = itemMap.get(itemId);
        if (item) {
            items.push(item);
        }
    }

    return items;
}
