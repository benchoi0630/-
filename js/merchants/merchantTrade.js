// 파일 역할: 상인 거래 시도의 성공/실패 판정과 상태 변경 반영을 수행한다.
// 핵심 책임: 지불 아이템 제거, 보상 지급, 판매 진행도 증가를 원자적 흐름으로 처리한다.
// 연동 범위: 상점 구매 액션이 호출하는 핵심 트랜잭션 함수(`attemptMerchantTrade`)를 제공한다.

import {
    collectWarehouseIndicesForOffer,
    consumeWarehouseByOffer,
    describeOfferSpec,
    refreshMerchantOfferSpec,
    resolveMerchantOfferSpec
} from "./merchantOffer.js";

function buildTradeResult(options = {}) {
    return {
        ok: options?.ok === true,
        message: typeof options?.message === "string" ? options.message : "",
        silent: options?.silent === true,
        shellsEarned: Number.isFinite(options?.shellsEarned) ? options.shellsEarned : 0,
        progressionMessages: Array.isArray(options?.progressionMessages) ? options.progressionMessages : [],
        consumedItemIds: Array.isArray(options?.consumedItemIds) ? options.consumedItemIds : []
    };
}

function buildInvalidTradeResult() {
    return buildTradeResult({
        ok: false,
        message: "",
        silent: true
    });
}

function buildNotEnoughTradeResult(offerSpec) {
    return buildTradeResult({
        ok: false,
        message: `not enough marimo! need: ${describeOfferSpec(offerSpec)}`,
        silent: false
    });
}

// 이 함수는 보상 데이터를 상태에 적용하고 획득한 쉘 수를 반환한다.
function applyRewardsToState(currentState, rewards) {
    const shells = Number.isFinite(rewards?.shells) ? rewards.shells : 0;
    if (shells !== 0) {
        currentState.currency.shells += shells;
    }
    return shells;
}

// 이 함수는 상인 판매 횟수와 레벨 상승 규칙을 적용한다.
function applyMerchantSaleProgress(merchantState) {
    merchantState.salesCount += 1;

    if (merchantState.salesCount > 0 && merchantState.salesCount % 5 === 0) {
        merchantState.level += 1;
    }
}

// 이 함수는 상인별 구매 가능 조건을 평가한다.
function canAttemptPurchase(currentState, merchant, merchantState, now) {
    if (!merchant || !merchantState) {
        return false;
    }

    if (typeof merchant.canAttemptPurchase === "function") {
        return merchant.canAttemptPurchase(currentState, merchantState, now) === true;
    }

    return merchantState.unlocked === true;
}

function completeMerchantTrade(options) {
    const currentState = options?.currentState;
    const merchant = options?.merchant;
    const merchantState = options?.merchantState;
    const now = Number.isFinite(options?.now) ? options.now : Date.now();
    const applyProgressionFn = typeof options?.applyProgressionFn === "function" ? options.applyProgressionFn : null;
    const progressionReason = typeof options?.progressionReason === "string" && options.progressionReason
        ? options.progressionReason
        : "merchant_purchase";
    const consumedItemIds = Array.isArray(options?.consumedItemIds) ? options.consumedItemIds : [];

    const rewards = merchant.getRewards(currentState, merchantState);
    const shellsEarned = applyRewardsToState(currentState, rewards);
    applyMerchantSaleProgress(merchantState);
    refreshMerchantOfferSpec(currentState, merchant, merchantState, now, "sale");

    if (typeof merchant.beforeProgressionOnSale === "function") {
        merchant.beforeProgressionOnSale(currentState, merchantState, now);
    }

    const progressionMessages = applyProgressionFn ? applyProgressionFn(currentState, progressionReason) : [];

    if (typeof merchant.afterProgressionOnSale === "function") {
        merchant.afterProgressionOnSale(currentState, merchantState, now);
    }

    return buildTradeResult({
        ok: true,
        message: "Trade completed.",
        silent: false,
        shellsEarned,
        progressionMessages,
        consumedItemIds
    });
}

// 이 함수는 상인 거래 한 번을 수행하고 결과를 공통 형태로 반환한다.
export function attemptMerchantTrade(options) {
    const currentState = options?.currentState;
    const merchant = options?.merchant;
    const merchantState = options?.merchantState;
    const now = Number.isFinite(options?.now) ? options.now : Date.now();
    const applyProgressionFn = typeof options?.applyProgressionFn === "function" ? options.applyProgressionFn : null;
    const progressionReason = typeof options?.progressionReason === "string" && options.progressionReason ? options.progressionReason : "merchant_purchase";

    if (!currentState || !merchant || !merchantState) {
        return buildInvalidTradeResult();
    }

    if (!canAttemptPurchase(currentState, merchant, merchantState, now)) {
        return buildInvalidTradeResult();
    }

    const offerSpec = resolveMerchantOfferSpec(currentState, merchant, merchantState, now);
    const consumeResult = consumeWarehouseByOffer(currentState, offerSpec);

    if (!consumeResult.ok) {
        return buildNotEnoughTradeResult(offerSpec);
    }

    return completeMerchantTrade({
        currentState,
        merchant,
        merchantState,
        now,
        applyProgressionFn,
        progressionReason
    });
}

export function attemptMerchantTradeWithInventory(options) {
    const currentState = options?.currentState;
    const merchant = options?.merchant;
    const merchantState = options?.merchantState;
    const now = Number.isFinite(options?.now) ? options.now : Date.now();
    const inventoryItems = Array.isArray(options?.inventoryItems) ? options.inventoryItems : [];
    const consumeMatchedItemsFn = typeof options?.consumeMatchedItemsFn === "function"
        ? options.consumeMatchedItemsFn
        : null;
    const applyProgressionFn = typeof options?.applyProgressionFn === "function" ? options.applyProgressionFn : null;
    const progressionReason = typeof options?.progressionReason === "string" && options.progressionReason
        ? options.progressionReason
        : "merchant_purchase";

    if (!currentState || !merchant || !merchantState || !consumeMatchedItemsFn) {
        return buildInvalidTradeResult();
    }

    if (!canAttemptPurchase(currentState, merchant, merchantState, now)) {
        return buildInvalidTradeResult();
    }

    const offerSpec = resolveMerchantOfferSpec(currentState, merchant, merchantState, now);
    const matched = collectWarehouseIndicesForOffer(inventoryItems, offerSpec);

    if (!matched.ok) {
        return buildNotEnoughTradeResult(matched.offerSpec);
    }

    const selectedItems = [];
    for (let i = 0; i < matched.selectedIndexes.length; i += 1) {
        const index = matched.selectedIndexes[i];
        if (!Number.isFinite(index) || index < 0 || index >= inventoryItems.length) {
            return buildNotEnoughTradeResult(matched.offerSpec);
        }

        const item = inventoryItems[index];
        if (!item || typeof item !== "object") {
            return buildNotEnoughTradeResult(matched.offerSpec);
        }

        selectedItems.push(item);
    }

    const consumedItemIds = [];
    for (let i = 0; i < selectedItems.length; i += 1) {
        const itemId = selectedItems[i]?.id;
        if (typeof itemId === "string" && itemId.length > 0) {
            consumedItemIds.push(itemId);
        }
    }

    const didConsume = consumeMatchedItemsFn({
        selectedIndexes: [...matched.selectedIndexes],
        selectedItems: [...selectedItems],
        offerSpec: matched.offerSpec
    });
    if (didConsume !== true) {
        return buildNotEnoughTradeResult(matched.offerSpec);
    }

    return completeMerchantTrade({
        currentState,
        merchant,
        merchantState,
        now,
        applyProgressionFn,
        progressionReason,
        consumedItemIds
    });
}
