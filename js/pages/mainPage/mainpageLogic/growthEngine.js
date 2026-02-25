// 파일 역할: 메인 페이지의 영양제·환경 기반 굴림 성장 엔진을 제공한다.
// 핵심 책임: feeding 상태, 굴림 거리 누적, 자동 물살·녹조 성장 계산을 일관되게 처리한다.
// 연동 범위: mainPage 액션 로직이 이 엔진을 호출해 성장 규칙을 적용한다.

import { hasMainMarimo } from "../../../utils/marimoData.js";
import { getAlgaeGrowthBonusRatio, getMaxMarimoVolume, getWaterCurrentRollingDistancePerSecond } from "../../../upgrades/upgradeSelectors.js";
import { FERTILIZER_CHARGE_DISTANCE, MAX_ACCUMULATED_NUTRITION_DISTANCE, ensureGrowthState } from "./fertilizerLogic.js";

export const ROLL_GAIN = 1;
export const AUTO_GROWTH_VOLUME_PER_DISTANCE = 0.0012;
const SOFT_CAP_BRAKE_STRENGTH = 10;
const SOFT_CAP_INTEGRATION_STEPS = 24;

export { FERTILIZER_CHARGE_DISTANCE, MAX_ACCUMULATED_NUTRITION_DISTANCE } from "./fertilizerLogic.js";

function toSafeDistance(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toSafeDeltaSeconds(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function ensureEnvironmentState(currentState) {
    if (!currentState.environment || typeof currentState.environment !== "object") {
        currentState.environment = {
            waterCurrent: 0,
            algae: 0
        };
    }

    const environment = currentState.environment;
    environment.waterCurrent = toSafeDistance(getWaterCurrentRollingDistancePerSecond(currentState));
    environment.algae = toSafeDistance(getAlgaeGrowthBonusRatio(currentState));
    return environment;
}

function getSoftCapGrowthMultiplier(currentVolume, thresholdVolume) {
    if (!Number.isFinite(currentVolume) || !Number.isFinite(thresholdVolume) || thresholdVolume <= 0) {
        return 1;
    }

    if (currentVolume <= thresholdVolume) {
        return 1;
    }

    const overThresholdRatio = (currentVolume - thresholdVolume) / thresholdVolume;
    return 1 / (1 + (overThresholdRatio * SOFT_CAP_BRAKE_STRENGTH));
}

function applySoftCapGrowthDelta(currentVolume, requestedDeltaVolume, thresholdVolume) {
    const safeRequestedDelta = Number.isFinite(requestedDeltaVolume) ? Math.max(0, requestedDeltaVolume) : 0;
    if (safeRequestedDelta <= 0) {
        return 0;
    }

    const safeCurrentVolume = Number.isFinite(currentVolume) ? Math.max(0, currentVolume) : 0;
    const safeThresholdVolume = Number.isFinite(thresholdVolume) && thresholdVolume > 0 ? thresholdVolume : 1;
    let simulatedVolume = safeCurrentVolume;
    let remainingRequestedDelta = safeRequestedDelta;
    let appliedDelta = 0;

    if (simulatedVolume < safeThresholdVolume) {
        const uncappedDelta = Math.min(remainingRequestedDelta, safeThresholdVolume - simulatedVolume);
        appliedDelta += uncappedDelta;
        simulatedVolume += uncappedDelta;
        remainingRequestedDelta -= uncappedDelta;
    }

    if (remainingRequestedDelta <= 0) {
        return appliedDelta;
    }

    // 임계값 이후 구간은 작은 스텝으로 나눠 누적 감쇠를 적용해 점진적으로 성장률을 낮춘다.
    const stepCount = Math.max(1, SOFT_CAP_INTEGRATION_STEPS);
    const requestedStep = remainingRequestedDelta / stepCount;

    for (let index = 0; index < stepCount; index += 1) {
        const growthMultiplier = getSoftCapGrowthMultiplier(simulatedVolume, safeThresholdVolume);
        const appliedStep = requestedStep * growthMultiplier;

        if (appliedStep <= 0) {
            continue;
        }

        appliedDelta += appliedStep;
        simulatedVolume += appliedStep;
    }

    return appliedDelta;
}

function calculateAutoGrowthVolume(currentState, rollingDelta) {
    if (rollingDelta <= 0 || !hasMainMarimo(currentState)) {
        return 0;
    }

    const environment = ensureEnvironmentState(currentState);
    const algaeGrowthBonusRatio = toSafeDistance(environment.algae);
    const effectiveGrowthDistance = rollingDelta + (rollingDelta * algaeGrowthBonusRatio);
    return effectiveGrowthDistance * AUTO_GROWTH_VOLUME_PER_DISTANCE;
}

export function calculateAutoRollingSurfaceDistance(currentState, deltaSeconds) {
    const safeDeltaSeconds = toSafeDeltaSeconds(deltaSeconds);
    if (safeDeltaSeconds <= 0) {
        return 0;
    }

    const growth = ensureGrowthState(currentState);
    if (growth.marimoFixed === true) {
        return 0;
    }

    const environment = ensureEnvironmentState(currentState);
    const waterCurrentRollingDistancePerSecond = toSafeDistance(environment.waterCurrent);
    return waterCurrentRollingDistancePerSecond * safeDeltaSeconds;
}

export function stopFeeding(currentState) {
    const growth = ensureGrowthState(currentState);
    growth.feeding = false;
    growth.accumulatedNutrition = 0;
    return growth.feeding;
}

export function getGrowthSnapshot(currentState) {
    const environment = ensureEnvironmentState(currentState);
    const growth = ensureGrowthState(currentState);
    const remainingRollingDistance = Math.max(0, growth.accumulatedNutrition);
    const waterCurrentRollingDistancePerSecond = toSafeDistance(environment.waterCurrent);
    const algaeGrowthBonusRatio = toSafeDistance(environment.algae);

    return {
        feeding: growth.feeding,
        capVolume: growth.capVolume,
        accumulatedNutrition: growth.accumulatedNutrition,
        marimoFixed: growth.marimoFixed === true,
        remainingRollingDistance,
        requiredRollingDistance: FERTILIZER_CHARGE_DISTANCE,
        maxAccumulatedNutrition: MAX_ACCUMULATED_NUTRITION_DISTANCE,
        rollGain: ROLL_GAIN,
        waterCurrentRollingDistancePerSecond,
        algaeGrowthBonusRatio
    };
}

export function applyRollingGrowth(currentState, rollingSurfaceDistance) {
    const growth = ensureGrowthState(currentState);
    const safeRollingSurfaceDistance = toSafeDistance(rollingSurfaceDistance);
    const rollingDelta = safeRollingSurfaceDistance * ROLL_GAIN;

    if (rollingDelta <= 0 || !hasMainMarimo(currentState)) {
        return {
            didGrow: false,
            rollingDelta,
            usableRolling: 0,
            deltaVolume: 0,
            autoDeltaVolume: 0,
            fertilizerDeltaVolume: 0,
            feeding: growth.feeding,
            accumulatedNutrition: growth.accumulatedNutrition,
            remainingRollingDistance: Math.max(0, growth.accumulatedNutrition)
        };
    }

    const requestedAutoDeltaVolume = calculateAutoGrowthVolume(currentState, rollingDelta);

    let usableRolling = 0;
    let requestedFertilizerDeltaVolume = 0;
    const remainingRollingDistance = Math.max(0, growth.accumulatedNutrition);

    if (remainingRollingDistance > 0 && growth.feeding === true) {
        usableRolling = Math.min(rollingDelta, remainingRollingDistance);
        const growthPerUnit = growth.capVolume / FERTILIZER_CHARGE_DISTANCE;
        requestedFertilizerDeltaVolume = usableRolling * growthPerUnit;

        growth.accumulatedNutrition = Math.max(0, growth.accumulatedNutrition - usableRolling);
    }

    const nextRemainingRollingDistance = Math.max(0, growth.accumulatedNutrition);
    if (nextRemainingRollingDistance <= 0) {
        growth.feeding = false;
    }

    const requestedDeltaVolume = requestedAutoDeltaVolume + requestedFertilizerDeltaVolume;
    const currentVolume = Number.isFinite(currentState?.marimo?.volume) ? Math.max(0, currentState.marimo.volume) : 0;
    const thresholdVolume = getMaxMarimoVolume(currentState);
    const deltaVolume = applySoftCapGrowthDelta(currentVolume, requestedDeltaVolume, thresholdVolume);

    if (deltaVolume > 0) {
        currentState.marimo.volume = currentVolume + deltaVolume;
    }

    const growthScale = requestedDeltaVolume > 0 ? (deltaVolume / requestedDeltaVolume) : 0;
    const autoDeltaVolume = requestedAutoDeltaVolume * growthScale;
    const fertilizerDeltaVolume = requestedFertilizerDeltaVolume * growthScale;

    return {
        didGrow: deltaVolume > 0,
        rollingDelta,
        usableRolling,
        deltaVolume,
        autoDeltaVolume,
        fertilizerDeltaVolume,
        feeding: growth.feeding,
        accumulatedNutrition: growth.accumulatedNutrition,
        remainingRollingDistance: nextRemainingRollingDistance
    };
}
