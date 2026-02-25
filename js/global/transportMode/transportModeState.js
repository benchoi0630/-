// 파일 역할: 운송모드 런타임 상태를 전역 싱글톤으로 관리한다.
// 핵심 책임: 모드 on/off, 임시 뜰채/운송 바구니 아이템 배열을 안전하게 보관한다.
// 연동 범위: transportMode controller/view/physics가 공통으로 참조한다.

const runtimeState = {
    enabled: false,
    pendingItems: [],
    transportItems: [],
    sourceItems: [],
    netCursor: {
        visible: false,
        clientX: 0,
        clientY: 0
    }
};

function toSafeItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .filter((item) => item && typeof item === "object")
        .map((item) => ({ ...item }));
}

export function getTransportModeRuntimeState() {
    return {
        enabled: runtimeState.enabled,
        pendingItems: [...runtimeState.pendingItems],
        transportItems: [...runtimeState.transportItems],
        sourceItems: [...runtimeState.sourceItems],
        netCursor: {
            visible: runtimeState.netCursor.visible === true,
            clientX: runtimeState.netCursor.clientX,
            clientY: runtimeState.netCursor.clientY
        }
    };
}

export function isTransportModeEnabled() {
    return runtimeState.enabled === true;
}

export function setTransportModeEnabled(nextEnabled) {
    runtimeState.enabled = nextEnabled === true;
}

export function setTransportModePendingItems(items) {
    runtimeState.pendingItems = toSafeItems(items);
}

export function setTransportModeTransportItems(items) {
    runtimeState.transportItems = toSafeItems(items);
}

export function setTransportModeSourceItems(items) {
    runtimeState.sourceItems = toSafeItems(items);
}

export function clearTransportModeItems() {
    runtimeState.pendingItems = [];
    runtimeState.transportItems = [];
}

export function setTransportModeNetCursor(nextCursor) {
    const safeCursor = nextCursor && typeof nextCursor === "object" ? nextCursor : {};
    runtimeState.netCursor.visible = safeCursor.visible === true;
    runtimeState.netCursor.clientX = Number.isFinite(safeCursor.clientX) ? safeCursor.clientX : runtimeState.netCursor.clientX;
    runtimeState.netCursor.clientY = Number.isFinite(safeCursor.clientY) ? safeCursor.clientY : runtimeState.netCursor.clientY;
}

export function clearTransportModeNetCursor() {
    runtimeState.netCursor.visible = false;
}
