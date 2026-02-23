// 파일 역할: 상점 구매 시도와 거래 모션 락, 후속 상태 동기화 흐름을 관리한다.
// 핵심 책임: 거래 결과 메시지·progression·페이지 재렌더·보상 애니메이션 호출 순서를 통제한다.
// 연동 범위: 상점 트랜잭션을 뷰 계층에서 분리한 컨트롤러 팩토리를 제공한다.

import { state, saveState } from "../../state.js";
import { applyProgression } from "../../progression/progressionLogic.js";
import { merchantRegistry } from "../../merchants/merchantsIndex.js";
import { attemptMerchantTrade } from "../../merchants/merchantTrade.js";
import { setMerchantImageVariant } from "../../merchants/merchantUI.js";

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

    async function attemptMerchantPurchase(merchantId, sourceElement) {
        const now = Date.now();
        const merchant = merchantRegistry[merchantId];
        const merchantState = getMerchantState(merchantId);

        if (!merchant || !merchantState) {
            return;
        }

        const tradeResult = attemptMerchantTrade({
            currentState: state,
            merchant,
            merchantState,
            now,
            applyProgressionFn: applyProgression,
            progressionReason: "merchant_purchase"
        });

        if (!tradeResult.ok) {
            if (!tradeResult.silent && tradeResult.message) {
                setShopMessage(tradeResult.message);
            }
            return;
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
            return;
        }

        setShopMessage(tradeResult.message);
    }

    function isTradeMotionLocked() {
        return shopTradeMotionLock;
    }

    return {
        attemptMerchantPurchase,
        isTradeMotionLocked
    };
}
