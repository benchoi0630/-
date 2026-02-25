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
let dragStartedOnMarimo = false;

function resetPointerSession() {
    activePointerId = null;
    lastPointerX = 0;
    lastPointerY = 0;
    draggedDistance = 0;
    dragStartedOnMarimo = false;
}

function shouldIgnoreRollingPointerDown(target) {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(target.closest("button, a, input, textarea, select, label, [data-no-roll='true']"));
}

function isTransportModeDraggingBlockEnabled() {
    if (!(document.body instanceof HTMLElement)) {
        return false;
    }

    return document.body.classList.contains("transport-mode-enabled");
}

function getMarimoCenterClientPoint(elements) {
    if (!(elements?.marimo instanceof HTMLElement)) {
        return null;
    }

    const rect = elements.marimo.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2)
    };
}

export function bindMainEvents(options = {}) {
    const getMainElements = typeof options.getMainElements === "function" ? options.getMainElements : () => ({});
    const onMainMarimoClick = typeof options.onMainMarimoClick === "function" ? options.onMainMarimoClick : () => {};
    const onRollingStart = typeof options.onRollingStart === "function" ? options.onRollingStart : () => {};
    const onRolling = typeof options.onRolling === "function" ? options.onRolling : () => {};
    const onRollingEnd = typeof options.onRollingEnd === "function" ? options.onRollingEnd : () => {};
    const onSplit = typeof options.onSplit === "function" ? options.onSplit : () => {};
    const onSplitUp = typeof options.onSplitUp === "function" ? options.onSplitUp : () => {};
    const onSplitDown = typeof options.onSplitDown === "function" ? options.onSplitDown : () => {};
    const onToggleMarimoFixed = typeof options.onToggleMarimoFixed === "function" ? options.onToggleMarimoFixed : () => {};
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

    bindEventOnce(elements.mainPage, "pointerdown", "listenerMainMarimoPointerDownBound", (event) => {
        if (!Number.isFinite(event.pointerId)) {
            return;
        }
        if (isTransportModeDraggingBlockEnabled()) {
            return;
        }
        if (shouldIgnoreRollingPointerDown(event.target)) {
            return;
        }

        activePointerId = event.pointerId;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        draggedDistance = 0;
        dragStartedOnMarimo = Boolean(event.target instanceof Element && event.target.closest("#marimo"));
        onRollingStart();

        if (typeof elements.mainPage?.setPointerCapture === "function") {
            try {
                elements.mainPage.setPointerCapture(event.pointerId);
            } catch (error) {
                void error;
            }
        }

    });

    bindEventOnce(elements.mainPage, "pointermove", "listenerMainMarimoPointerMoveBound", (event) => {
        if (event.pointerId !== activePointerId) {
            return;
        }

        if (isTransportModeDraggingBlockEnabled()) {
            resetPointerSession();
            onRollingEnd();
            return;
        }

        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;

        const centerPoint = getMarimoCenterClientPoint(elements);
        const rollingInput = calculateRollingSurfaceDistance(dx, dy, {
            centerX: centerPoint?.x,
            centerY: centerPoint?.y,
            pointX: event.clientX,
            pointY: event.clientY
        });
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

        if (dragStartedOnMarimo) {
            if (draggedDistance > DRAG_CLICK_CANCEL_DISTANCE) {
                suppressNextClick = true;
            } else {
                // pointer capture 환경에서도 탭 영양제 동작을 안정적으로 보장한다.
                suppressNextClick = true;
                onMainMarimoClick();
            }
        }

        resetPointerSession();
        onRollingEnd();
    };

    bindEventOnce(elements.mainPage, "pointerup", "listenerMainMarimoPointerUpBound", handlePointerEnd);
    bindEventOnce(elements.mainPage, "pointercancel", "listenerMainMarimoPointerCancelBound", handlePointerEnd);
    bindEventOnce(elements.mainPage, "lostpointercapture", "listenerMainMarimoLostCaptureBound", handlePointerEnd);

    bindEventOnce(elements.splitBtn, "click", "listenerSplitBound", onSplit);
    bindEventOnce(elements.splitUpBtn, "click", "listenerSplitUpBound", onSplitUp);
    bindEventOnce(elements.splitDownBtn, "click", "listenerSplitDownBound", onSplitDown);
    bindEventOnce(elements.marimoFixToggleBtn, "click", "listenerMarimoFixToggleBound", onToggleMarimoFixed);
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
