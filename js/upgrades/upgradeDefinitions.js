// 파일 역할: 업그레이드 메타데이터(섹션/라벨/설명/가격/한도)를 선언한다.
// 핵심 책임: 섹션별 조회와 id 조회 함수로 UI 렌더링 입력 데이터를 제공한다.
// 연동 범위: 업그레이드 정책을 코드 흐름과 분리한 정적 정의 파일이다.

import { getUpgradeCost } from "./upgradeCost.js";
import {
    ALGAE_MANAGEMENT_UPGRADE_BASE_COST,
    BIGGER_SPLIT_BASE_COST,
    FERTILIZER_UPGRADE_BASE_COST,
    MAX_DIAMETER_UPGRADE_BASE_COST,
    WATER_CURRENT_UPGRADE_BASE_COST,
    getAlgaeGrowthBonusRatio,
    getAlgaeManagementLevel,
    getFertilizerCapVolume,
    getFertilizerLevel,
    getMaxMarimoVolume,
    getWaterCurrentLevel,
    getWaterCurrentRollingDistancePerSecond,
    isSplitUpgradePurchased,
    isSplitUpgradeUnlocked
} from "./upgradeSelectors.js";

const upgradeDefinitions = [
    {
        id: "waterCurrentUpgrade",
        sectionId: "hardware",
        label: "Water Current",
        kind: "repeatable",
        isVisible: () => true,
        getCost: (currentState) => getUpgradeCost(WATER_CURRENT_UPGRADE_BASE_COST, getWaterCurrentLevel(currentState)),
        getMetaText: (currentState) => `Lv.${getWaterCurrentLevel(currentState)} · Auto roll/sec ${getWaterCurrentRollingDistancePerSecond(currentState).toFixed(1)}`,
        isPurchased: () => false
    },
    {
        id: "algaeManagementUpgrade",
        sectionId: "hardware",
        label: "Algae Control",
        kind: "repeatable",
        isVisible: () => true,
        getCost: (currentState) => getUpgradeCost(ALGAE_MANAGEMENT_UPGRADE_BASE_COST, getAlgaeManagementLevel(currentState)),
        getMetaText: (currentState) => `Lv.${getAlgaeManagementLevel(currentState)} · Growth boost +${(getAlgaeGrowthBonusRatio(currentState) * 100).toFixed(0)}%`,
        isPurchased: () => false
    },
    {
        id: "fertilizerUpgrade",
        sectionId: "hardware",
        label: "Fertilizer",
        kind: "repeatable",
        isVisible: () => true,
        getCost: (currentState) => getUpgradeCost(FERTILIZER_UPGRADE_BASE_COST, getFertilizerLevel(currentState)),
        getMetaText: (currentState) => `Lv.${getFertilizerLevel(currentState)} · Growth per use ${getFertilizerCapVolume(currentState).toFixed(2)}`,
        isPurchased: () => false
    },
    {
        id: "maxDiameterUpgrade",
        sectionId: "software",
        label: "Size Threshold +1",
        kind: "repeatable",
        isVisible: () => true,
        getCost: (currentState) => getUpgradeCost(
            MAX_DIAMETER_UPGRADE_BASE_COST,
            Number.isFinite(currentState?.upgrades?.maxDiameterUpgrade) ? currentState.upgrades.maxDiameterUpgrade : 0
        ),
        getMetaText: (currentState) => `Growth threshold volume: ${getMaxMarimoVolume(currentState).toFixed(2)}`,
        isPurchased: () => false
    },
    {
        id: "biggerSplit",
        sectionId: "software",
        label: "bigger split!",
        kind: "one_time",
        isVisible: (currentState) => isSplitUpgradeUnlocked(currentState) || isSplitUpgradePurchased(currentState),
        getCost: () => getUpgradeCost(BIGGER_SPLIT_BASE_COST, 0),
        getMetaText: (currentState) => (isSplitUpgradePurchased(currentState) ? "Purchased" : "Expand split max to 2"),
        isPurchased: (currentState) => isSplitUpgradePurchased(currentState)
    }
];

export function getUpgradeDefinitionsBySection(sectionId) {
    return upgradeDefinitions.filter((definition) => definition.sectionId === sectionId);
}

export function getUpgradeDefinition(upgradeId) {
    return upgradeDefinitions.find((definition) => definition.id === upgradeId) || null;
}

export function getAllUpgradeDefinitions() {
    return [...upgradeDefinitions];
}
