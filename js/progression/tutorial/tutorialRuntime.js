// 파일 역할: 튜토리얼 리듀서를 실행하는 런타임 컨테이너를 제공한다.
// 핵심 책임: dispatch, subscribe, 상태 교체, 저장 연동 콜백을 한 곳에서 관리한다.
// 연동 범위: 앱 초기화 레이어와 페이지 이벤트 브리지가 사용하는 실행 API다.

import {
    createAdvanceDialogueAction,
    createGotoStepAction,
    createTutorialEventAction
} from "./tutorialActions.js";
import { tutorialReducer } from "./tutorialReducer.js";
import { normalizeTutorialState } from "./tutorialState.js";

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function areShallowObjectsEqual(left, right) {
    if (left === right) {
        return true;
    }

    if (!isObject(left) || !isObject(right)) {
        return false;
    }

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
        return false;
    }

    for (let i = 0; i < leftKeys.length; i += 1) {
        const key = leftKeys[i];
        if (!Object.prototype.hasOwnProperty.call(right, key) || right[key] !== left[key]) {
            return false;
        }
    }

    return true;
}

function areStringArraysEqual(left, right) {
    if (left === right) {
        return true;
    }

    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) {
            return false;
        }
    }

    return true;
}

function areTutorialStatesEqual(left, right) {
    if (left === right) {
        return true;
    }

    if (!left || !right) {
        return false;
    }

    return left.version === right.version
        && left.flowId === right.flowId
        && left.stepId === right.stepId
        && left.lineIndex === right.lineIndex
        && left.isLineFullyRevealed === right.isLineFullyRevealed
        && left.status === right.status
        && left.completed === right.completed
        && left.skipped === right.skipped
        && areShallowObjectsEqual(left.flags, right.flags)
        && areStringArraysEqual(left.history, right.history);
}

export function createTutorialRuntime(options = {}) {
    let tutorialState = normalizeTutorialState(options.initialState);
    const listeners = new Set();

    function notify(nextState, prevState, action) {
        listeners.forEach((listener) => {
            listener(nextState, prevState, action);
        });
    }

    function commit(nextState, prevState, action) {
        tutorialState = nextState;

        if (typeof options.onStateChange === "function") {
            options.onStateChange(nextState, prevState, action);
        }

        notify(nextState, prevState, action);
        return tutorialState;
    }

    function dispatch(action) {
        const prevState = tutorialState;
        const reducedState = tutorialReducer(prevState, action);
        const nextState = normalizeTutorialState(reducedState);

        if (areTutorialStatesEqual(prevState, nextState)) {
            return tutorialState;
        }

        return commit(nextState, prevState, action);
    }

    function replaceState(nextTutorialState, meta = {}) {
        const prevState = tutorialState;
        const nextState = normalizeTutorialState(nextTutorialState);

        if (areTutorialStatesEqual(prevState, nextState)) {
            return tutorialState;
        }

        return commit(nextState, prevState, {
            type: "REPLACE_TUTORIAL_STATE",
            reason: typeof meta.reason === "string" ? meta.reason : "replace-state"
        });
    }

    function subscribe(listener) {
        if (typeof listener !== "function") {
            return () => undefined;
        }

        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    }

    return {
        getState: () => tutorialState,
        dispatch,
        replaceState,
        subscribe,
        advanceDialogue: (actionOptions = {}) => dispatch(createAdvanceDialogueAction(actionOptions)),
        emitEvent: (eventName, payload = null) => dispatch(createTutorialEventAction(eventName, payload)),
        gotoStep: (stepId, actionOptions = {}) => dispatch(createGotoStepAction(stepId, actionOptions))
    };
}
