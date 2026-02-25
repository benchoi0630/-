// 파일 역할: 메인 페이지 사용자 액션(영양제 사용·굴림·분할·창고이동) 실행 로직을 담당한다.
// 핵심 책임: 상태 변경, progression 반영, 저장, UI 메시지와 후속 렌더 호출 순서를 통제한다.
// 연동 범위: 이벤트 바인딩 계층이 호출하는 액션 핸들러 집합을 제공한다.

import { state, saveState } from "../../../state.js";
import { applyProgression } from "../../../progression/progressionLogic.js";
import { createMarimoRecordId, getMarimoType, hasMainMarimo } from "../../../utils/marimoData.js";
import { applyRollingGrowth } from "./growthEngine.js";
import { useFertilizer } from "./fertilizerLogic.js";
import { getSplitAmount, isSendToWarehouseUnlocked, syncMainMarimoDerivedState, volumeToDiameter } from "./runtime/mainPageStateLogic.js";

const SWIPE_TO_ROLL_DISTANCE_GAIN = 1;

function runContextRender(context, key) {
    if (typeof context?.[key] === "function") {
        context[key]();
    }
}

export function calculateRollingSurfaceDistance(dx, dy, options = {}) {
    const safeDx = Number.isFinite(dx) ? dx : 0;
    const safeDy = Number.isFinite(dy) ? dy : 0;
    const dragDistance = Math.sqrt((safeDx * safeDx) + (safeDy * safeDy));
    if (dragDistance <= 0) {
        return {
            signedDistance: 0,
            distanceAbs: 0
        };
    }

    const centerX = Number.isFinite(options?.centerX) ? options.centerX : null;
    const centerY = Number.isFinite(options?.centerY) ? options.centerY : null;
    const pointX = Number.isFinite(options?.pointX) ? options.pointX : null;
    const pointY = Number.isFinite(options?.pointY) ? options.pointY : null;

    if (
        Number.isFinite(centerX) && Number.isFinite(centerY)
        && Number.isFinite(pointX) && Number.isFinite(pointY)
    ) {
        const radialX = pointX - centerX;
        const radialY = pointY - centerY;
        const radialLength = Math.sqrt((radialX * radialX) + (radialY * radialY));

        if (radialLength > 0) {
            // 중심점 기준 반지름 벡터를 시계방향 90도 회전한 접선 방향 성분만 굴림 거리로 사용한다.
            const tangentX = -radialY / radialLength;
            const tangentY = radialX / radialLength;
            const signedDistance = (safeDx * tangentX + safeDy * tangentY) * SWIPE_TO_ROLL_DISTANCE_GAIN;
            return {
                signedDistance,
                distanceAbs: Math.abs(signedDistance)
            };
        }
    }

    const directionBase = Math.abs(safeDx) >= Math.abs(safeDy) ? safeDx : safeDy;
    const direction = directionBase === 0 ? 1 : Math.sign(directionBase);
    const signedDistance = dragDistance * SWIPE_TO_ROLL_DISTANCE_GAIN * direction;

    return {
        signedDistance,
        distanceAbs: Math.abs(signedDistance)
    };
}

export function handleMainMarimoClick(options = {}) {
    const mainPageUI = options.mainPageUI;
    const renderMainPage = options.renderMainPage;

    if (!hasMainMarimo(state)) {
        return;
    }

    const fertilizerResult = useFertilizer(state);

    if (fertilizerResult.blocked) {
        mainPageUI?.setMainMessage("Fertilizer is temporarily disabled.");
    }

    saveState();

    if (fertilizerResult.applied && typeof mainPageUI?.triggerFertilizerFaceExpression === "function") {
        mainPageUI.triggerFertilizerFaceExpression();
    }

    if (typeof renderMainPage === "function") {
        renderMainPage();
    }
}

export function handleToggleMarimoFixed(options = {}) {
    const mainPageUI = options.mainPageUI;
    const renderMainPage = options.renderMainPage;

    if (!state.growth || typeof state.growth !== "object") {
        state.growth = {
            feeding: false,
            capVolume: 0,
            accumulatedNutrition: 0,
            marimoFixed: false
        };
    }

    state.growth.marimoFixed = state.growth.marimoFixed !== true;
    const marimoFixed = state.growth.marimoFixed === true;

    saveState();
    if (typeof mainPageUI?.setMainMessage === "function") {
        mainPageUI.setMainMessage(marimoFixed ? "해류 자동 성장이 정지되었습니다." : "해류 자동 성장이 다시 활성화되었습니다.");
    }

    if (typeof renderMainPage === "function") {
        renderMainPage();
    }

    return marimoFixed;
}

export function handleMainMarimoRolling(options = {}) {
    const rollingSurfaceDistance = Number(options.rollingSurfaceDistance);
    const safeRollingSurfaceDistance = Number.isFinite(rollingSurfaceDistance) ? Math.max(0, rollingSurfaceDistance) : 0;
    const renderMainPage = options.renderMainPage;

    if (safeRollingSurfaceDistance <= 0) {
        return {
            didGrow: false,
            deltaVolume: 0
        };
    }

    const prevVolume = hasMainMarimo(state) ? Number(state.marimo.volume) : 0;
    const result = applyRollingGrowth(state, safeRollingSurfaceDistance);
    let didGrowAfterClamp = result.didGrow;

    if (result.didGrow || result.usableRolling > 0) {
        syncMainMarimoDerivedState(state);
        const nextVolume = hasMainMarimo(state) ? Number(state.marimo.volume) : 0;
        didGrowAfterClamp = nextVolume > prevVolume;

        if ((didGrowAfterClamp || result.usableRolling > 0) && typeof renderMainPage === "function") {
            renderMainPage();
        }
    }

    return {
        ...result,
        didGrow: didGrowAfterClamp
    };
}

export function handleSplit(options = {}) {
    const context = options.context || {};
    const mainPageUI = options.mainPageUI;

    if (!hasMainMarimo(state)) {
        mainPageUI?.setMainMessage("No main marimo to send.");
        return;
    }

    const splitAmount = getSplitAmount(state);

    if (splitAmount <= 0) {
        mainPageUI?.setMainMessage("Split volume must be above 0.");
        return;
    }

    if (state.marimo.volume < splitAmount) {
        mainPageUI?.setMainMessage("Not enough volume.");
        return;
    }

    const minMainVolumeAfterSplit = Number.isFinite(state.split?.minMainVolumeAfterSplit) ? state.split.minMainVolumeAfterSplit : 1;
    const remainingVolume = state.marimo.volume - splitAmount;

    if (!(remainingVolume >= minMainVolumeAfterSplit)) {
        mainPageUI?.setMainMessage("Cannot split.");
        return;
    }

    state.warehouse.push({
        id: createMarimoRecordId("split"),
        volume: splitAmount,
        type: getMarimoType(state.marimo),
        createdAt: new Date().toISOString()
    });

    if (remainingVolume <= 0) {
        state.mainSlotStatus = "empty";
        state.marimo = null;
    } else {
        state.mainSlotStatus = "occupied";
        state.marimo.volume = remainingVolume;
        syncMainMarimoDerivedState(state);
    }

    const progressionMessages = applyProgression(state, "split-success");
    saveState();

    mainPageUI?.setMainMessage("");
    runContextRender(context, "renderWarehousePage");
    runContextRender(context, "renderMainPage");
    mainPageUI?.showSplitCompleteModal?.();

    if (progressionMessages.length > 0) {
        if (typeof context.showGlobalMessage === "function") {
            context.showGlobalMessage(progressionMessages[0]);
        }
        runContextRender(context, "renderShopPage");
    }
}

export function handleSendToWarehouse(options = {}) {
    const context = options.context || {};
    const mainPageUI = options.mainPageUI;

    if (!isSendToWarehouseUnlocked(state)) {
        mainPageUI?.setMainMessage("'Send to warehouse' is not unlocked yet.");
        return;
    }

    if (!hasMainMarimo(state)) {
        mainPageUI?.setMainMessage("No main marimo to send.");
        return;
    }

    const currentVolume = state.marimo.volume;
    const currentDiameter = Number.isFinite(state.marimo.diameter) ? state.marimo.diameter : volumeToDiameter(currentVolume);

    state.warehouse.push({
        id: createMarimoRecordId("warehouse"),
        volume: currentVolume,
        type: getMarimoType(state.marimo),
        createdAt: new Date().toISOString(),
        diameter: currentDiameter
    });

    state.mainSlotStatus = "empty";
    state.marimo = null;

    if (state.growth && typeof state.growth === "object") {
        state.growth.feeding = false;
        state.growth.accumulatedNutrition = 0;
    }

    saveState();
    mainPageUI?.setMainMessage("");
    runContextRender(context, "renderWarehousePage");
    runContextRender(context, "renderMainPage");
}

export function adjustSplitVolume(delta, renderMainPage) {
    const nextVolume = getSplitAmount(state) + delta;
    const maxVolume = Math.max(1, Math.min(2, state.split.maxVolume));
    state.split.currentVolume = Math.max(0, Math.min(maxVolume, nextVolume));

    saveState();

    if (typeof renderMainPage === "function") {
        renderMainPage();
    }
}
