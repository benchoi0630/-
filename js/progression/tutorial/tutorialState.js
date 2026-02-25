// 파일 역할: 튜토리얼 저장 상태 스키마의 기본값과 정규화 함수를 제공한다.
// 핵심 책임: flow/step 유효성, 상태 플래그, 대사 인덱스를 일관된 형태로 보정한다.
// 연동 범위: state.js 저장 계층과 tutorialRuntime 초기화 계층이 함께 사용한다.

import { getDefaultTutorialFlowId, getTutorialFirstStepId, hasTutorialStep } from "./tutorialFlowDefs.js";

export const TUTORIAL_STATE_VERSION = 1;

export const TUTORIAL_STATUS_IDLE = "idle";
export const TUTORIAL_STATUS_RUNNING = "running";
export const TUTORIAL_STATUS_PAUSED = "paused";
export const TUTORIAL_STATUS_DONE = "done";
export const TUTORIAL_STATUS_SKIPPED = "skipped";

const MAX_HISTORY_ITEMS = 120;

function createEmptyFlags() {
    return {};
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFlowId(flowId) {
    return typeof flowId === "string" && flowId.length > 0 ? flowId : getDefaultTutorialFlowId();
}

function normalizeStatus(status, { completed, skipped }) {
    if (skipped === true) {
        return TUTORIAL_STATUS_SKIPPED;
    }

    if (completed === true) {
        return TUTORIAL_STATUS_DONE;
    }

    if (status === TUTORIAL_STATUS_RUNNING || status === TUTORIAL_STATUS_PAUSED || status === TUTORIAL_STATUS_IDLE) {
        return status;
    }

    return TUTORIAL_STATUS_IDLE;
}

function normalizeFlags(flags) {
    if (!isObject(flags)) {
        return createEmptyFlags();
    }

    const nextFlags = {};
    const keys = Object.keys(flags);

    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!key) {
            continue;
        }

        const value = flags[key];
        if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
            nextFlags[key] = value;
        }
    }

    return nextFlags;
}

function normalizeHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .filter((entry) => typeof entry === "string" && entry.length > 0)
        .slice(-MAX_HISTORY_ITEMS);
}

function resolveStepId(flowId, requestedStepId) {
    const firstStepId = getTutorialFirstStepId(flowId);

    if (typeof requestedStepId === "string" && requestedStepId.length > 0 && hasTutorialStep(flowId, requestedStepId)) {
        return requestedStepId;
    }

    return firstStepId;
}

export function createDefaultTutorialState() {
    const flowId = getDefaultTutorialFlowId();

    return {
        version: TUTORIAL_STATE_VERSION,
        flowId,
        stepId: getTutorialFirstStepId(flowId),
        lineIndex: 0,
        isLineFullyRevealed: false,
        status: TUTORIAL_STATUS_IDLE,
        completed: false,
        skipped: false,
        flags: createEmptyFlags(),
        history: []
    };
}

export function normalizeTutorialState(tutorialState) {
    if (!isObject(tutorialState)) {
        return createDefaultTutorialState();
    }

    const flowId = normalizeFlowId(tutorialState.flowId);
    const completed = tutorialState.completed === true;
    const skipped = tutorialState.skipped === true;

    return {
        version: Number.isFinite(tutorialState.version) ? Math.max(1, Math.round(tutorialState.version)) : TUTORIAL_STATE_VERSION,
        flowId,
        stepId: resolveStepId(flowId, tutorialState.stepId),
        lineIndex: Number.isFinite(tutorialState.lineIndex) ? Math.max(0, Math.round(tutorialState.lineIndex)) : 0,
        isLineFullyRevealed: tutorialState.isLineFullyRevealed === true,
        status: normalizeStatus(tutorialState.status, { completed, skipped }),
        completed,
        skipped,
        flags: normalizeFlags(tutorialState.flags),
        history: normalizeHistory(tutorialState.history)
    };
}

export function isTutorialTerminalState(tutorialState) {
    if (!isObject(tutorialState)) {
        return false;
    }

    return tutorialState.completed === true || tutorialState.skipped === true;
}
