// 파일 역할: 상점 구매 시도와 거래 모션 락, 후속 상태 동기화 흐름을 관리한다.
// 핵심 책임: 거래 결과 메시지·progression·페이지 재렌더·보상 애니메이션 호출 순서를 통제한다.
// 연동 범위: 상점 트랜잭션을 뷰 계층에서 분리한 컨트롤러 팩토리를 제공한다.

import { state, saveState } from "../../state.js";
import { applyProgression } from "../../progression/progressionLogic.js";
import { merchantRegistry } from "../../merchants/merchantsIndex.js";
import { attemptMerchantTrade, attemptMerchantTradeWithInventory } from "../../merchants/merchantTrade.js";
import { setMerchantImageVariant } from "../../merchants/merchantUI.js";
import {
    consumeTransportModeItemsByIds,
    getTransportModeTransportItems,
    isTransportModeEnabled
} from "../../global/transportMode/index.js";

function getMerchantState(merchantId) {
    const merchantState = state.merchants?.[merchantId];
    return merchantState && typeof merchantState === "object" ? merchantState : null;
}

export function createShopTradeController(options = {}) {
    const setShopMessage = typeof options.setShopMessage === "function" ? options.setShopMessage : () => {};
    const showGlobalMessage = typeof options.showGlobalMessage === "function" ? options.showGlobalMessage : () => {};
    const renderMainPage = typeof options.renderMainPage === "function" ? options.renderMainPage : () => {};
    const renderWarehousePage = typeof options.renderWarehousePage === "function" ? options.renderWarehousePage : () => {};
    const renderShopPage = typeof options.renderShopPage === "function" ? options.renderShopPage : () => {};
    const updateMerchantPresence = typeof options.updateMerchantPresence === "function" ? options.updateMerchantPresence : () => false;
    const resolvePurchaseSourceElement = typeof options.resolvePurchaseSourceElement === "function"
        ? options.resolvePurchaseSourceElement
        : () => null;
    const playTradeCompleteMotion = typeof options.playTradeCompleteMotion === "function"
        ? options.playTradeCompleteMotion
        : async () => {};
    const playShellRewardAnimation = typeof options.playShellRewardAnimation === "function"
        ? options.playShellRewardAnimation
        : () => {};

    let shopTradeMotionLock = false;
    let shopTradeMotionToken = 0;
    let shopActiveTradeMotion = null;

    function syncShopAfterTradeMotion() {
        updateMerchantPresence(Date.now());
        saveState();
        renderMainPage();
        renderWarehousePage();
        renderShopPage();
    }

    function cancelActiveTradeMotion() {
        if (!shopActiveTradeMotion) {
            return;
        }

        const { merchantId, sourceElement, abortController } = shopActiveTradeMotion;
        shopActiveTradeMotion = null;
        shopTradeMotionLock = false;

        if (abortController) {
            abortController.abort();
        }

        if (sourceElement instanceof HTMLElement && sourceElement.isConnected) {
            setMerchantImageVariant(sourceElement, merchantId, "base");
        }
    }

    function startTradeCompleteMotion(merchantId, sourceElement) {
        const motionSourceElement = resolvePurchaseSourceElement(merchantId, sourceElement);
        cancelActiveTradeMotion();

        if (!(motionSourceElement instanceof HTMLElement) || !motionSourceElement.isConnected) {
            shopTradeMotionLock = false;
            shopActiveTradeMotion = null;
            return null;
        }

        const token = ++shopTradeMotionToken;
        const abortController = new AbortController();

        shopTradeMotionLock = true;
        shopActiveTradeMotion = {
            token,
            merchantId,
            sourceElement: motionSourceElement,
            abortController
        };

        void playTradeCompleteMotion({
            merchantId,
            merchantNode: motionSourceElement,
            signal: abortController.signal
        }).finally(() => {
            if (!shopActiveTradeMotion || shopActiveTradeMotion.token !== token) {
                return;
            }

            shopActiveTradeMotion = null;
            shopTradeMotionLock = false;
            syncShopAfterTradeMotion();
        });

        return motionSourceElement;
    }

    function collectItemIdsFromTradeItems(items) {
        if (!Array.isArray(items) || items.length <= 0) {
            return [];
        }

        const itemIds = [];
        for (let i = 0; i < items.length; i += 1) {
            const itemId = items[i]?.id;
            if (typeof itemId !== "string" || itemId.length <= 0) {
                return [];
            }
            itemIds.push(itemId);
        }

        return itemIds;
    }

    function consumeTransportItemsStrictByIds(itemIds) {
        if (!Array.isArray(itemIds) || itemIds.length <= 0) {
            return false;
        }

        const requestedIdSet = new Set();
        for (let i = 0; i < itemIds.length; i += 1) {
            const itemId = itemIds[i];
            if (typeof itemId !== "string" || itemId.length <= 0 || requestedIdSet.has(itemId)) {
                return false;
            }
            requestedIdSet.add(itemId);
        }

        const transportItems = getTransportModeTransportItems();
        const availableIdSet = new Set();
        for (let i = 0; i < transportItems.length; i += 1) {
            const itemId = transportItems[i]?.id;
            if (typeof itemId === "string" && itemId.length > 0) {
                availableIdSet.add(itemId);
            }
        }

        for (const itemId of requestedIdSet) {
            if (!availableIdSet.has(itemId)) {
                return false;
            }
        }

        const removedItems = consumeTransportModeItemsByIds(itemIds);
        return removedItems.length === itemIds.length;
    }

    function consumeMatchedTransportItems(context) {
        const selectedItems = Array.isArray(context?.selectedItems) ? context.selectedItems : [];
        const itemIds = collectItemIdsFromTradeItems(selectedItems);
        if (itemIds.length !== selectedItems.length) {
            return false;
        }

        return consumeTransportItemsStrictByIds(itemIds);
    }

    function applyTradeResult(merchantId, sourceElement, tradeResult) {
        if (!tradeResult?.ok) {
            if (!tradeResult?.silent && tradeResult?.message) {
                setShopMessage(tradeResult.message);
            }
            return false;
        }

        const progressionMessages = Array.isArray(tradeResult.progressionMessages) ? tradeResult.progressionMessages : [];
        saveState();

        const motionSourceElement = startTradeCompleteMotion(merchantId, sourceElement);
        if (!motionSourceElement) {
            syncShopAfterTradeMotion();
        }

        playShellRewardAnimation(motionSourceElement || sourceElement, tradeResult.shellsEarned);

        if (progressionMessages.length > 0) {
            const unlockMessage = progressionMessages[0];
            setShopMessage(unlockMessage);
            showGlobalMessage(unlockMessage);
            return true;
        }

        setShopMessage(tradeResult.message);
        return true;
    }

    async function attemptMerchantPurchase(merchantId, sourceElement) {
        const now = Date.now();
        const merchant = merchantRegistry[merchantId];
        const merchantState = getMerchantState(merchantId);

        if (!merchant || !merchantState) {
            return;
        }

        const shouldUseTransportItems = isTransportModeEnabled();
        const tradeResult = shouldUseTransportItems
            ? attemptMerchantTradeWithInventory({
                currentState: state,
                merchant,
                merchantState,
                now,
                inventoryItems: getTransportModeTransportItems(),
                consumeMatchedItemsFn: consumeMatchedTransportItems,
                applyProgressionFn: applyProgression,
                progressionReason: "merchant_purchase"
            })
            : attemptMerchantTrade({
                currentState: state,
                merchant,
                merchantState,
                now,
                applyProgressionFn: applyProgression,
                progressionReason: "merchant_purchase"
            });

        applyTradeResult(merchantId, sourceElement, tradeResult);
    }

    async function attemptMerchantPurchaseByTransportItem(options = {}) {
        const merchantId = typeof options?.merchantId === "string" ? options.merchantId : "";
        const transportItemId = typeof options?.transportItemId === "string" ? options.transportItemId : "";
        const sourceElement = options?.sourceElement;

        if (!merchantId || !transportItemId || !isTransportModeEnabled()) {
            return false;
        }

        const now = Date.now();
        const merchant = merchantRegistry[merchantId];
        const merchantState = getMerchantState(merchantId);
        if (!merchant || !merchantState) {
            return false;
        }

        const transportItems = getTransportModeTransportItems();
        const targetItem = transportItems.find((item) => item?.id === transportItemId);
        if (!targetItem) {
            return false;
        }

        const tradeResult = attemptMerchantTradeWithInventory({
            currentState: state,
            merchant,
            merchantState,
            now,
            inventoryItems: [targetItem],
            consumeMatchedItemsFn: (consumeContext) => {
                const selectedItems = Array.isArray(consumeContext?.selectedItems) ? consumeContext.selectedItems : [];
                if (selectedItems.length !== 1 || selectedItems[0]?.id !== transportItemId) {
                    return false;
                }

                return consumeTransportItemsStrictByIds([transportItemId]);
            },
            applyProgressionFn: applyProgression,
            progressionReason: "merchant_purchase"
        });

        return applyTradeResult(merchantId, sourceElement, tradeResult);
    }

    function isTradeMotionLocked() {
        return shopTradeMotionLock;
    }

    return {
        attemptMerchantPurchase,
        attemptMerchantPurchaseByTransportItem,
        isTradeMotionLocked
    };
}
