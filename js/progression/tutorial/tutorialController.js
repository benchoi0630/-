// 파일 역할: 앱 전역 상태와 tutorialRuntime을 연결하는 어댑터 계층이다.
// 핵심 책임: 튜토리얼 상태 변경 시 저장 반영과 외부 액션 호출 API를 제공한다.
// 연동 범위: app 부트스트랩과 각 페이지 이벤트 핸들러가 사용하는 통합 진입점이다.

import { saveState, state } from "../../state.js";
import {
    createAdvanceDialogueAction,
    createGotoStepAction,
    createTutorialEventAction
} from "./tutorialActions.js";
import { createTutorialRuntime } from "./tutorialRuntime.js";

let tutorialRuntime = null;

function ensureRuntime(options = {}) {
    if (tutorialRuntime) {
        return tutorialRuntime;
    }

    tutorialRuntime = createTutorialRuntime({
        initialState: state.tutorial,
        onStateChange: (nextTutorialState, prevTutorialState, action) => {
            state.tutorial = nextTutorialState;

            if (typeof options.onStateChange === "function") {
                options.onStateChange(nextTutorialState, prevTutorialState, action);
            }

            if (options.autoSave !== false) {
                saveState();
            }
        }
    });

    return tutorialRuntime;
}

export function initTutorialController(options = {}) {
    return ensureRuntime(options);
}

export function getTutorialRuntime() {
    return tutorialRuntime;
}

export function advanceTutorialDialogue(options = {}) {
    const runtime = ensureRuntime();
    return runtime.dispatch(createAdvanceDialogueAction(options));
}

export function dispatchTutorialEvent(eventName, payload = null) {
    const runtime = ensureRuntime();
    return runtime.dispatch(createTutorialEventAction(eventName, payload));
}

export function gotoTutorialStep(stepId, options = {}) {
    const runtime = ensureRuntime();
    return runtime.dispatch(createGotoStepAction(stepId, options));
}
