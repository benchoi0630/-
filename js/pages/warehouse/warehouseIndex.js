// 파일 역할: 창고 페이지 엔트리로 물리 보기/리스트 보기 전환과 렌더를 총괄한다.
// 핵심 책임: 창고 메시지, 토글 버튼, 스택 모드, 상세 모달 진입 이벤트를 연결한다.
// 연동 범위: warehouse 관련 하위 모듈을 조합하는 오케스트레이션 파일이다.

import { state, saveState } from "../../state.js";
import { renderMarimoStackVisual } from "../../modules/marimoStackVisual.js";
import { getMarimoVolume } from "../../utils/marimoData.js";
import { initWarehouseDetailModal, openWarehouseItemDetail, openWarehouseStackDetail } from "./detailModal/detailModal.js";
import { cycleStackMode, ensureStackModeButton, getCurrentStackMode, renderStackModeButton, renderWarehouseByMode } from "./stacking.js";
import { startBasketAnimation, stopBasketAnimation } from "../../modules/basketPhysics/index.js";
import { bindEventOnce } from "../../utils/domEvents.js";
import {
    buildTransportModeSourcePointerHooks,
    endTransportModeExternalSweep,
    handleTransportModeSourceTap,
    isTransportModeEnabled,
    moveTransportModeExternalSweep,
    setTransportModeVisibleItems,
    startTransportModeExternalSweep,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
    TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST
} from "../../global/transportMode/index.js";

// 이 변수는 창고 메시지 자동 삭제 타이머를 저장한다.
let clearWarehouseMessageTimerId = null;
let warehouseViewMode = "physics";
let activeWarehousePhysicsCanvas = null;
const noStackSweepState = {
    pointerId: null
};
const STACK_CARD_CAPTURE_INITIAL_DELAY_MS = 430;
const STACK_CARD_CAPTURE_MIN_DELAY_MS = 78;
const STACK_CARD_CAPTURE_ACCELERATION = 0.82;
const STACK_CARD_CLICK_SUPPRESS_MS = 380;
const STACK_CARD_SWEEP_ACTIVATE_DISTANCE_SQ = 64;
const stackCardSweepState = {
    pointerId: null,
    activeCard: null,
    holdTimerId: null,
    sweepStarted: false,
    startClientX: 0,
    startClientY: 0,
    nextDelayMs: STACK_CARD_CAPTURE_INITIAL_DELAY_MS,
    lastClientX: 0,
    lastClientY: 0
};
let suppressStackedCardClickUntilMs = 0;

/** 이 함수는 창고 페이지 모듈을 초기화하고 렌더 함수를 반환한다. */
export function initWarehousePage(options = {}) {
    initWarehouseDetailModal({
        renderWarehousePage,
        renderMainPage: options.renderMainPage,
        showWarehouseMessage: setWarehouseMessage
    });
    bindWarehouseEvents();

    return {
        renderWarehousePage
    };
}

/** 이 함수는 현재 스택 모드에 맞춰 창고 목록과 메시지 영역을 렌더링한다. */
export function renderWarehousePage() {
    const elements = getWarehouseElements();
    if (!elements.warehouseGrid || !elements.warehouseEmptyText || !elements.warehousePageContent) {
        return;
    }

    renderWarehouseViewToggleButton(elements);
    ensureWarehouseMessage(elements);
    setTransportModeVisibleItems({
        sourceItems: state.warehouse
    });

    if (warehouseViewMode === "list") {
        renderWarehouseListMode(elements);
        return;
    }

    renderWarehousePhysicsMode(elements);
}

// 이 함수는 창고 스택 모드를 순환하고 상태를 저장한다.
function handleStackModeCycle() {
    cycleStackMode(state);
    saveState();
    renderWarehousePage();
}

// 이 함수는 창고 표시 모드를 리스트/물리 보기로 전환한다.
function handleWarehouseViewToggle() {
    warehouseViewMode = warehouseViewMode === "physics" ? "list" : "physics";
    renderWarehousePage();
}

// 이 함수는 no_stack 모드 아이템 클릭 시 단일 상세 모달을 연다.
function handleNoStackItemClick(itemId) {
    if (getCurrentStackMode(state) !== "no_stack") {
        setWarehouseMessage("Switch to no stack mode to view details.");
        return;
    }

    if (isTransportModeEnabled()) {
        const handledByTransportMode = handleTransportModeSourceTap({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            itemId
        });

        if (handledByTransportMode) {
            markNoStackCardsAsPending([itemId]);
        }
        return;
    }

    openWarehouseItemDetail(itemId);
}

// 이 함수는 스택 카드 클릭 시 스택 상세 모달을 연다.
function handleStackedItemClick(stackMeta) {
    if (Date.now() <= suppressStackedCardClickUntilMs) {
        return;
    }

    openWarehouseStackDetail(stackMeta);
}

// 이 함수는 창고 전용 정적 리스너를 한 번만 바인딩한다.
function bindWarehouseEvents() {
    const elements = getWarehouseElements();
    const viewToggleBtn = ensureWarehouseViewToggleButton(elements);
    const button = ensureStackModeButton(elements);

    bindEventOnce(viewToggleBtn, "click", "listenerWarehouseViewToggleBound", handleWarehouseViewToggle);
    bindEventOnce(button, "click", "listenerWarehouseStackModeBound", handleStackModeCycle);
    bindWarehouseNoStackSweepEvents(elements);
    bindWarehouseStackSweepEvents(elements);
}

function bindWarehouseNoStackSweepEvents(elements) {
    const grid = elements.warehouseGrid;
    if (!grid) {
        return;
    }

    bindEventOnce(grid, "pointerdown", "listenerWarehouseNoStackSweepDownBound", (event) => {
        if (!canUseNoStackSweepCapture()) {
            return;
        }

        const itemId = resolveNoStackItemIdFromNode(event.target);
        if (!itemId) {
            return;
        }

        noStackSweepState.pointerId = event.pointerId;
        const started = startTransportModeExternalSweep({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY
        });

        if (!started) {
            noStackSweepState.pointerId = null;
            return;
        }

        const capturedItemIds = moveTransportModeExternalSweep({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            pointerId: event.pointerId,
            itemId,
            clientX: event.clientX,
            clientY: event.clientY
        });
        markNoStackCardsAsPending(capturedItemIds);

        if (typeof grid.setPointerCapture === "function") {
            try {
                grid.setPointerCapture(event.pointerId);
            } catch {
                // pointer capture를 지원하지 않는 경우를 무시한다.
            }
        }

        if (event.cancelable) {
            event.preventDefault();
        }
    });

    bindEventOnce(grid, "pointermove", "listenerWarehouseNoStackSweepMoveBound", (event) => {
        if (noStackSweepState.pointerId === null || event.pointerId !== noStackSweepState.pointerId) {
            return;
        }

        if (!canUseNoStackSweepCapture()) {
            finishNoStackSweepCapture(event);
            return;
        }

        const targetAtPoint = document.elementFromPoint(event.clientX, event.clientY);
        const itemId = resolveNoStackItemIdFromNode(targetAtPoint);
        const capturedItemIds = moveTransportModeExternalSweep({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            pointerId: event.pointerId,
            itemId,
            clientX: event.clientX,
            clientY: event.clientY
        });
        markNoStackCardsAsPending(capturedItemIds);

        if (event.cancelable) {
            event.preventDefault();
        }
    });

    bindEventOnce(grid, "pointerup", "listenerWarehouseNoStackSweepUpBound", (event) => {
        if (event.pointerId !== noStackSweepState.pointerId) {
            return;
        }

        finishNoStackSweepCapture(event);
    });

    bindEventOnce(grid, "pointercancel", "listenerWarehouseNoStackSweepCancelBound", (event) => {
        if (event.pointerId !== noStackSweepState.pointerId) {
            return;
        }

        finishNoStackSweepCapture(event);
    });

    bindEventOnce(grid, "lostpointercapture", "listenerWarehouseNoStackSweepLostCaptureBound", (event) => {
        if (event.pointerId !== noStackSweepState.pointerId) {
            return;
        }

        finishNoStackSweepCapture(event);
    });
}

function canUseNoStackSweepCapture() {
    return warehouseViewMode === "list"
        && getCurrentStackMode(state) === "no_stack"
        && isTransportModeEnabled();
}

function resolveNoStackItemIdFromNode(node) {
    const card = node?.closest?.(".warehouse-item[data-warehouse-item-id]");
    const itemId = card?.dataset?.warehouseItemId;
    if (typeof itemId === "string" && itemId.length > 0) {
        return itemId;
    }

    return "";
}

function markNoStackCardsAsPending(itemIds) {
    if (!Array.isArray(itemIds) || itemIds.length <= 0) {
        return;
    }

    const elements = getWarehouseElements();
    const grid = elements.warehouseGrid;
    if (!grid) {
        return;
    }

    const targetIdSet = new Set();
    for (let i = 0; i < itemIds.length; i += 1) {
        const itemId = itemIds[i];
        if (typeof itemId === "string" && itemId.length > 0) {
            targetIdSet.add(itemId);
        }
    }

    if (targetIdSet.size <= 0) {
        return;
    }

    const cards = grid.querySelectorAll(".warehouse-item[data-warehouse-item-id]");
    for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i];
        if (!targetIdSet.has(card.dataset.warehouseItemId || "")) {
            continue;
        }

        card.classList.add("warehouse-item-pending-silhouette");
    }
}

function finishNoStackSweepCapture(event) {
    const elements = getWarehouseElements();
    if (elements.warehouseGrid && typeof elements.warehouseGrid.releasePointerCapture === "function") {
        try {
            elements.warehouseGrid.releasePointerCapture(event.pointerId);
        } catch {
            // pointer capture가 이미 해제된 경우를 무시한다.
        }
    }

    endTransportModeExternalSweep({
        sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY
    });
    noStackSweepState.pointerId = null;
}

function clearStackCardSweepHoldTimer() {
    if (!stackCardSweepState.holdTimerId) {
        return;
    }

    clearTimeout(stackCardSweepState.holdTimerId);
    stackCardSweepState.holdTimerId = null;
}

function resetStackCardSweepState() {
    clearStackCardSweepHoldTimer();
    stackCardSweepState.pointerId = null;
    stackCardSweepState.activeCard = null;
    stackCardSweepState.sweepStarted = false;
    stackCardSweepState.startClientX = 0;
    stackCardSweepState.startClientY = 0;
    stackCardSweepState.nextDelayMs = STACK_CARD_CAPTURE_INITIAL_DELAY_MS;
    stackCardSweepState.lastClientX = 0;
    stackCardSweepState.lastClientY = 0;
}

function canUseStackCardSweepCapture() {
    return warehouseViewMode === "list"
        && getCurrentStackMode(state) !== "no_stack"
        && isTransportModeEnabled();
}

function resolveStackCardFromNode(node) {
    const card = node?.closest?.(".warehouse-item[data-warehouse-card-kind='stack-item']");
    return card instanceof HTMLElement ? card : null;
}

function readStackCardItemIds(card) {
    if (!(card instanceof HTMLElement)) {
        return [];
    }

    const rawItemIds = card.dataset.warehouseStackItemIds;
    if (typeof rawItemIds !== "string" || rawItemIds.length <= 0) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawItemIds);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const itemIds = [];
        for (let i = 0; i < parsed.length; i += 1) {
            const itemId = parsed[i];
            if (typeof itemId === "string" && itemId.length > 0) {
                itemIds.push(itemId);
            }
        }
        return itemIds;
    } catch {
        return [];
    }
}

function readStackCardExtractIndex(card) {
    if (!(card instanceof HTMLElement)) {
        return 0;
    }

    const rawIndex = Number.parseInt(card.dataset.warehouseStackExtractIndex || "0", 10);
    if (!Number.isFinite(rawIndex)) {
        return 0;
    }

    return Math.max(0, rawIndex);
}

function writeStackCardExtractIndex(card, nextIndex) {
    if (!(card instanceof HTMLElement)) {
        return;
    }

    const safeIndex = Number.isFinite(nextIndex) ? Math.max(0, Math.floor(nextIndex)) : 0;
    card.dataset.warehouseStackExtractIndex = String(safeIndex);
}

function getStackCardRemainingCount(card) {
    const itemIds = readStackCardItemIds(card);
    const extractedCount = readStackCardExtractIndex(card);
    return Math.max(0, itemIds.length - extractedCount);
}

function buildStackCardSampleMarimo(card) {
    const representativeVolume = Number.parseFloat(card?.dataset?.warehouseStackRepresentativeVolume || "");
    const stackType = typeof card?.dataset?.warehouseStackType === "string" && card.dataset.warehouseStackType.length > 0
        ? card.dataset.warehouseStackType
        : "normal";
    const stackKey = typeof card?.dataset?.warehouseStackKey === "string" ? card.dataset.warehouseStackKey : "stack-preview";

    return {
        id: `stack-preview-${stackKey}`,
        volume: Number.isFinite(representativeVolume) ? representativeVolume : 1,
        type: stackType
    };
}

function updateStackCardVisualState(card) {
    if (!(card instanceof HTMLElement)) {
        return;
    }

    const itemIds = readStackCardItemIds(card);
    const extractedCount = Math.min(itemIds.length, readStackCardExtractIndex(card));
    writeStackCardExtractIndex(card, extractedCount);
    const remainingCount = Math.max(0, itemIds.length - extractedCount);

    const visualNode = card.querySelector(".warehouse-item-visual");
    if (visualNode instanceof HTMLElement) {
        renderMarimoStackVisual(visualNode, {
            marimo: buildStackCardSampleMarimo(card),
            count: remainingCount > 0 ? remainingCount : 1
        });
        visualNode.classList.add("warehouse-item-visual");
    }

    const labelNode = card.querySelector(".warehouse-item-volume");
    if (labelNode instanceof HTMLElement) {
        const baseLabel = card.dataset.warehouseStackLabelBase || labelNode.textContent || "";
        card.dataset.warehouseStackLabelBase = baseLabel;
        labelNode.textContent = remainingCount > 0
            ? `${baseLabel} (${remainingCount})`
            : `${baseLabel} (empty)`;
    }

    card.classList.toggle("warehouse-item-pending-silhouette", remainingCount <= 0);
}

function captureNextStackCardItemBySweep(card, pointerId, clientX, clientY) {
    if (!(card instanceof HTMLElement) || !Number.isFinite(pointerId)) {
        return false;
    }

    const stackItemIds = readStackCardItemIds(card);
    if (stackItemIds.length <= 0) {
        updateStackCardVisualState(card);
        return false;
    }

    let nextIndex = readStackCardExtractIndex(card);
    let captured = false;
    while (nextIndex < stackItemIds.length) {
        const candidateId = stackItemIds[nextIndex];
        const newlyCapturedItemIds = moveTransportModeExternalSweep({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            pointerId,
            itemId: candidateId,
            clientX,
            clientY
        });
        nextIndex += 1;

        if (newlyCapturedItemIds.includes(candidateId)) {
            captured = true;
            break;
        }
    }

    writeStackCardExtractIndex(card, nextIndex);
    updateStackCardVisualState(card);
    return captured;
}

function scheduleNextStackCardSweepCapture() {
    clearStackCardSweepHoldTimer();
    if (stackCardSweepState.pointerId === null || !(stackCardSweepState.activeCard instanceof HTMLElement)) {
        return;
    }

    stackCardSweepState.holdTimerId = setTimeout(() => {
        stackCardSweepState.holdTimerId = null;

        if (!canUseStackCardSweepCapture() || stackCardSweepState.pointerId === null) {
            return;
        }

        const activeCard = stackCardSweepState.activeCard;
        if (!(activeCard instanceof HTMLElement) || activeCard.isConnected !== true) {
            return;
        }

        if (getStackCardRemainingCount(activeCard) <= 0) {
            return;
        }

        const didCapture = captureNextStackCardItemBySweep(
            activeCard,
            stackCardSweepState.pointerId,
            stackCardSweepState.lastClientX,
            stackCardSweepState.lastClientY
        );
        if (!didCapture || getStackCardRemainingCount(activeCard) <= 0) {
            return;
        }

        stackCardSweepState.nextDelayMs = Math.max(
            STACK_CARD_CAPTURE_MIN_DELAY_MS,
            Math.round(stackCardSweepState.nextDelayMs * STACK_CARD_CAPTURE_ACCELERATION)
        );
        scheduleNextStackCardSweepCapture();
    }, stackCardSweepState.nextDelayMs);
}

function setStackCardSweepActiveCard(card) {
    if (stackCardSweepState.activeCard === card) {
        return;
    }

    clearStackCardSweepHoldTimer();
    stackCardSweepState.activeCard = card;
    stackCardSweepState.nextDelayMs = STACK_CARD_CAPTURE_INITIAL_DELAY_MS;
    if (!(card instanceof HTMLElement) || stackCardSweepState.pointerId === null || stackCardSweepState.sweepStarted !== true) {
        return;
    }

    captureNextStackCardItemBySweep(
        card,
        stackCardSweepState.pointerId,
        stackCardSweepState.lastClientX,
        stackCardSweepState.lastClientY
    );
    if (getStackCardRemainingCount(card) > 0) {
        scheduleNextStackCardSweepCapture();
    }
}

function finishStackCardSweepCapture(event) {
    const pointerId = event?.pointerId;
    if (!Number.isFinite(pointerId)) {
        resetStackCardSweepState();
        return;
    }

    const elements = getWarehouseElements();
    if (elements.warehouseGrid && typeof elements.warehouseGrid.releasePointerCapture === "function") {
        try {
            elements.warehouseGrid.releasePointerCapture(pointerId);
        } catch {
            // pointer capture가 이미 해제된 경우를 무시한다.
        }
    }

    if (stackCardSweepState.sweepStarted === true) {
        endTransportModeExternalSweep({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            pointerId,
            clientX: event.clientX,
            clientY: event.clientY
        });
    }
    resetStackCardSweepState();
}

function bindWarehouseStackSweepEvents(elements) {
    const grid = elements.warehouseGrid;
    if (!grid) {
        return;
    }

    bindEventOnce(grid, "pointerdown", "listenerWarehouseStackSweepDownBound", (event) => {
        if (!canUseStackCardSweepCapture()) {
            return;
        }

        if (Number.isFinite(event.button) && event.button !== 0) {
            return;
        }

        stackCardSweepState.pointerId = event.pointerId;
        stackCardSweepState.activeCard = null;
        stackCardSweepState.sweepStarted = false;
        stackCardSweepState.startClientX = event.clientX;
        stackCardSweepState.startClientY = event.clientY;
        stackCardSweepState.lastClientX = event.clientX;
        stackCardSweepState.lastClientY = event.clientY;
        stackCardSweepState.nextDelayMs = STACK_CARD_CAPTURE_INITIAL_DELAY_MS;
    });

    bindEventOnce(grid, "pointermove", "listenerWarehouseStackSweepMoveBound", (event) => {
        if (stackCardSweepState.pointerId === null || event.pointerId !== stackCardSweepState.pointerId) {
            return;
        }

        if (!canUseStackCardSweepCapture()) {
            finishStackCardSweepCapture(event);
            return;
        }

        stackCardSweepState.lastClientX = event.clientX;
        stackCardSweepState.lastClientY = event.clientY;

        if (stackCardSweepState.sweepStarted !== true) {
            const dx = event.clientX - stackCardSweepState.startClientX;
            const dy = event.clientY - stackCardSweepState.startClientY;
            if ((dx * dx) + (dy * dy) < STACK_CARD_SWEEP_ACTIVATE_DISTANCE_SQ) {
                return;
            }

            const started = startTransportModeExternalSweep({
                sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY
            });
            if (!started) {
                finishStackCardSweepCapture(event);
                return;
            }
            stackCardSweepState.sweepStarted = true;
            suppressStackedCardClickUntilMs = Date.now() + STACK_CARD_CLICK_SUPPRESS_MS;

            if (typeof grid.setPointerCapture === "function") {
                try {
                    grid.setPointerCapture(event.pointerId);
                } catch {
                    // pointer capture를 지원하지 않는 경우를 무시한다.
                }
            }
        }

        moveTransportModeExternalSweep({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_NO_STACK_LIST,
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY
        });

        const targetAtPoint = document.elementFromPoint(event.clientX, event.clientY);
        const stackCard = resolveStackCardFromNode(targetAtPoint);
        setStackCardSweepActiveCard(stackCard);

        if (event.cancelable) {
            event.preventDefault();
        }
    });

    bindEventOnce(grid, "pointerup", "listenerWarehouseStackSweepUpBound", (event) => {
        if (event.pointerId !== stackCardSweepState.pointerId) {
            return;
        }

        if (stackCardSweepState.sweepStarted !== true) {
            finishStackCardSweepCapture(event);
            return;
        }
        finishStackCardSweepCapture(event);
    });

    bindEventOnce(grid, "pointercancel", "listenerWarehouseStackSweepCancelBound", (event) => {
        if (event.pointerId !== stackCardSweepState.pointerId) {
            return;
        }

        if (stackCardSweepState.sweepStarted !== true) {
            finishStackCardSweepCapture(event);
            return;
        }
        finishStackCardSweepCapture(event);
    });

    bindEventOnce(grid, "lostpointercapture", "listenerWarehouseStackSweepLostCaptureBound", (event) => {
        if (event.pointerId !== stackCardSweepState.pointerId) {
            return;
        }

        if (stackCardSweepState.sweepStarted !== true) {
            finishStackCardSweepCapture(event);
            return;
        }
        finishStackCardSweepCapture(event);
    });
}

// 이 함수는 창고 카드 UI 한 개를 생성한다.
function createWarehouseCard(labelText, count, onClick, visualMarimo) {
    const card = document.createElement("div");
    card.className = "warehouse-item";

    const marimoVisual = document.createElement("div");
    renderMarimoStackVisual(marimoVisual, {
        marimo: visualMarimo,
        count
    });
    marimoVisual.classList.add("warehouse-item-visual");

    const label = document.createElement("div");
    label.className = "warehouse-item-volume";
    label.textContent = labelText;

    card.appendChild(marimoVisual);
    card.appendChild(label);

    if (typeof onClick === "function") {
        card.style.cursor = "pointer";
        card.tabIndex = 0;
        card.addEventListener("click", () => {
            onClick(card);
        });
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(card);
            }
        });
    }

    return card;
}

// 이 함수는 창고 페이지 메시지를 잠시 표시한 뒤 자동으로 지운다.
function setWarehouseMessage(message) {
    const elements = getWarehouseElements();
    const messageNode = ensureWarehouseMessage(elements);

    if (!messageNode) {
        return;
    }

    messageNode.textContent = message;

    if (clearWarehouseMessageTimerId) {
        clearTimeout(clearWarehouseMessageTimerId);
    }

    if (!message) {
        return;
    }

    clearWarehouseMessageTimerId = setTimeout(() => {
        const latestElements = getWarehouseElements();
        const latestMessageNode = ensureWarehouseMessage(latestElements);
        if (latestMessageNode) {
            latestMessageNode.textContent = "";
        }
    }, 1200);
}

// 이 함수는 창고 메시지 표시 노드가 없으면 생성해서 반환한다.
function ensureWarehouseMessage(elements) {
    if (elements.warehouseMessage) {
        return elements.warehouseMessage;
    }

    if (!elements.warehousePageContent) {
        return null;
    }

    const message = document.createElement("p");
    message.id = "warehouseMessage";
    message.className = "message-text";

    const anchor = elements.warehouseGrid || elements.warehouseEmptyText;
    if (anchor) {
        elements.warehousePageContent.insertBefore(message, anchor);
    } else {
        elements.warehousePageContent.appendChild(message);
    }

    return message;
}

// 이 함수는 창고 보기 전환 버튼을 보장한다.
function ensureWarehouseViewToggleButton(elements) {
    if (elements.warehouseViewToggleBtn) {
        return elements.warehouseViewToggleBtn;
    }

    if (!elements.warehousePage) {
        return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.id = "warehouseViewToggleBtn";
    button.className = "warehouse-view-toggle-btn";
    button.textContent = "List View";
    elements.warehousePage.appendChild(button);
    return button;
}

// 이 함수는 창고 보기 전환 버튼 텍스트를 현재 모드에 맞춰 갱신한다.
function renderWarehouseViewToggleButton(elements) {
    const button = ensureWarehouseViewToggleButton(elements);
    if (!button) {
        return;
    }

    button.textContent = warehouseViewMode === "physics" ? "List View" : "Physics View";
}

// 이 함수는 창고 콘텐츠 컨테이너의 모드 클래스를 갱신한다.
function applyWarehouseContentModeClass(elements, mode) {
    if (!elements.warehousePageContent) {
        return;
    }

    elements.warehousePageContent.classList.toggle("warehouse-content-physics-mode", mode === "physics");
    elements.warehousePageContent.classList.toggle("warehouse-content-list-mode", mode === "list");
}

// 이 함수는 창고 물리 보기에서 사용할 캔버스를 보장한다.
function ensureWarehousePhysicsCanvas(elements) {
    const stage = elements.warehousePhysicsStage;
    if (!stage) {
        return null;
    }

    let canvas = elements.warehousePhysicsCanvas;
    if (!canvas || !canvas.isConnected) {
        canvas = document.createElement("canvas");
        canvas.id = "warehousePhysicsCanvas";
        canvas.className = "warehouse-physics-canvas";
        stage.textContent = "";
        stage.appendChild(canvas);
    }

    return canvas;
}

// 이 함수는 전체 창고 아이템의 대표 볼륨(평균)을 계산한다.
function getWarehouseRepresentativeVolume(items) {
    if (!Array.isArray(items) || items.length <= 0) {
        return 0;
    }

    let totalVolume = 0;
    for (let i = 0; i < items.length; i += 1) {
        totalVolume += getMarimoVolume(items[i]);
    }

    return totalVolume / items.length;
}

// 이 함수는 바구니 물리 보기 전체 화면을 렌더링한다.
function renderWarehousePhysicsMode(elements) {
    applyWarehouseContentModeClass(elements, "physics");
    const stackModeBtn = ensureStackModeButton(elements);
    if (stackModeBtn) {
        stackModeBtn.classList.add("hidden");
    }

    elements.warehouseGrid.classList.add("hidden");
    elements.warehouseGrid.textContent = "";

    if (!elements.warehousePhysicsStage) {
        return;
    }

    elements.warehouseEmptyText.classList.add("hidden");
    elements.warehousePhysicsStage.classList.remove("hidden");

    const canvas = ensureWarehousePhysicsCanvas(elements);
    if (!canvas) {
        return;
    }
    activeWarehousePhysicsCanvas = canvas;

    const width = Math.max(240, elements.warehousePhysicsStage.clientWidth || elements.warehousePageContent.clientWidth || 360);
    const height = Math.max(180, elements.warehousePhysicsStage.clientHeight || elements.warehousePageContent.clientHeight || 320);

    startBasketAnimation({
        canvas,
        items: state.warehouse,
        stackRepresentativeVolume: getWarehouseRepresentativeVolume(state.warehouse),
        onSelectItem: (itemId) => {
            const handledByTransportMode = handleTransportModeSourceTap({
                sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN,
                itemId
            });

            if (handledByTransportMode) {
                return;
            }

            openWarehouseItemDetail(itemId);
        },
        pointerHooks: buildTransportModeSourcePointerHooks({
            sourceKind: TRANSPORT_SOURCE_KIND_WAREHOUSE_MAIN
        }),
        physicsWidth: width,
        physicsHeight: height,
        devicePixelRatio: window.devicePixelRatio || 1,
        maxRenderCount: 50,
        allowEmpty: true
    });

    setTransportModeVisibleItems({
        sourceItems: state.warehouse
    });
}

// 이 함수는 기존 카드 기반 창고 목록 보기를 렌더링한다.
function renderWarehouseListMode(elements) {
    applyWarehouseContentModeClass(elements, "list");
    if (activeWarehousePhysicsCanvas) {
        stopBasketAnimation({ canvas: activeWarehousePhysicsCanvas });
        activeWarehousePhysicsCanvas = null;
    }

    if (elements.warehousePhysicsStage) {
        elements.warehousePhysicsStage.classList.add("hidden");
    }

    elements.warehouseGrid.classList.remove("hidden");
    renderStackModeButton(elements, state);
    const stackModeBtn = ensureStackModeButton(elements);
    if (stackModeBtn) {
        stackModeBtn.classList.remove("hidden");
    }

    elements.warehouseGrid.textContent = "";

    if (state.warehouse.length === 0) {
        elements.warehouseEmptyText.classList.remove("hidden");
        return;
    }

    elements.warehouseEmptyText.classList.add("hidden");

    renderWarehouseByMode({
        elements,
        currentState: state,
        createWarehouseCard,
        onNoStackItemClick: handleNoStackItemClick,
        onStackedItemClick: handleStackedItemClick
    });
}

// 이 함수는 창고 페이지에서 사용하는 DOM 요소를 조회한다.
function getWarehouseElements() {
    const warehousePage = document.getElementById("warehousePage");
    const warehousePageContent = warehousePage ? warehousePage.querySelector(".page-content") : null;

    return {
        warehousePage,
        warehousePageContent,
        warehouseViewToggleBtn: document.getElementById("warehouseViewToggleBtn"),
        warehousePhysicsStage: document.getElementById("warehousePhysicsStage"),
        warehousePhysicsCanvas: document.getElementById("warehousePhysicsCanvas"),
        warehouseGrid: document.getElementById("warehouseGrid"),
        warehouseEmptyText: document.getElementById("warehouseEmptyText"),
        stackModeBtn: document.getElementById("warehouseStackModeBtn"),
        warehouseMessage: document.getElementById("warehouseMessage")
    };
}
