// 파일 역할: 상점 페이지 엔트리로 presence/view/motion/trade 모듈을 결합한다.
// 핵심 책임: 렌더 함수와 스폰 루프를 운영하며 상점 컨텍스트 콜백을 외부와 연결한다.
// 연동 범위: 상점 기능 전체의 오케스트레이션 지점을 단일 파일로 유지한다.

import { state, saveState } from "../../state.js";
import { merchantList } from "../../merchants/merchantsIndex.js";
import { getShellHudElement } from "../../global/globalView.js";
import { setTransportModeBasketDropHandler } from "../../global/transportMode/index.js";
import { SHOP_SLOT_COUNT, buildSlotAssignments, updateMerchantPresence } from "./shopPresence.js";
import {
    applyShopGridLayout,
    ensureShopSlots,
    getShopElements,
    renderShopAssignments,
    resolvePurchaseSourceElement,
    setShopPurchaseHandler
} from "./shopView.js";
import {
    animateMerchantEnter,
    animateMerchantExit,
    playShellRewardAnimation,
    playTradeCompleteMotion,
    runHudBounceEffect
} from "./shopMotion.js";
import { createShopTradeController } from "./shopTrade.js";

let clearMessageTimerId = null;
let shopContextRef = null;
let shopSpawnTimerId = null;

const SHOP_SPAWN_TICK_MS = 1000;

function setShopMessage(message) {
    const elements = getShopElements();

    if (elements.shopMessage) {
        elements.shopMessage.textContent = message;
    }

    if (clearMessageTimerId) {
        clearTimeout(clearMessageTimerId);
    }

    if (!message) {
        return;
    }

    clearMessageTimerId = setTimeout(() => {
        const latestElements = getShopElements();
        if (latestElements.shopMessage) {
            latestElements.shopMessage.textContent = "";
        }
    }, 1200);
}

function updateMerchantPresenceAt(now) {
    return updateMerchantPresence(state, merchantList, now);
}

function buildSlotAssignmentsAt(now) {
    return buildSlotAssignments(state, merchantList, now);
}

function handleShellRewardArrival() {
    if (!shopContextRef?.renderGlobalHeader) {
        return;
    }

    shopContextRef.renderGlobalHeader();
    runHudBounceEffect(getShellHudElement());
}

function playShopShellRewardAnimation(sourceElement, shellsEarned) {
    playShellRewardAnimation({
        sourceElement,
        targetElement: getShellHudElement(),
        shellsEarned,
        onArrive: handleShellRewardArrival
    });
}

const tradeController = createShopTradeController({
    setShopMessage,
    showGlobalMessage: (message) => {
        if (shopContextRef?.showGlobalMessage) {
            shopContextRef.showGlobalMessage(message);
        }
    },
    renderMainPage: () => {
        if (shopContextRef?.renderMainPage) {
            shopContextRef.renderMainPage();
        }
    },
    renderWarehousePage: () => {
        if (shopContextRef?.renderWarehousePage) {
            shopContextRef.renderWarehousePage();
        }
    },
    renderShopPage: () => {
        if (shopContextRef?.renderShopPage) {
            shopContextRef.renderShopPage();
        }
    },
    updateMerchantPresence: updateMerchantPresenceAt,
    resolvePurchaseSourceElement,
    playTradeCompleteMotion,
    playShellRewardAnimation: playShopShellRewardAnimation
});

setShopPurchaseHandler((merchantId, sourceElement) => {
    void tradeController.attemptMerchantPurchase(merchantId, sourceElement);
});

setTransportModeBasketDropHandler((payload = {}) => {
    void tradeController.attemptMerchantPurchaseByTransportItem({
        merchantId: payload?.merchantId,
        transportItemId: payload?.itemId,
        sourceElement: payload?.merchantNode
    });
});

function startShopSpawnLoop() {
    if (shopSpawnTimerId !== null) {
        return;
    }

    if (typeof window === "undefined") {
        return;
    }

    shopSpawnTimerId = window.setInterval(tickShopSpawnLoop, SHOP_SPAWN_TICK_MS);
}

function tickShopSpawnLoop() {
    if (tradeController.isTradeMotionLocked()) {
        return;
    }

    const changed = updateMerchantPresenceAt(Date.now());
    if (!changed) {
        return;
    }

    saveState();

    if (shopContextRef?.renderShopPage) {
        shopContextRef.renderShopPage();
    }
}

export function renderShopPage() {
    if (tradeController.isTradeMotionLocked()) {
        return;
    }

    const now = Date.now();
    const changed = updateMerchantPresenceAt(now);
    if (changed) {
        saveState();
    }

    const elements = getShopElements();

    if (!elements.shopMerchantList) {
        return;
    }

    const listElement = elements.shopMerchantList;
    applyShopGridLayout(listElement);
    ensureShopSlots(listElement);

    const assignments = buildSlotAssignmentsAt(now);
    renderShopAssignments(assignments, {
        animateMerchantEnter,
        animateMerchantExit
    });
}

export function initShopPage(options = {}) {
    shopContextRef = {
        renderMainPage: options.renderMainPage,
        renderWarehousePage: options.renderWarehousePage,
        renderGlobalHeader: options.renderGlobalHeader,
        showGlobalMessage: options.showGlobalMessage,
        renderShopPage
    };

    startShopSpawnLoop();

    return {
        renderShopPage
    };
}

export { SHOP_SLOT_COUNT };
