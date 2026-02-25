// 파일 역할: transport mode 공개 API를 한곳에서 재수출하는 퍼사드 엔트리다.
// 핵심 책임: controller 구현과 상수 모듈을 묶어 외부 import 경로를 안정적으로 유지한다.
// 연동 범위: globalController, warehouse, shop, detail modal이 공통으로 사용하는 진입점이다.

export {
    buildTransportModeSourcePointerHooks,
    clearTransportModeExternalCursor,
    consumeTransportModeItemsByIds,
    endTransportModeExternalSweep,
    getTransportModeTransportItems,
    handleTransportModeSourceTap,
    initTransportMode,
    moveTransportModeExternalSweep,
    renderTransportModeLayer,
    setTransportModeBasketDropHandler,
    setTransportModeVisibleItems,
    startTransportModeExternalSweep,
    toggleTransportMode
} from "./transportModeController.js";

export {
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
} from "./netLayer/index.js";

export { TRANSPORT_WAREHOUSE_CHANGED_EVENT } from "./transportModeTransfer.js";
export { isTransportModeEnabled } from "./transportModeState.js";
