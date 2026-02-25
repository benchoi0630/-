// 파일 역할: 운송모드 전역 레이어 DOM 생성/조회/시각 상태 렌더를 담당한다.
// 핵심 책임: 풀스크린 뜰채/운송 필드 캔버스와 헤더 토글 버튼을 유지·갱신한다.
// 연동 범위: transportMode controller가 호출해 페이지 이동과 무관한 고정 UI를 유지한다.

import { renderTransportNetDropStackVisual, renderTransportNetStackVisual } from "./netLayer/visualiseStackedMarimo.js";

const HEADER_TRANSPORT_TOGGLE_BTN_ID = "globalTransportModeToggleBtn";
const TRANSPORT_LAYER_ID = "globalTransportModeLayer";
const TRANSPORT_NET_FIELD_ID = "globalTransportNetField";
const TRANSPORT_BASKET_FIELD_ID = "globalTransportBasketField";
const TRANSPORT_NET_CANVAS_ID = "globalTransportNetCanvas";
const TRANSPORT_BASKET_CANVAS_ID = "globalTransportBasketCanvas";
const TRANSPORT_NET_CURSOR_ID = "globalTransportNetCursor";

function ensureHeaderTransportToggleButton() {
    const existing = document.getElementById(HEADER_TRANSPORT_TOGGLE_BTN_ID);
    if (existing) {
        return existing;
    }

    const globalHeader = document.getElementById("globalHeader");
    if (!globalHeader) {
        return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.id = HEADER_TRANSPORT_TOGGLE_BTN_ID;
    button.className = "header-transport-mode-btn";
    button.textContent = "Transfer";
    button.setAttribute("aria-label", "Toggle transfer mode");

    const shellsText = globalHeader.querySelector(".shells-text");
    if (shellsText) {
        globalHeader.insertBefore(button, shellsText);
    } else {
        globalHeader.appendChild(button);
    }

    return button;
}

function createField(fieldId, canvasId, fieldClassName) {
    const field = document.createElement("div");
    field.id = fieldId;
    field.className = `transport-mode-field ${fieldClassName}`;

    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.className = "transport-mode-full-canvas";

    field.appendChild(canvas);
    return field;
}

function createNetCursor() {
    const cursor = document.createElement("div");
    cursor.id = TRANSPORT_NET_CURSOR_ID;
    cursor.className = "transport-net-cursor hidden";
    cursor.setAttribute("aria-hidden", "true");
    return cursor;
}

function createTransportLayer() {
    const layer = document.createElement("aside");
    layer.id = TRANSPORT_LAYER_ID;
    layer.className = "global-transport-mode-layer hidden";

    layer.appendChild(createField(TRANSPORT_BASKET_FIELD_ID, TRANSPORT_BASKET_CANVAS_ID, "transport-basket-field"));
    layer.appendChild(createField(TRANSPORT_NET_FIELD_ID, TRANSPORT_NET_CANVAS_ID, "transport-net-field"));
    layer.appendChild(createNetCursor());

    document.body.appendChild(layer);
    return layer;
}

export function getTransportModeElements() {
    return {
        toggleBtn: document.getElementById(HEADER_TRANSPORT_TOGGLE_BTN_ID),
        layer: document.getElementById(TRANSPORT_LAYER_ID),
        netField: document.getElementById(TRANSPORT_NET_FIELD_ID),
        basketField: document.getElementById(TRANSPORT_BASKET_FIELD_ID),
        netCanvas: document.getElementById(TRANSPORT_NET_CANVAS_ID),
        basketCanvas: document.getElementById(TRANSPORT_BASKET_CANVAS_ID),
        netCursor: document.getElementById(TRANSPORT_NET_CURSOR_ID)
    };
}

export function ensureTransportModeLayer() {
    ensureHeaderTransportToggleButton();

    const elements = getTransportModeElements();
    if (elements.layer) {
        return elements;
    }

    createTransportLayer();
    return getTransportModeElements();
}

export function renderTransportModeLayerView(snapshot) {
    const elements = ensureTransportModeLayer();

    const enabled = snapshot?.enabled === true;
    const netCursorVisible = enabled && snapshot?.netCursor?.visible === true;

    if (elements.layer) {
        elements.layer.classList.toggle("hidden", !enabled);
        renderTransportNetDropStackVisual(elements.layer);
    }

    if (elements.toggleBtn) {
        elements.toggleBtn.textContent = enabled ? "Transfer Cancel" : "Transfer";
        elements.toggleBtn.classList.toggle("header-transport-mode-btn-active", enabled);
    }

    if (elements.netCursor && elements.layer) {
        renderTransportNetStackVisual(elements.netCursor, snapshot);

        const layerRect = elements.layer.getBoundingClientRect();
        const localX = Number.isFinite(snapshot?.netCursor?.clientX) ? snapshot.netCursor.clientX - layerRect.left : -9999;
        const localY = Number.isFinite(snapshot?.netCursor?.clientY) ? snapshot.netCursor.clientY - layerRect.top : -9999;

        elements.netCursor.classList.toggle("hidden", !netCursorVisible);
        elements.netCursor.style.transform = `translate(${Math.round(localX)}px, ${Math.round(localY)}px)`;
    }
}
