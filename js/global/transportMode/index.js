// 파일 역할: 운송모드 전역 API 엔트리다.
// 핵심 책임: 외부 모듈이 transportMode 내부 구조를 몰라도 단일 진입점으로 제어하게 한다.
// 연동 범위: globalController, warehouseIndex가 동일 API를 통해 운송모드를 제어한다.

export {
    buildTransportModeSourcePointerHooks,
    clearTransportModeExternalCursor,
    endTransportModeExternalSweep,
    getTransportModeElementsForDebug,
    handleTransportModeSourceTap,
    initTransportMode,
    isTransportModeEnabled,
    moveTransportModeExternalSweep,
    renderTransportModeLayer,
    setTransportModeVisibleItems,
    startTransportModeExternalSweep,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK,
    toggleTransportMode,
    updateTransportModeExternalCursor
} from "./transportMode.js";
