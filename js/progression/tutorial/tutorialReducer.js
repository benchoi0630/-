// 파일 역할: 튜토리얼 상태 전이 규칙을 액션 기반으로 계산한다.
// 핵심 책임: 대사 진행, 이벤트 완료, 스텝 점프를 순수 함수로 일관 처리한다.
// 연동 범위: tutorialRuntime이 dispatch 시 호출하는 단일 상태 전환 엔진이다.

import {
    TUTORIAL_ACTION_ADVANCE_DIALOGUE,
    TUTORIAL_ACTION_GOTO_STEP,
    TUTORIAL_ACTION_TUTORIAL_EVENT
} from "./tutorialActionTypes.js";
import {
    getDefaultTutorialFlowId,
    getTutorialFirstStepId,
    getTutorialStep,
    getTutorialStepLines,
    hasTutorialStep
} from "./tutorialFlowDefs.js";
import {
    TUTORIAL_STATE_VERSION,
    TUTORIAL_STATUS_DONE,
    TUTORIAL_STATUS_RUNNING,
    TUTORIAL_STATUS_SKIPPED,
    isTutorialTerminalState,
    createDefaultTutorialState
} from "./tutorialState.js";

const MAX_HISTORY_ITEMS = 120;

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampLineIndex(step, lineIndex) {
    const lines = getTutorialStepLines(step);
    if (lines.length <= 0) {
        return 0;
    }

    const rawIndex = Number.isFinite(lineIndex) ? Math.max(0, Math.round(lineIndex)) : 0;
    return Math.min(lines.length - 1, rawIndex);
}

function appendHistory(state, entry) {
    if (typeof entry !== "string" || entry.length <= 0) {
        return state;
    }

    const history = Array.isArray(state.history) ? state.history : [];
    const nextHistory = [...history, entry].slice(-MAX_HISTORY_ITEMS);

    return {
        ...state,
        history: nextHistory
    };
}

function applyFlagPatch(state, flagPatch) {
    if (!isObject(flagPatch)) {
        return state;
    }

    const currentFlags = isObject(state.flags) ? state.flags : {};
    const nextFlags = { ...currentFlags };
    let changed = false;

    const keys = Object.keys(flagPatch);
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!key) {
            continue;
        }

        const value = flagPatch[key];
        if (typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") {
            continue;
        }

        if (nextFlags[key] !== value) {
            nextFlags[key] = value;
            changed = true;
        }
    }

    if (!changed) {
        return state;
    }

    return {
        ...state,
        flags: nextFlags
    };
}

function applyStepOnCompleteEffects(state, step) {
    const effects = Array.isArray(step?.onComplete) ? step.onComplete : [];
    let nextState = state;

    for (let i = 0; i < effects.length; i += 1) {
        const effect = effects[i];
        if (!effect || effect.type !== "set_flag" || typeof effect.key !== "string" || effect.key.length <= 0) {
            continue;
        }

        const currentFlags = isObject(nextState.flags) ? nextState.flags : {};
        const nextValue = effect.value;
        if (typeof nextValue !== "boolean" && typeof nextValue !== "number" && typeof nextValue !== "string") {
            continue;
        }

        if (currentFlags[effect.key] === nextValue) {
            continue;
        }

        nextState = {
            ...nextState,
            flags: {
                ...currentFlags,
                [effect.key]: nextValue
            }
        };
    }

    return nextState;
}

function moveToStep(state, flowId, stepId, options = {}) {
    const nextFlowId = typeof flowId === "string" && flowId.length > 0 ? flowId : getDefaultTutorialFlowId();

    if (!hasTutorialStep(nextFlowId, stepId)) {
        return finishTutorial(state, { completed: true, token: "tutorial:done" });
    }

    const nextStep = getTutorialStep(nextFlowId, stepId);
    const requestedLineIndex = Number.isFinite(options.lineIndex) ? Math.max(0, Math.round(options.lineIndex)) : 0;

    return {
        ...state,
        version: Number.isFinite(state.version) ? state.version : TUTORIAL_STATE_VERSION,
        flowId: nextFlowId,
        stepId,
        lineIndex: clampLineIndex(nextStep, requestedLineIndex),
        isLineFullyRevealed: options.revealImmediately === true,
        status: TUTORIAL_STATUS_RUNNING,
        completed: false,
        skipped: false
    };
}

function finishTutorial(state, options = {}) {
    const completed = options.completed === true;
    const skipped = options.skipped === true;

    let nextState = {
        ...state,
        version: Number.isFinite(state.version) ? state.version : TUTORIAL_STATE_VERSION,
        stepId: "",
        lineIndex: 0,
        isLineFullyRevealed: true,
        status: skipped ? TUTORIAL_STATUS_SKIPPED : (completed ? TUTORIAL_STATUS_DONE : state.status),
        completed,
        skipped
    };

    if (typeof options.token === "string" && options.token.length > 0) {
        nextState = appendHistory(nextState, options.token);
    }

    return nextState;
}

function ensureCurrentStep(state) {
    const flowId = typeof state.flowId === "string" && state.flowId.length > 0 ? state.flowId : getDefaultTutorialFlowId();
    const currentStepId = typeof state.stepId === "string" && state.stepId.length > 0 ? state.stepId : "";

    if (hasTutorialStep(flowId, currentStepId)) {
        return {
            state,
            step: getTutorialStep(flowId, currentStepId)
        };
    }

    const fallbackStepId = getTutorialFirstStepId(flowId);
    if (hasTutorialStep(flowId, fallbackStepId)) {
        const nextState = moveToStep(state, flowId, fallbackStepId);
        return {
            state: nextState,
            step: getTutorialStep(flowId, fallbackStepId)
        };
    }

    const defaultFlowId = getDefaultTutorialFlowId();
    const defaultStepId = getTutorialFirstStepId(defaultFlowId);

    if (hasTutorialStep(defaultFlowId, defaultStepId)) {
        const nextState = moveToStep(state, defaultFlowId, defaultStepId);
        return {
            state: nextState,
            step: getTutorialStep(defaultFlowId, defaultStepId)
        };
    }

    return {
        state: finishTutorial(state, { completed: true, token: "tutorial:done" }),
        step: null
    };
}

function getCompleteRule(step) {
    if (!step || !isObject(step.completeWhen)) {
        return {
            type: "continue",
            eventName: ""
        };
    }

    if (step.completeWhen.type === "event" && typeof step.completeWhen.eventName === "string" && step.completeWhen.eventName.length > 0) {
        return {
            type: "event",
            eventName: step.completeWhen.eventName
        };
    }

    return {
        type: "continue",
        eventName: ""
    };
}

function completeCurrentStep(state, step) {
    const nextStateWithEffects = applyStepOnCompleteEffects(state, step);
    const nextStepId = typeof step?.nextStepId === "string" && step.nextStepId.length > 0 ? step.nextStepId : "";

    if (!nextStepId || !hasTutorialStep(nextStateWithEffects.flowId, nextStepId)) {
        return finishTutorial(nextStateWithEffects, {
            completed: true,
            token: "step:done"
        });
    }

    return appendHistory(
        moveToStep(nextStateWithEffects, nextStateWithEffects.flowId, nextStepId),
        `step:${nextStepId}`
    );
}

function activateTutorial(state) {
    if (state.status === TUTORIAL_STATUS_RUNNING && state.completed === false && state.skipped === false) {
        return state;
    }

    return {
        ...state,
        status: TUTORIAL_STATUS_RUNNING,
        completed: false,
        skipped: false
    };
}

function reduceAdvanceDialogue(currentState) {
    if (isTutorialTerminalState(currentState)) {
        return currentState;
    }

    const activatedState = activateTutorial(currentState);
    const context = ensureCurrentStep(activatedState);
    const step = context.step;

    if (!step) {
        return context.state;
    }

    const lines = getTutorialStepLines(step);
    const safeLineIndex = clampLineIndex(step, context.state.lineIndex);

    let nextState = context.state;
    if (safeLineIndex !== nextState.lineIndex) {
        nextState = {
            ...nextState,
            lineIndex: safeLineIndex
        };
    }

    if (lines.length <= 0) {
        const completeRule = getCompleteRule(step);
        if (completeRule.type === "continue") {
            return completeCurrentStep(nextState, step);
        }

        return {
            ...nextState,
            isLineFullyRevealed: true
        };
    }

    if (nextState.isLineFullyRevealed !== true) {
        return {
            ...nextState,
            isLineFullyRevealed: true
        };
    }

    const lastLineIndex = lines.length - 1;

    if (safeLineIndex < lastLineIndex) {
        return appendHistory(
            {
                ...nextState,
                lineIndex: safeLineIndex + 1,
                isLineFullyRevealed: false
            },
            `line:${step.id}:${safeLineIndex + 1}`
        );
    }

    const completeRule = getCompleteRule(step);
    if (completeRule.type === "continue") {
        return completeCurrentStep(nextState, step);
    }

    return {
        ...nextState,
        lineIndex: lastLineIndex,
        isLineFullyRevealed: true
    };
}

function reduceTutorialEvent(currentState, action) {
    if (isTutorialTerminalState(currentState)) {
        return currentState;
    }

    const eventName = typeof action.eventName === "string" ? action.eventName : "";
    if (eventName.length <= 0) {
        return currentState;
    }

    const activatedState = activateTutorial(currentState);
    const context = ensureCurrentStep(activatedState);
    const step = context.step;

    let nextState = context.state;

    if (isObject(action.payload) && isObject(action.payload.flags)) {
        nextState = applyFlagPatch(nextState, action.payload.flags);
    }

    nextState = appendHistory(nextState, `event:${eventName}`);

    if (!step) {
        return nextState;
    }

    const completeRule = getCompleteRule(step);
    if (completeRule.type === "event" && completeRule.eventName === eventName) {
        return completeCurrentStep(nextState, step);
    }

    return nextState;
}

function reduceGotoStep(currentState, action) {
    const currentFlowId = typeof currentState.flowId === "string" && currentState.flowId.length > 0
        ? currentState.flowId
        : getDefaultTutorialFlowId();

    let targetFlowId = typeof action.flowId === "string" && action.flowId.length > 0
        ? action.flowId
        : currentFlowId;

    if (!getTutorialFirstStepId(targetFlowId)) {
        targetFlowId = getDefaultTutorialFlowId();
    }

    let targetStepId = typeof action.stepId === "string" && action.stepId.length > 0
        ? action.stepId
        : getTutorialFirstStepId(targetFlowId);

    if (!hasTutorialStep(targetFlowId, targetStepId)) {
        targetStepId = getTutorialFirstStepId(targetFlowId);
    }

    if (!hasTutorialStep(targetFlowId, targetStepId)) {
        return finishTutorial(currentState, {
            completed: true,
            token: "tutorial:done"
        });
    }

    return appendHistory(
        moveToStep(
            {
                ...currentState,
                completed: false,
                skipped: false
            },
            targetFlowId,
            targetStepId,
            {
                lineIndex: action.lineIndex,
                revealImmediately: action.revealImmediately === true
            }
        ),
        `goto:${targetFlowId}:${targetStepId}`
    );
}

export function tutorialReducer(currentTutorialState, action) {
    const safeState = currentTutorialState && typeof currentTutorialState === "object"
        ? currentTutorialState
        : createDefaultTutorialState();

    if (!action || typeof action !== "object") {
        return safeState;
    }

    switch (action.type) {
    case TUTORIAL_ACTION_ADVANCE_DIALOGUE:
        return reduceAdvanceDialogue(safeState);
    case TUTORIAL_ACTION_TUTORIAL_EVENT:
        return reduceTutorialEvent(safeState, action);
    case TUTORIAL_ACTION_GOTO_STEP:
        return reduceGotoStep(safeState, action);
    default:
        return safeState;
    }
}
