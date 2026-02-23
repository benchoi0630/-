// 파일 역할: 업그레이드 구매 실행 시 상태 변경과 비용 차감을 처리한다.
// 핵심 책임: 반복형과 단발형 업그레이드 규칙 분기와 progression 연동을 수행한다.
// 연동 범위: upgrade id 기반 구매 진입 함수로 로직 계층을 제공한다.

import { getUpgradeCost } from "./upgradeCost.js";
import {
    ALGAE_MANAGEMENT_UPGRADE_BASE_COST,
    BIGGER_SPLIT_BASE_COST,
    DEFAULT_MAX_MARIMO_VOLUME,
    FERTILIZER_UPGRADE_BASE_COST,
    MAX_DIAMETER_UPGRADE_BASE_COST,
    WATER_CURRENT_UPGRADE_BASE_COST,
    isSplitUpgradeUnlocked
} from "./upgradeSelectors.js";

const repeatableUpgradeBaseCostMap = {
    fertilizerUpgrade: FERTILIZER_UPGRADE_BASE_COST,
    maxDiameterUpgrade: MAX_DIAMETER_UPGRADE_BASE_COST,
    waterCurrentUpgrade: WATER_CURRENT_UPGRADE_BASE_COST,
    algaeManagementUpgrade: ALGAE_MANAGEMENT_UPGRADE_BASE_COST
};

function applyProgressionWithReason(currentState, applyProgressionFn, reason) {
    if (typeof applyProgressionFn !== "function") {
        return [];
    }

    return applyProgressionFn(currentState, reason);
}

function purchaseRepeatableUpgrade(currentState, applyProgressionFn, key) {
    const baseCost = repeatableUpgradeBaseCostMap[key];
    if (!Number.isFinite(baseCost)) {
        return {
            ok: false,
            message: "Unknown upgrade.",
            progressionMessages: []
        };
    }

    const currentLevel = Number.isFinite(currentState?.upgrades?.[key]) ? currentState.upgrades[key] : 0;
    const cost = getUpgradeCost(baseCost, currentLevel);

    if (currentState.currency.shells < cost) {
        return {
            ok: false,
            message: "Need more shells.",
            progressionMessages: []
        };
    }

    currentState.currency.shells -= cost;
    currentState.upgrades[key] = currentLevel + 1;

    if (key === "maxDiameterUpgrade") {
        const currentMaxVolume = Number.isFinite(currentState.maxMarimoVolume) ? currentState.maxMarimoVolume : DEFAULT_MAX_MARIMO_VOLUME;
        currentState.maxMarimoVolume = Math.max(0.1, currentMaxVolume + 1);
        currentState.maxMarimoDiameter = currentState.maxMarimoVolume;
    }

    return {
        ok: true,
        message: "Upgrade purchased.",
        progressionMessages: applyProgressionWithReason(currentState, applyProgressionFn, `upgrade-${key}`)
    };
}

function purchaseBiggerSplitUpgrade(currentState, applyProgressionFn) {
    const cost = getUpgradeCost(BIGGER_SPLIT_BASE_COST, 0);
    const alreadyPurchased = Number.isFinite(currentState?.upgrades?.splitUpgrade) && currentState.upgrades.splitUpgrade >= 1;

    if (!isSplitUpgradeUnlocked(currentState)) {
        return {
            ok: false,
            message: "Unlock 'Send to warehouse' first.",
            progressionMessages: []
        };
    }

    if (alreadyPurchased) {
        return {
            ok: false,
            message: "Bigger split already purchased.",
            progressionMessages: []
        };
    }

    if (currentState.currency.shells < cost) {
        return {
            ok: false,
            message: "Need more shells.",
            progressionMessages: []
        };
    }

    currentState.currency.shells -= cost;
    currentState.upgrades.splitUpgrade = Math.max(1, Number.isFinite(currentState.upgrades.splitUpgrade) ? Math.round(currentState.upgrades.splitUpgrade) : 0);
    currentState.split.maxVolume = 2;
    currentState.split.currentVolume = Math.min(currentState.split.currentVolume, currentState.split.maxVolume);

    return {
        ok: true,
        message: "Bigger split purchased.",
        progressionMessages: applyProgressionWithReason(currentState, applyProgressionFn, "upgrade-bigger-split")
    };
}

export function purchaseUpgradeById(currentState, applyProgressionFn, upgradeId) {
    if (Object.prototype.hasOwnProperty.call(repeatableUpgradeBaseCostMap, upgradeId)) {
        return purchaseRepeatableUpgrade(currentState, applyProgressionFn, upgradeId);
    }

    if (upgradeId === "biggerSplit") {
        return purchaseBiggerSplitUpgrade(currentState, applyProgressionFn);
    }

    return {
        ok: false,
        message: "Unknown upgrade.",
        progressionMessages: []
    };
}
