// 파일 역할: basket physics로 운송 바구니/뜨룰채 캔버스 레이어를 구동한다.
// 핵심 책임: 운송모드 상태에 따라 net/basket 캔버스 애니메이션의 시작·중지를 제어한다.
// 연동 범위: basketLayer index가 호출해 transport controller 렌더 단계에 연결되는 어댑터다.

import { getMarimoVolume } from "../../../utils/marimoData.js";
import { startBasketAnimation, stopBasketAnimation } from "../../../modules/basketPhysics/index.js";
import { getTransportNetRenderablePendingItems } from "../netLayer/visualiseStackedMarimo.js";

const NET_MAX_RENDER_COUNT = 24;
const BASKET_MAX_RENDER_COUNT = 60;
const TRANSPORT_BASKET_IMAGE_SRC = new URL("../../../ui/assets/basket small.PNG", import.meta.url).href;

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
        pointerHooks: options.pointerHooks,
        physicsWidth: size.width,
        physicsHeight: size.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        maxRenderCount: options.maxRenderCount,
        basketImageSrc: options.basketImageSrc,
        allowEmpty,
        drawBasketShape: options.drawBasketShape
    });
}

export function renderTransportBasketLayer(options = {}) {
    const enabled = options?.enabled === true;
    const netRenderablePendingItems = getTransportNetRenderablePendingItems(options.pendingItems);

    renderFieldPhysics({
        enabled,
        canvas: options.netCanvas,
        items: netRenderablePendingItems,
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
        pointerHooks: options.transportPointerHooks,
        maxRenderCount: BASKET_MAX_RENDER_COUNT,
        fallbackWidth: 360,
        fallbackHeight: 620,
        basketImageSrc: options.transportBasketImageSrc || TRANSPORT_BASKET_IMAGE_SRC,
        allowEmpty: true,
        drawBasketShape: true
    });
}
