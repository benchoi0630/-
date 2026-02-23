// 파일 역할: 운송모드에서 공유되는 식별자와 튜닝 상수를 모은다.
// 핵심 책임: source kind와 포집 반경/지연 시간 등 하드코딩 값을 중앙에서 관리한다.
// 연동 범위: transportMode controller/interaction/queue 모듈이 공통으로 참조한다.

export const TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN = "warehouse-main-basket";
export const TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK = "warehouse-stack-basket";
export const TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST = "warehouse-no-stack-list";

export const NET_CAPTURE_RADIUS = 56;
export const NET_PULL_STRENGTH = 0.34;
export const TAP_COMMIT_DELAY_MS = 130;
export const DRAG_COMMIT_DELAY_MS = 180;
export const TRANSPORT_WAREHOUSE_CHANGED_EVENT = "marimo:transport-warehouse-changed";

export function isSupportedTransportSourceKind(sourceKind) {
    return sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN
        || sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_STACK
        || sourceKind === TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST;
}
