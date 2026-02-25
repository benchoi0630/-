// 파일 역할: net 포집 완료 시점의 drop 좌표를 바구니 물리 레이어 좌표로 전달한다.
// 핵심 책임: 커밋 직후 transport 바구니 아이템을 클라이언트 좌표 기준으로 즉시 재배치한다.
// 연동 범위: net source hooks가 controller를 통해 호출하는 handoff 유틸이다.

import { placeBasketItemsAtClientPoint } from "../../../modules/basketPhysics/index.js";
import { getTransportModeElements } from "../transportModeView.js";

export function placeTransportItemsAtDropPoint(itemIds, clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
    }

    const basketCanvas = getTransportModeElements().basketCanvas;
    if (!(basketCanvas instanceof HTMLCanvasElement)) {
        return;
    }

    placeBasketItemsAtClientPoint({
        canvas: basketCanvas,
        itemIds,
        clientX,
        clientY
    });
}
