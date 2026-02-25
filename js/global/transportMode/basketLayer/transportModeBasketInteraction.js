// 파일 역할: 운송 바구니 캔버스 입력과 상인 드롭 판정을 전담한다.
// 핵심 책임: click passthrough, 중복 클릭 suppression, 바구니 drag 세션 상태를 관리한다.
// 연동 범위: transportMode controller가 생성해 render/bind 단계에서 사용하는 입력 어댑터다.

export function createTransportBasketInteraction(options = {}) {
    const isTransportBasketInteractionAllowed = typeof options?.isTransportBasketInteractionAllowed === "function"
        ? options.isTransportBasketInteractionAllowed
        : () => false;
    const getTransportElements = typeof options?.getTransportElements === "function"
        ? options.getTransportElements
        : () => ({});
    const onMerchantDrop = typeof options?.onMerchantDrop === "function"
        ? options.onMerchantDrop
        : () => {};

    let suppressTransportBasketCanvasClick = false;
    let suppressTransportBasketCanvasClickUntilMs = 0;

    const activeTransportBasketDragSession = {
        pointerId: null,
        itemId: "",
        moved: false
    };

    function resetTransportBasketDragSession() {
        activeTransportBasketDragSession.pointerId = null;
        activeTransportBasketDragSession.itemId = "";
        activeTransportBasketDragSession.moved = false;
    }

    function consumeTransportBasketCanvasClickSuppression() {
        if (suppressTransportBasketCanvasClick !== true) {
            return false;
        }

        if (Date.now() > suppressTransportBasketCanvasClickUntilMs) {
            suppressTransportBasketCanvasClick = false;
            suppressTransportBasketCanvasClickUntilMs = 0;
            return false;
        }

        suppressTransportBasketCanvasClick = false;
        suppressTransportBasketCanvasClickUntilMs = 0;
        return true;
    }

    function markTransportBasketCanvasClickSuppressed() {
        suppressTransportBasketCanvasClick = true;
        suppressTransportBasketCanvasClickUntilMs = Date.now() + 480;
    }

    function resolveUnderlyingElementAtClientPoint(clientX, clientY) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
            return null;
        }

        const elements = getTransportElements();
        const basketCanvas = elements.basketCanvas;
        if (!(basketCanvas instanceof HTMLCanvasElement)) {
            return null;
        }

        const previousPointerEvents = basketCanvas.style.pointerEvents;
        basketCanvas.style.pointerEvents = "none";

        let target = null;
        try {
            target = document.elementFromPoint(clientX, clientY);
        } finally {
            basketCanvas.style.pointerEvents = previousPointerEvents;
        }

        return target;
    }

    function resolveMerchantDropTargetFromClientPoint(clientX, clientY) {
        const underlyingTarget = resolveUnderlyingElementAtClientPoint(clientX, clientY);
        const merchantNode = underlyingTarget?.closest?.(".merchant-card[data-merchant-id]");
        const merchantId = merchantNode?.dataset?.merchantId;
        if (!(merchantNode instanceof HTMLElement) || typeof merchantId !== "string" || merchantId.length <= 0) {
            return null;
        }

        return {
            merchantId,
            merchantNode
        };
    }

    function dispatchPassthroughClick(target, sourceEvent) {
        if (!(target instanceof Element) || typeof MouseEvent !== "function") {
            return;
        }

        const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: Number.isFinite(sourceEvent?.clientX) ? sourceEvent.clientX : 0,
            clientY: Number.isFinite(sourceEvent?.clientY) ? sourceEvent.clientY : 0,
            button: 0,
            ctrlKey: sourceEvent?.ctrlKey === true,
            shiftKey: sourceEvent?.shiftKey === true,
            altKey: sourceEvent?.altKey === true,
            metaKey: sourceEvent?.metaKey === true
        });
        target.dispatchEvent(clickEvent);
    }

    function handleTransportBasketCanvasClick(event) {
        if (!isTransportBasketInteractionAllowed()) {
            return;
        }

        if (consumeTransportBasketCanvasClickSuppression()) {
            if (event.cancelable) {
                event.preventDefault();
            }
            event.stopPropagation();
            return;
        }

        const passthroughTarget = resolveUnderlyingElementAtClientPoint(event.clientX, event.clientY);
        if (!(passthroughTarget instanceof Element)) {
            return;
        }

        const transportLayer = getTransportElements().layer;
        if (transportLayer instanceof HTMLElement && passthroughTarget.closest?.(`#${transportLayer.id}`)) {
            return;
        }

        dispatchPassthroughClick(passthroughTarget, event);

        if (event.cancelable) {
            event.preventDefault();
        }
        event.stopPropagation();
    }

    function buildTransportBasketPointerHooks() {
        return {
            onDragStart: (payload) => {
                if (!isTransportBasketInteractionAllowed()) {
                    resetTransportBasketDragSession();
                    return;
                }

                activeTransportBasketDragSession.pointerId = Number.isFinite(payload?.pointerId) ? payload.pointerId : null;
                activeTransportBasketDragSession.itemId = typeof payload?.itemId === "string" ? payload.itemId : "";
                activeTransportBasketDragSession.moved = false;
                if (activeTransportBasketDragSession.itemId) {
                    markTransportBasketCanvasClickSuppressed();
                }
            },
            onDragMove: (payload) => {
                if (!isTransportBasketInteractionAllowed()) {
                    return;
                }

                const pointerId = payload?.pointerId;
                if (!Number.isFinite(pointerId) || pointerId !== activeTransportBasketDragSession.pointerId) {
                    return;
                }

                if (payload?.moved === true) {
                    activeTransportBasketDragSession.moved = true;
                }
            },
            onTap: () => true,
            onDragEnd: (payload) => {
                const pointerId = payload?.pointerId;
                const isActiveSession = Number.isFinite(pointerId) && pointerId === activeTransportBasketDragSession.pointerId;
                const draggedItemId = activeTransportBasketDragSession.itemId;
                const moved = payload?.moved === true || activeTransportBasketDragSession.moved === true;

                // 드래그가 길어질 수 있어 start 시점 suppression 만으로는 click passthrough를 막지 못한다.
                // end 시점에도 suppression을 갱신해 drop 직후 중복 클릭 판매를 차단한다.
                if (isActiveSession && draggedItemId) {
                    markTransportBasketCanvasClickSuppressed();
                }

                resetTransportBasketDragSession();

                if (!isActiveSession || !draggedItemId || !moved || !isTransportBasketInteractionAllowed()) {
                    return;
                }

                const dropTarget = resolveMerchantDropTargetFromClientPoint(payload?.clientX, payload?.clientY);
                if (!dropTarget) {
                    return;
                }

                try {
                    onMerchantDrop({
                        itemId: draggedItemId,
                        merchantId: dropTarget.merchantId,
                        merchantNode: dropTarget.merchantNode,
                        clientX: payload?.clientX,
                        clientY: payload?.clientY
                    });
                } catch {
                    // drop handler 내부 실패로 transport 입력 흐름이 중단되지 않게 보호한다.
                }
            }
        };
    }

    function resetBasketInteractionState() {
        resetTransportBasketDragSession();
        suppressTransportBasketCanvasClick = false;
        suppressTransportBasketCanvasClickUntilMs = 0;
    }

    return {
        handleTransportBasketCanvasClick,
        buildTransportBasketPointerHooks,
        resetBasketInteractionState
    };
}
