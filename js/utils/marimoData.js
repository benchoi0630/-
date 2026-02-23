// 파일 역할: 마리모 데이터(부피/지름/타입/id) 변환·조회 유틸을 모아 둔 파일이다.
// 핵심 책임: 부피↔지름 계산과 메인 마리모 존재 여부 판별 등 기본 연산을 제공한다.
// 연동 범위: 여러 페이지/모듈이 공유하는 마리모 도메인 기초 함수를 담당한다.

// 이 파일은 페이지 간에 공통으로 쓰는 마리모 데이터 유틸을 제공한다.

/** 이 함수는 유효한 마리모 부피 값을 반환한다. */
export function getMarimoVolume(item) {
    return Number.isFinite(item?.volume) ? item.volume : 0;
}

/** 이 함수는 부피를 프로젝트 공용 공식으로 지름 값으로 변환한다. */
export function volumeToDiameter(volume) {
    const radius = Math.cbrt((3 * volume) / (4 * Math.PI));
    return 2 * radius;
}

/** 이 함수는 지름을 프로젝트 공용 공식으로 부피 값으로 변환한다. */
export function diameterToVolume(diameter) {
    const radius = Math.max(0, diameter) / 2;
    return (4 / 3) * Math.PI * (radius ** 3);
}

/** 이 함수는 아이템의 저장 지름을 우선 사용하고 없으면 부피로 지름을 계산한다. */
export function getMarimoDiameter(item) {
    if (Number.isFinite(item?.diameter)) {
        return item.diameter;
    }

    return volumeToDiameter(getMarimoVolume(item));
}

/** 이 함수는 유효한 마리모 타입 문자열을 반환한다. */
export function getMarimoType(item) {
    return typeof item?.type === "string" ? item.type : "normal";
}

/** 이 함수는 현재 상태에서 메인 슬롯에 유효한 마리모가 있는지 반환한다. */
export function hasMainMarimo(currentState) {
    return Boolean(
        currentState?.mainSlotStatus !== "empty"
        && currentState?.marimo
        && typeof currentState.marimo === "object"
        && Number.isFinite(currentState.marimo.volume)
        && currentState.marimo.volume > 0
    );
}

/** 이 함수는 창고 레코드용 고유 식별자를 생성한다. */
export function createMarimoRecordId(prefix = "marimo") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
