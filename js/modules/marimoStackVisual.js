// 파일 역할: 대표 마리모 단일/스택 UI 상태를 공용 DOM 렌더 함수로 제공한다.
// 핵심 책임: 개수에 따라 단일 마리모와 겹침 스택(톤다운+카운트 배지) 표현을 전환한다.
// 연동 범위: warehouse 리스트, future net toggle 등 다중 선택 상태 UI에서 재사용한다.

import { renderMarimoVisual } from "../ui/marimoRender.js";

const MAX_VISIBLE_STACK_DEPTH = 3;
const STACK_OFFSET_X_STEP_PX = 8;
const STACK_OFFSET_Y_STEP_PX = 5;
const STACK_SCALE_STEP = 0.08;
const MAX_COUNT_BADGE_VALUE = 99;

function toSafeStackCount(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

function clearVisualContainer(container) {
    container.textContent = "";
    container.removeAttribute("data-stack-count");
}

function renderSingleMarimo(container, marimo) {
    container.className = "marimo";
    renderMarimoVisual(container, {
        marimo,
        showFace: true
    });
}

function createStackLayer(options = {}) {
    const layer = document.createElement("div");
    layer.className = "marimo marimo-stack-visual-layer";

    const depthFromFront = Number.isFinite(options.depthFromFront) ? options.depthFromFront : 0;
    const translateX = depthFromFront * STACK_OFFSET_X_STEP_PX;
    const translateY = depthFromFront * STACK_OFFSET_Y_STEP_PX;
    const scale = Math.max(0.74, 1 - (depthFromFront * STACK_SCALE_STEP));
    const zIndex = MAX_VISIBLE_STACK_DEPTH - depthFromFront;

    layer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    layer.style.zIndex = String(zIndex);
    layer.classList.toggle("marimo-stack-visual-layer-toned", depthFromFront > 0);

    renderMarimoVisual(layer, {
        marimo: options.marimo,
        showFace: depthFromFront <= 0
    });

    return layer;
}

function createStackCountBadge(stackCount) {
    const badge = document.createElement("span");
    badge.className = "marimo-stack-count-badge";
    badge.textContent = stackCount > MAX_COUNT_BADGE_VALUE ? `${MAX_COUNT_BADGE_VALUE}+` : `${stackCount}`;
    badge.setAttribute("aria-label", `Stack count ${stackCount}`);
    return badge;
}

/** 이 함수는 개수 기반으로 단일/스택 마리모 UI를 렌더링한다. */
export function renderMarimoStackVisual(container, options = {}) {
    if (!(container instanceof HTMLElement)) {
        return;
    }

    const marimo = options?.marimo;
    const stackCount = toSafeStackCount(options?.count);
    clearVisualContainer(container);

    if (stackCount < 2) {
        renderSingleMarimo(container, marimo);
        return;
    }

    container.className = "marimo-stack-visual";
    container.dataset.stackCount = String(stackCount);

    const stage = document.createElement("div");
    stage.className = "marimo-stack-visual-stage";

    const visibleDepth = Math.max(2, Math.min(MAX_VISIBLE_STACK_DEPTH, stackCount));
    for (let depth = visibleDepth - 1; depth >= 0; depth -= 1) {
        stage.appendChild(createStackLayer({
            marimo,
            depthFromFront: depth
        }));
    }

    container.appendChild(stage);
    container.appendChild(createStackCountBadge(stackCount));
}
