// 파일 역할: 상점 슬롯 DOM 생성/유지와 상인 카드 렌더링을 담당하는 뷰 모듈이다.
// 핵심 책임: 슬롯별 현재 카드 상태를 기억해 텍스트 갱신/교체 애니메이션 연결을 처리한다.
// 연동 범위: 구매 실행은 콜백으로 위임해 렌더 코드와 비즈니스 로직 결합을 줄인다.

import { state } from "../../state.js";
import { describeOfferSpec, resolveMerchantOfferSpec } from "../../merchants/merchantOffer.js";
import { createMerchantElement } from "../../merchants/merchantUI.js";
import { SHOP_SLOT_COUNT } from "./shopPresence.js";

let shopSlotNodes = [];
const shopSlotState = [];
let purchaseHandler = null;

export function getShopElements() {
    return {
        shopMerchantList: document.getElementById("shopMerchantList"),
        shopMessage: document.getElementById("shopMessage")
    };
}

export function setShopPurchaseHandler(handler) {
    purchaseHandler = typeof handler === "function" ? handler : null;
}

export function applyShopGridLayout(container) {
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    container.style.gridTemplateRows = "repeat(2, minmax(0, 1fr))";
    container.style.gap = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.padding = "0";
}

function createSlotNode(slotIndex) {
    const slotNode = document.createElement("div");
    slotNode.dataset.slotIndex = String(slotIndex);
    slotNode.style.minHeight = "0";
    slotNode.style.display = "flex";
    slotNode.style.alignItems = "center";
    slotNode.style.justifyContent = "center";
    slotNode.style.padding = "0";
    slotNode.style.boxSizing = "border-box";
    slotNode.style.overflow = "visible";
    slotNode.style.background = "transparent";
    slotNode.style.border = "0";
    return slotNode;
}

function createPlaceholderNode() {
    const placeholderNode = document.createElement("div");
    placeholderNode.textContent = "";
    placeholderNode.style.width = "100%";
    placeholderNode.style.height = "100%";
    return placeholderNode;
}

export function ensureShopSlots(container) {
    if (shopSlotNodes.length === SHOP_SLOT_COUNT && shopSlotNodes.every((node) => node.isConnected && node.parentElement === container)) {
        return shopSlotNodes;
    }

    container.textContent = "";
    shopSlotNodes = [];

    for (let slotIndex = 0; slotIndex < SHOP_SLOT_COUNT; slotIndex += 1) {
        const slotNode = createSlotNode(slotIndex);
        slotNode.appendChild(createPlaceholderNode());
        container.appendChild(slotNode);
        shopSlotNodes.push(slotNode);
        shopSlotState[slotIndex] = {
            merchantId: null,
            merchantNode: null
        };
    }

    return shopSlotNodes;
}

function buildMerchantInfoText(assignment) {
    const offerSpec = resolveMerchantOfferSpec(state, assignment.merchant, assignment.merchantState, Date.now());
    const rewards = assignment.merchant.getRewards(state, assignment.merchantState);
    const rewardShells = Number.isFinite(rewards?.shells) ? rewards.shells : 0;
    return `${describeOfferSpec(offerSpec)} = ${rewardShells} shells`;
}

function bindMerchantActions(merchantNode, merchantId) {
    const onPurchase = () => {
        if (purchaseHandler) {
            purchaseHandler(merchantId, merchantNode);
        }
    };

    merchantNode.addEventListener("click", onPurchase);
    merchantNode.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPurchase();
        }
    });
}

function createInteractiveMerchantNode(assignment) {
    const infoText = buildMerchantInfoText(assignment);
    const merchantNode = createMerchantElement(assignment.merchantId, infoText);
    bindMerchantActions(merchantNode, assignment.merchantId);
    return merchantNode;
}

function updateMerchantNodeText(merchantNode, assignment) {
    const textNode = merchantNode.querySelector(".merchant-info-text");
    if (!textNode) {
        return;
    }

    const nextText = buildMerchantInfoText(assignment);
    if (textNode.textContent !== nextText) {
        textNode.textContent = nextText;
    }
}

function renderSlot(slotNode, slotIndex, assignment, motion) {
    const slotState = shopSlotState[slotIndex];
    const currentMerchantId = slotState?.merchantId || null;
    const currentMerchantNode = slotState?.merchantNode || null;
    const nextMerchantId = assignment?.merchantId || null;

    if (currentMerchantNode && currentMerchantId === nextMerchantId && assignment) {
        updateMerchantNodeText(currentMerchantNode, assignment);
        return;
    }

    if (currentMerchantNode) {
        motion.animateMerchantExit(slotNode, currentMerchantNode);
    }

    slotNode.textContent = "";

    if (!assignment) {
        slotNode.appendChild(createPlaceholderNode());
        shopSlotState[slotIndex] = {
            merchantId: null,
            merchantNode: null
        };
        return;
    }

    const merchantNode = createInteractiveMerchantNode(assignment);
    shopSlotState[slotIndex] = {
        merchantId: assignment.merchantId,
        merchantNode
    };
    motion.animateMerchantEnter(slotNode, merchantNode);
}

export function renderShopAssignments(assignments, motion) {
    for (let slotIndex = 0; slotIndex < SHOP_SLOT_COUNT; slotIndex += 1) {
        renderSlot(shopSlotNodes[slotIndex], slotIndex, assignments[slotIndex], motion);
    }
}

export function findMountedMerchantNode(merchantId) {
    if (typeof merchantId !== "string" || merchantId.length <= 0) {
        return null;
    }

    for (let i = 0; i < shopSlotState.length; i += 1) {
        const slot = shopSlotState[i];
        if (slot?.merchantId !== merchantId) {
            continue;
        }

        const node = slot.merchantNode;
        if (node instanceof HTMLElement && node.isConnected) {
            return node;
        }
    }

    return null;
}

export function resolvePurchaseSourceElement(merchantId, fallbackElement) {
    if (fallbackElement instanceof HTMLElement && fallbackElement.isConnected) {
        return fallbackElement;
    }

    return findMountedMerchantNode(merchantId);
}
