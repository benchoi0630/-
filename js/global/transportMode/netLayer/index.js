// 파일 역할: 뜰채(net) 레이어 초기화(init)와 공개 상수를 묶는 엔트리를 제공한다.
// 핵심 책임: source hooks 인스턴스 생성과 net interaction reset 함수를 controller에 전달한다.
// 연동 범위: transportMode controller 및 facade(index)가 참조하는 net layer 진입점이다.

import {
    resetTransportNetInteraction,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
} from "./transportModeNetInteraction.js";
import { createTransportModeSourceHooks } from "./transportModeSourceHooks.js";

export function initTransportNetLayer(options = {}) {
    return {
        sourceHooks: createTransportModeSourceHooks(options),
        resetNetLayerInteraction: resetTransportNetInteraction
    };
}

export {
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
};
