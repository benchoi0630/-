// 파일 역할: 튜토리얼 액션 객체 생성기를 제공한다.
// 핵심 책임: 외부 모듈이 리듀서 내부 필드 구조를 직접 알지 않도록 캡슐화한다.
// 연동 범위: tutorialRuntime, 페이지 이벤트 훅, devtools가 이 API로 액션을 발행한다.

import {
    TUTORIAL_ACTION_ADVANCE_DIALOGUE,
    TUTORIAL_ACTION_GOTO_STEP,
    TUTORIAL_ACTION_TUTORIAL_EVENT
} from "./tutorialActionTypes.js";

export function createAdvanceDialogueAction(options = {}) {
    return {
        type: TUTORIAL_ACTION_ADVANCE_DIALOGUE,
        revealImmediately: options.revealImmediately === true
    };
}

export function createTutorialEventAction(eventName, payload = null) {
    return {
        type: TUTORIAL_ACTION_TUTORIAL_EVENT,
        eventName: typeof eventName === "string" ? eventName : "",
        payload
    };
}

export function createGotoStepAction(stepId, options = {}) {
    return {
        type: TUTORIAL_ACTION_GOTO_STEP,
        stepId: typeof stepId === "string" ? stepId : "",
        flowId: typeof options.flowId === "string" ? options.flowId : null,
        lineIndex: Number.isFinite(options.lineIndex) ? Math.max(0, Math.round(options.lineIndex)) : null,
        revealImmediately: options.revealImmediately === true
    };
}
