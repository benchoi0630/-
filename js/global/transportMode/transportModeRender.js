// 파일 역할: 운송모드 전역 레이어의 시각 렌더를 담당한다.
// 핵심 책임: body 클래스 동기화와 view/physics 렌더 호출 순서를 일관되게 유지한다.
// 연동 범위: transportMode controller가 상태 변경 시 이 모듈을 호출한다.

import { renderTransportModePhysics } from "./transportModePhysics.js";
import { getTransportModeRuntimeState } from "./transportModeState.js";
import { ensureTransportModeLayer, renderTransportModeLayerView } from "./transportModeView.js";

function syncTransportModeBodyClass(isEnabled) {
    if (!(document.body instanceof HTMLElement)) {
        return;
    }

    document.body.classList.toggle("transport-mode-enabled", isEnabled === true);
}

export function renderTransportMode() {
    const snapshot = getTransportModeRuntimeState();
    const elements = ensureTransportModeLayer();
    syncTransportModeBodyClass(snapshot.enabled === true);

    renderTransportModeLayerView(snapshot);
    renderTransportModePhysics({
        enabled: snapshot.enabled,
        pendingItems: snapshot.pendingItems,
        transportItems: snapshot.transportItems,
        netCanvas: elements.netCanvas,
        basketCanvas: elements.basketCanvas
    });
}
