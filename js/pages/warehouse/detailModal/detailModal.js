// 파일 역할: 창고 상세 모달의 열기/닫기/모드 전환(단일·스택)을 조율하는 컨트롤러다.
// 핵심 책임: 선택 아이템 교체, 스택 랜덤 선택, 메인 슬롯 스왑 등 액션 흐름을 처리한다.
// 연동 범위: singleDetail/stackDetail 렌더러와 페이지 재렌더 콜백을 연결한다.

import { state, saveState } from "../../../state.js";
import { createMarimoRecordId, getMarimoDiameter, getMarimoType, getMarimoVolume, hasMainMarimo } from "../../../utils/marimoData.js";
import { renderSingleDetail } from "./singleDetailModal.js";
import { pickRandomStackItemId, renderStackDetail, stopStackDetail } from "./stackDetailModal.js";
import { replaceBasketItem } from "../basketPhysics/index.js";
import { bindEventOnce } from "../../../utils/domEvents.js";

// 이 섹션은 창고 상세 모달 내부 상태와 외부 콜백 컨텍스트를 관리한다.
let selectedWarehouseItemId = null;
let warehouseModalMode = "item_detail";
let activeStackMeta = null;
const detailModalContext = {
    renderWarehousePage: () => {},
    renderMainPage: () => {},
    showWarehouseMessage: () => {}
};

/** 이 함수는 창고 상세 모달 이벤트를 초기화하고 외부 콜백을 연결한다. */
export function initWarehouseDetailModal(options = {}) {
    detailModalContext.renderWarehousePage = typeof options.renderWarehousePage === "function" ? options.renderWarehousePage : () => {};
    detailModalContext.renderMainPage = typeof options.renderMainPage === "function" ? options.renderMainPage : () => {};
    detailModalContext.showWarehouseMessage = typeof options.showWarehouseMessage === "function" ? options.showWarehouseMessage : () => {};

    const modal = ensureWarehouseDetailModal();
    const elements = getDetailElements();

    bindEventOnce(elements.detailCloseBtn, "click", "listenerWarehouseDetailCloseBound", closeWarehouseDetailModal);
    bindEventOnce(elements.detailSendToMainBtn, "click", "listenerWarehouseDetailSwapBound", swapSelectedWarehouseItemToMain);
    bindEventOnce(elements.detailRandomPickBtn, "click", "listenerWarehouseDetailRandomBound", handleRandomPickFromStack);
    bindEventOnce(elements.detailBackToBasketBtn, "click", "listenerWarehouseDetailBackBound", handleBackToStackBasket);

    bindEventOnce(modal, "click", "listenerWarehouseDetailOverlayBound", (event) => {
        if (event.target === modal) {
            closeWarehouseDetailModal();
        }
    });
}

/** 이 함수는 창고 상세 모달을 닫고 선택 상태와 물리 루프를 초기화한다. */
export function closeWarehouseDetailModal() {
    const elements = getDetailElements();
    if (elements.detailModal) {
        elements.detailModal.classList.add("hidden");
    }

    stopStackDetail();
    selectedWarehouseItemId = null;
    activeStackMeta = null;
    warehouseModalMode = "item_detail";
}

/** 이 함수는 단일 마리모 상세 모달을 연다. */
export function openWarehouseItemDetail(itemId) {
    const target = state.warehouse.find((item) => item.id === itemId);
    if (!target) {
        detailModalContext.showWarehouseMessage("Could not find the selected marimo.");
        return;
    }

    selectedWarehouseItemId = itemId;
    activeStackMeta = null;
    warehouseModalMode = "item_detail";
    renderWarehouseDetailModal();
}

/** 이 함수는 스택 메타데이터 기준으로 바구니 상세 모달을 연다. */
export function openWarehouseStackDetail(stackMeta) {
    if (!stackMeta || !Array.isArray(stackMeta.stackAllItemIds) || stackMeta.stackAllItemIds.length <= 0) {
        detailModalContext.showWarehouseMessage("Stack data is empty.");
        return;
    }

    selectedWarehouseItemId = null;
    activeStackMeta = {
        stackKey: stackMeta.stackKey,
        stackAllItemIds: [...stackMeta.stackAllItemIds],
        stackRepresentativeVolume: Number.isFinite(stackMeta.stackRepresentativeVolume) ? stackMeta.stackRepresentativeVolume : 0
    };
    warehouseModalMode = "basket";
    renderWarehouseDetailModal();
}

// 이 함수는 현재 모달 내부 모드에 맞춰 버튼 노출과 본문을 렌더링한다.
function renderWarehouseDetailModal() {
    const modal = ensureWarehouseDetailModal();
    const elements = getDetailElements();
    if (!modal) {
        return;
    }

    if (elements.detailRandomPickBtn) {
        elements.detailRandomPickBtn.classList.toggle("hidden", warehouseModalMode !== "basket");
    }

    if (elements.detailBackToBasketBtn) {
        const shouldShowBack = warehouseModalMode === "item_detail" && Boolean(activeStackMeta);
        elements.detailBackToBasketBtn.classList.toggle("hidden", !shouldShowBack);
    }

    if (warehouseModalMode === "basket") {
        renderStackDetail({
            detailBody: elements.detailBody,
            detailSendToMainBtn: elements.detailSendToMainBtn,
            stackMeta: activeStackMeta,
            onSelectItem: (itemId) => {
                selectedWarehouseItemId = itemId;
                warehouseModalMode = "item_detail";
                renderWarehouseDetailModal();
            }
        });
    } else {
        stopStackDetail();
        const selectedItem = state.warehouse.find((item) => item.id === selectedWarehouseItemId);
        renderSingleDetail({
            detailBody: elements.detailBody,
            detailSendToMainBtn: elements.detailSendToMainBtn,
            selectedItem
        });
    }

    modal.classList.remove("hidden");
}

// 이 함수는 스택 모드에서 랜덤 아이템 하나를 뽑아 상세 모드로 전환한다.
function handleRandomPickFromStack() {
    const randomItemId = pickRandomStackItemId(activeStackMeta);
    if (!randomItemId) {
        detailModalContext.showWarehouseMessage("No selectable marimo available.");
        return;
    }

    selectedWarehouseItemId = randomItemId;
    warehouseModalMode = "item_detail";
    renderWarehouseDetailModal();
}

// 이 함수는 상세 모드에서 기존 스택 바구니 보기로 되돌린다.
function handleBackToStackBasket() {
    if (!activeStackMeta) {
        return;
    }

    warehouseModalMode = "basket";
    renderWarehouseDetailModal();
}

// 이 함수는 선택된 아이템과 메인 마리모를 교환해 저장하고 화면을 갱신한다.
function swapSelectedWarehouseItemToMain() {
    if (!selectedWarehouseItemId) {
        return;
    }

    const targetIndex = state.warehouse.findIndex((item) => item.id === selectedWarehouseItemId);
    if (targetIndex < 0) {
        return;
    }

    const selectedItem = state.warehouse[targetIndex];
    const shouldStoreOutgoingMain = hasMainMarimo(state);
    const outgoingMainVolume = getMarimoVolume(state.marimo);
    const outgoingMainDiameter = getMarimoDiameter(state.marimo);
    const outgoingMainType = getMarimoType(state.marimo);

    const nextMainVolume = getMarimoVolume(selectedItem);
    const nextMainDiameter = getMarimoDiameter(selectedItem);
    const nextMainType = getMarimoType(selectedItem);
    const nextMainStage = Number.isFinite(selectedItem?.stage) ? selectedItem.stage : 1;
    const outgoingWarehouseRecord = shouldStoreOutgoingMain
        ? {
            id: createMarimoRecordId("warehouse"),
            volume: outgoingMainVolume,
            type: outgoingMainType,
            createdAt: new Date().toISOString(),
            diameter: outgoingMainDiameter
        }
        : null;

    replaceBasketItem({
        targetItemId: selectedWarehouseItemId,
        replacementItem: outgoingWarehouseRecord
    });

    state.warehouse.splice(targetIndex, 1);

    if (outgoingWarehouseRecord) {
        state.warehouse.push(outgoingWarehouseRecord);
    }

    state.mainSlotStatus = "occupied";
    state.marimo = {
        id: "main-marimo",
        volume: nextMainVolume,
        diameter: nextMainDiameter,
        stage: nextMainStage,
        type: nextMainType
    };

    detailModalContext.renderMainPage();
    saveState();
    detailModalContext.renderWarehousePage();
    closeWarehouseDetailModal();
}

// 이 함수는 상세 모달에서 사용하는 DOM 요소를 조회한다.
function getDetailElements() {
    return {
        detailModal: document.getElementById("warehouseDetailModal"),
        detailBody: document.getElementById("warehouseDetailBody"),
        detailCloseBtn: document.getElementById("warehouseDetailCloseBtn"),
        detailSendToMainBtn: document.getElementById("warehouseSendToMainBtn"),
        detailRandomPickBtn: document.getElementById("warehouseRandomPickBtn"),
        detailBackToBasketBtn: document.getElementById("warehouseBackToBasketBtn")
    };
}

// 이 함수는 상세 모달 DOM이 없으면 생성한다.
function ensureWarehouseDetailModal() {
    const elements = getDetailElements();
    if (elements.detailModal) {
        return elements.detailModal;
    }

    const modal = document.createElement("div");
    modal.id = "warehouseDetailModal";
    modal.className = "modal hidden";

    const content = document.createElement("div");
    content.className = "modal-content";
    content.style.minWidth = "320px";
    content.style.maxWidth = "min(92vw, 460px)";

    const title = document.createElement("h3");
    title.textContent = "Details";

    const body = document.createElement("div");
    body.id = "warehouseDetailBody";
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "8px";
    body.style.textAlign = "left";

    const randomPickBtn = document.createElement("button");
    randomPickBtn.type = "button";
    randomPickBtn.id = "warehouseRandomPickBtn";
    randomPickBtn.textContent = "Pick Random";

    const backToBasketBtn = document.createElement("button");
    backToBasketBtn.type = "button";
    backToBasketBtn.id = "warehouseBackToBasketBtn";
    backToBasketBtn.textContent = "Back to Basket";

    const sendToMainBtn = document.createElement("button");
    sendToMainBtn.type = "button";
    sendToMainBtn.id = "warehouseSendToMainBtn";
    sendToMainBtn.textContent = "Send to Main Screen!";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.id = "warehouseDetailCloseBtn";
    closeBtn.textContent = "Close";

    content.appendChild(title);
    content.appendChild(body);
    content.appendChild(randomPickBtn);
    content.appendChild(backToBasketBtn);
    content.appendChild(sendToMainBtn);
    content.appendChild(closeBtn);
    modal.appendChild(content);
    document.body.appendChild(modal);

    return modal;
}
