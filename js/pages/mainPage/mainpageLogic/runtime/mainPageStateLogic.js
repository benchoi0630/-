// 파일 역할: 메인 페이지의 상태 파생값 계산과 기본 수치 보정을 담당한다.
// 핵심 책임: split 보정, 부피-지름 변환, 메인 마리모 파생 상태 동기화를 수행한다.
// 연동 범위: mainPageIndex와 액션 로직이 공통으로 참조하는 상태 유틸 계층이다.

import { state } from "../../../../state.js";
import { hasMainMarimo, volumeToDiameter as volumeToDiameterBase } from "../../../../utils/marimoData.js";

export function isSendToWarehouseUnlocked(currentState = state) {
    const featureLevel = currentState.progression?.feature;
    return Number.isFinite(featureLevel) && featureLevel >= 1;
}

export function getSplitAmount(currentState = state) {
    const safeCurrent = Number.isFinite(currentState.split.currentVolume) ? currentState.split.currentVolume : 1;
    const safeMax = Number.isFinite(currentState.split.maxVolume) ? currentState.split.maxVolume : 1;
    const maxVolume = Math.max(1, Math.min(2, Math.round(safeMax)));
    const minVolume = maxVolume > 1 ? 0 : 1;
    return Math.max(minVolume, Math.min(maxVolume, Math.round(safeCurrent)));
}

export function volumeToDiameter(volume) {
    return volumeToDiameterBase(volume);
}

export function syncMainMarimoDerivedState(currentState = state) {
    if (!hasMainMarimo(currentState)) {
        return;
    }

    const rawVolume = Number(currentState.marimo.volume);
    const normalizedVolume = Number.isFinite(rawVolume) && rawVolume > 0 ? rawVolume : 1;

    currentState.marimo.volume = normalizedVolume;
    currentState.marimo.diameter = volumeToDiameter(currentState.marimo.volume);
}
