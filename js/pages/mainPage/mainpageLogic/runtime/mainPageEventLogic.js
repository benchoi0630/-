// 파일 역할: 메인 페이지 입력 이벤트를 DOM 요소에 바인딩하는 계층이다.
// 핵심 책임: 중복 방지 바인딩, 영양제 클릭, 굴림 드래그 입력 연결을 일관되게 처리한다.
// 연동 범위: mainPageIndex가 전달한 액션 핸들러를 실제 UI 이벤트와 연결한다.

import { bindEventOnce } from "../../../../utils/domEvents.js";
import { calculateRollingSurfaceDistance } from "../mainPageActionLogic.js";

const DRAG_CLICK_CANCEL_DISTANCE = 6;

let devDisplayListenerBound = false;
let activePointerId = null;
let lastPointerX = 0;
let lastPointerY = 0;
let draggedDistance = 0;
let suppressNextClick = false;

function resetPointerSession() {
    activePointerId = null;
    lastPointerX = 0;
    lastPointerY = 0;
    draggedDistance = 0;
}

export function bindMainEvents(options = {}) {
    const getMainElements = typeof options.getMainElements === "function" ? options.getMainElements : () => ({});
    const onMainMarimoClick = typeof options.onMainMarimoClick === "function" ? options.onMainMarimoClick : () => {};
    const onRolling = typeof options.onRolling === "function" ? options.onRolling : () => {};
    const onRollingEnd = typeof options.onRollingEnd === "function" ? options.onRollingEnd : () => {};
    const onSplit = typeof options.onSplit === "function" ? options.onSplit : () => {};
    const onSplitUp = typeof options.onSplitUp === "function" ? options.onSplitUp : () => {};
    const onSplitDown = typeof options.onSplitDown === "function" ? options.onSplitDown : () => {};
    const onSendToWarehouse = typeof options.onSendToWarehouse === "function" ? options.onSendToWarehouse : () => {};

    const elements = getMainElements();

    bindEventOnce(elements.marimo, "click", "listenerMainMarimoBound", (event) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            event.preventDefault();
            return;
        }

        onMainMarimoClick();
    });

    bindEventOnce(elements.marimo, "pointerdown", "listenerMainMarimoPointerDownBound", (event) => {
        if (!Number.isFinite(event.pointerId)) {
            return;
        }

        activePointerId = event.pointerId;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        draggedDistance = 0;

        if (typeof elements.marimo?.setPointerCapture === "function") {
            try {
                elements.marimo.setPointerCapture(event.pointerId);
            } catch (error) {
                void error;
            }
        }
    });

    bindEventOnce(elements.marimo, "pointermove", "listenerMainMarimoPointerMoveBound", (event) => {
        if (event.pointerId !== activePointerId) {
            return;
        }

        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;

        const rollingInput = calculateRollingSurfaceDistance(dx, dy);
        if (rollingInput.distanceAbs <= 0) {
            return;
        }

        draggedDistance += rollingInput.distanceAbs;
        onRolling({
            rollingSurfaceDistance: rollingInput.signedDistance,
            rollingSurfaceDistanceAbs: rollingInput.distanceAbs
        });
    });

    const handlePointerEnd = (event) => {
        if (event.pointerId !== activePointerId) {
            return;
        }

        if (draggedDistance > DRAG_CLICK_CANCEL_DISTANCE) {
            suppressNextClick = true;
        }

        resetPointerSession();
        onRollingEnd();
    };

    bindEventOnce(elements.marimo, "pointerup", "listenerMainMarimoPointerUpBound", handlePointerEnd);
    bindEventOnce(elements.marimo, "pointercancel", "listenerMainMarimoPointerCancelBound", handlePointerEnd);

    bindEventOnce(elements.splitBtn, "click", "listenerSplitBound", onSplit);
    bindEventOnce(elements.splitUpBtn, "click", "listenerSplitUpBound", onSplitUp);
    bindEventOnce(elements.splitDownBtn, "click", "listenerSplitDownBound", onSplitDown);
    bindEventOnce(elements.sendToWarehouseBtn, "click", "listenerSendWarehouseBound", onSendToWarehouse);
}

export function bindDevDisplayEvents(renderMainPage) {
    if (devDisplayListenerBound) {
        return;
    }

    window.addEventListener("marimo:dev-display-config-changed", () => {
        if (typeof renderMainPage === "function") {
            renderMainPage();
        }
    });

    devDisplayListenerBound = true;
}
