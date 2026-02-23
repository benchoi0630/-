// 파일 역할: 현재 상태에서 업그레이드 효과값과 해금 여부를 계산하는 selector 모듈이다.
// 핵심 책임: 영양제 캡 부피, 물살·녹조 효과, 최대 부피/지름, split 해금 상태를 파생 계산한다.
// 연동 범위: 게임 로직이 직접 상태 필드를 해석하지 않도록 추상화 계층을 제공한다.

import { volumeToDiameter } from "../utils/marimoData.js";

export const FERTILIZER_UPGRADE_BASE_COST = 3;
export const BIGGER_SPLIT_BASE_COST = 10;
export const MAX_DIAMETER_UPGRADE_BASE_COST = 10;
export const WATER_CURRENT_UPGRADE_BASE_COST = 12;
export const ALGAE_MANAGEMENT_UPGRADE_BASE_COST = 14;
export const DEFAULT_MAX_MARIMO_VOLUME = 3;
export const DEFAULT_MAX_MARIMO_DIAMETER = DEFAULT_MAX_MARIMO_VOLUME;

const BASE_FERTILIZER_CAP_VOLUME = 0.12;
const FERTILIZER_CAP_VOLUME_PER_LEVEL = 0.06;
const WATER_CURRENT_ROLLING_DISTANCE_PER_SECOND_PER_LEVEL = 12;
const ALGAE_GROWTH_BONUS_RATIO_PER_LEVEL = 0.08;

function getProgressionLevel(currentState, track) {
    const level = currentState?.progression?.[track];
    return Number.isFinite(level) ? Math.max(0, Math.round(level)) : 0;
}

export function isSplitUpgradeUnlocked(currentState) {
    return getProgressionLevel(currentState, "feature") >= 1;
}

export function isSplitUpgradePurchased(currentState) {
    return getProgressionLevel(currentState, "split") >= 1;
}

export function getFertilizerLevel(currentState) {
    const rawLevel = currentState?.upgrades?.fertilizerUpgrade;
    return Number.isFinite(rawLevel) ? Math.max(0, Math.round(rawLevel)) : 0;
}

export function getFertilizerCapVolume(currentState) {
    return BASE_FERTILIZER_CAP_VOLUME + (getFertilizerLevel(currentState) * FERTILIZER_CAP_VOLUME_PER_LEVEL);
}

export function getWaterCurrentLevel(currentState) {
    const rawLevel = currentState?.upgrades?.waterCurrentUpgrade;
    return Number.isFinite(rawLevel) ? Math.max(0, Math.round(rawLevel)) : 0;
}

export function getAlgaeManagementLevel(currentState) {
    const rawLevel = currentState?.upgrades?.algaeManagementUpgrade;
    return Number.isFinite(rawLevel) ? Math.max(0, Math.round(rawLevel)) : 0;
}

export function getWaterCurrentRollingDistancePerSecond(currentState) {
    return getWaterCurrentLevel(currentState) * WATER_CURRENT_ROLLING_DISTANCE_PER_SECOND_PER_LEVEL;
}

export function getAlgaeGrowthBonusRatio(currentState) {
    return getAlgaeManagementLevel(currentState) * ALGAE_GROWTH_BONUS_RATIO_PER_LEVEL;
}

export function getMaxMarimoVolume(currentState) {
    const volumeValue = currentState?.maxMarimoVolume;
    if (Number.isFinite(volumeValue)) {
        return Math.max(0.1, volumeValue);
    }

    const legacyDiameterValue = currentState?.maxMarimoDiameter;
    if (Number.isFinite(legacyDiameterValue)) {
        return Math.max(0.1, legacyDiameterValue);
    }

    return DEFAULT_MAX_MARIMO_VOLUME;
}

export function getMaxMarimoDiameter(currentState) {
    return volumeToDiameter(getMaxMarimoVolume(currentState));
}
