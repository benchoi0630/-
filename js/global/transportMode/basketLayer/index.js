// 파일 역할: 운송 바구니 레이어 초기화(init)와 입력/렌더 어댑터 조립을 담당한다.
// 핵심 책임: 바구니 입력 인터랙션과 basket physics 렌더를 묶어 controller가 단일 인터페이스로 사용하게 한다.
// 연동 범위: transportMode controller가 호출하는 basket layer 전용 엔트리 모듈이다.

import { createTransportBasketInteraction } from "./transportModeBasketInteraction.js";
import { renderTransportBasketLayer } from "./transportModeBasketLayer.js";

export function initTransportBasketLayer(options = {}) {
    const isTransportBasketInteractionAllowed = typeof options?.isTransportBasketInteractionAllowed === "function"
        ? options.isTransportBasketInteractionAllowed
        : () => false;
    const getTransportElements = typeof options?.getTransportElements === "function"
        ? options.getTransportElements
        : () => ({});
    const onMerchantDrop = typeof options?.onMerchantDrop === "function"
        ? options.onMerchantDrop
        : () => {};

    const basketInteraction = createTransportBasketInteraction({
        isTransportBasketInteractionAllowed,
        getTransportElements,
        onMerchantDrop
    });

    function renderBasketLayers(renderOptions = {}) {
        renderTransportBasketLayer({
            ...renderOptions,
            transportPointerHooks: basketInteraction.buildTransportBasketPointerHooks()
        });
    }

    return {
        renderBasketLayers,
        handleBasketCanvasClick: basketInteraction.handleTransportBasketCanvasClick,
        resetBasketLayerInteraction: basketInteraction.resetBasketInteractionState
    };
}
