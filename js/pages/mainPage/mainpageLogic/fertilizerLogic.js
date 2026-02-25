// 파일 역할: 메인 페이지 영양제 기능의 상태 정규화와 사용 처리를 담당한다.
// 핵심 책임: 영양제 충전량, growth 상태 보정, 임시 비활성화 정책을 일관되게 적용한다.
// 연동 범위: 액션 로직과 성장 엔진이 공통으로 참조한다.

import { hasMainMarimo } from "../../../utils/marimoData.js";
import { getFertilizerCapVolume } from "../../../upgrades/upgradeSelectors.js";

export const MAX_ACCUMULATED_NUTRITION_DISTANCE = 500;
export const FERTILIZER_CHARGE_DISTANCE = 100;
const FERTILIZER_FEATURE_ENABLED = false;

function toSafeDistance(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isFertilizerFeatureEnabled() {
    return FERTILIZER_FEATURE_ENABLED;
}

export function ensureGrowthState(currentState) {
    if (!currentState.growth || typeof currentState.growth !== "object") {
        currentState.growth = {
            feeding: false,
            capVolume: 0,
            accumulatedNutrition: 0,
            marimoFixed: false
        };
    }

    const growth = currentState.growth;
    growth.capVolume = toSafeDistance(growth.capVolume);
    const legacyConsumedRollingDistance = Number.isFinite(growth.consumedRollingDistance)
        ? Math.max(0, growth.consumedRollingDistance)
        : 0;
    growth.accumulatedNutrition = Number.isFinite(growth.accumulatedNutrition)
        ? Math.max(0, growth.accumulatedNutrition)
        : legacyConsumedRollingDistance;
    growth.accumulatedNutrition = Math.min(MAX_ACCUMULATED_NUTRITION_DISTANCE, growth.accumulatedNutrition);
    growth.feeding = growth.accumulatedNutrition > 0;
    growth.marimoFixed = growth.marimoFixed === true;

    if (!FERTILIZER_FEATURE_ENABLED) {
        growth.feeding = false;
        growth.capVolume = 0;
        growth.accumulatedNutrition = 0;
    }

    return growth;
}

export function useFertilizer(currentState) {
    const growth = ensureGrowthState(currentState);

    if (!hasMainMarimo(currentState)) {
        growth.feeding = false;
        growth.capVolume = 0;
        growth.accumulatedNutrition = 0;
        return {
            applied: false,
            blocked: false,
            feeding: growth.feeding,
            capVolume: growth.capVolume,
            accumulatedNutrition: growth.accumulatedNutrition
        };
    }

    if (!FERTILIZER_FEATURE_ENABLED) {
        return {
            applied: false,
            blocked: true,
            feeding: growth.feeding,
            capVolume: growth.capVolume,
            accumulatedNutrition: growth.accumulatedNutrition
        };
    }

    growth.feeding = true;
    growth.capVolume = getFertilizerCapVolume(currentState);
    growth.accumulatedNutrition = Math.min(MAX_ACCUMULATED_NUTRITION_DISTANCE, growth.accumulatedNutrition + FERTILIZER_CHARGE_DISTANCE);
    growth.feeding = growth.accumulatedNutrition > 0;

    return {
        applied: true,
        blocked: false,
        feeding: growth.feeding,
        capVolume: growth.capVolume,
        accumulatedNutrition: growth.accumulatedNutrition
    };
}
