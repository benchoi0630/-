// 파일 역할: 운송모드 캔버스(뜰채/운송 바구니)의 basket physics 런타임을 제어한다.
// 핵심 책임: 모드 상태와 아이템 배열에 따라 각 캔버스의 애니메이션 시작/중지를 수행한다.
// 연동 범위: transportMode controller가 렌더 단계마다 호출하는 물리 어댑터다.

import { getMarimoVolume } from "../../utils/marimoData.js";
import { startBasketAnimation, stopBasketAnimation } from "../../modules/basketPhysics/index.js";

const NET_MAX_RENDER_COUNT = 24;
const BASKET_MAX_RENDER_COUNT = 60;
const TRANSPORT_BASKET_IMAGE_SRC = new URL("../../ui/assets/basket small.PNG", import.meta.url).href;

function isCanvasElement(node) {
    return typeof HTMLCanvasElement !== "undefined" && node instanceof HTMLCanvasElement;
}

function getRepresentativeVolume(items) {
    if (!Array.isArray(items) || items.length <= 0) {
        return 0;
    }

    let total = 0;
    for (let i = 0; i < items.length; i += 1) {
        total += getMarimoVolume(items[i]);
    }

    return total / items.length;
}

function readCanvasSize(canvas, fallbackWidth, fallbackHeight) {
    const rect = canvas.getBoundingClientRect();
    const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : (canvas.clientWidth || fallbackWidth);
    const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : (canvas.clientHeight || fallbackHeight);

    return {
        width: Math.max(180, Math.round(width)),
        height: Math.max(120, Math.round(height))
    };
}

function renderFieldPhysics(options) {
    const canvas = options.canvas;
    const items = Array.isArray(options.items) ? options.items : [];
    const enabled = options.enabled === true;

    if (!isCanvasElement(canvas)) {
        return;
    }

    const allowEmpty = options.allowEmpty === true;

    if (!enabled || (!allowEmpty && items.length <= 0)) {
        stopBasketAnimation({ canvas });
        return;
    }

    const size = readCanvasSize(canvas, options.fallbackWidth, options.fallbackHeight);

    startBasketAnimation({
        canvas,
        items,
        stackRepresentativeVolume: getRepresentativeVolume(items),
        onSelectItem: () => {},
        physicsWidth: size.width,
        physicsHeight: size.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        maxRenderCount: options.maxRenderCount,
        basketImageSrc: options.basketImageSrc,
        allowEmpty,
        drawBasketShape: options.drawBasketShape
    });
}

export function renderTransportModePhysics(options = {}) {
    const enabled = options?.enabled === true;

    renderFieldPhysics({
        enabled,
        canvas: options.netCanvas,
        items: options.pendingItems,
        maxRenderCount: NET_MAX_RENDER_COUNT,
        fallbackWidth: 360,
        fallbackHeight: 620,
        basketImageSrc: options.netBasketImageSrc,
        allowEmpty: true,
        drawBasketShape: false
    });

    renderFieldPhysics({
        enabled,
        canvas: options.basketCanvas,
        items: options.transportItems,
        maxRenderCount: BASKET_MAX_RENDER_COUNT,
        fallbackWidth: 360,
        fallbackHeight: 620,
        basketImageSrc: options.transportBasketImageSrc || TRANSPORT_BASKET_IMAGE_SRC,
        allowEmpty: true,
        drawBasketShape: true
    });
}
