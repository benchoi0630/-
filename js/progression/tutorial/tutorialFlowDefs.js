// 파일 역할: 튜토리얼 플로우/스텝 정적 데이터를 정의한다.
// 핵심 책임: 대사 라인, 완료 조건, 다음 스텝 전이를 데이터 중심으로 선언한다.
// 연동 범위: tutorialReducer와 selector 계층이 참조하는 튜토리얼 콘텐츠 소스다.

import {
    TUTORIAL_EVENT_MAIN_MARIMO_CLICKED,
    TUTORIAL_EVENT_MAIN_SPLIT_SUCCESS,
    TUTORIAL_EVENT_UPGRADE_MODAL_OPENED,
    TUTORIAL_EVENT_WAREHOUSE_OPENED
} from "./tutorialEventNames.js";

const DEFAULT_FLOW_ID = "onboarding-v1";

const onboardingV1Steps = [
    {
        id: "welcome",
        lines: [
            { speaker: "guide", text: "안녕, 새 수조에 온 걸 환영해." },
            { speaker: "guide", text: "먼저 마리모를 한 번 터치해보자." }
        ],
        completeWhen: {
            type: "event",
            eventName: TUTORIAL_EVENT_MAIN_MARIMO_CLICKED
        },
        nextStepId: "first_split"
    },
    {
        id: "first_split",
        lines: [
            { speaker: "guide", text: "좋아. 이제 분열 버튼으로 첫 분열을 해보자." },
            { speaker: "guide", text: "분열이 완료되면 다음 안내를 시작할게." }
        ],
        completeWhen: {
            type: "event",
            eventName: TUTORIAL_EVENT_MAIN_SPLIT_SUCCESS
        },
        nextStepId: "open_upgrade"
    },
    {
        id: "open_upgrade",
        lines: [
            { speaker: "guide", text: "이번엔 업그레이드 버튼을 눌러서 창을 열어봐." }
        ],
        completeWhen: {
            type: "event",
            eventName: TUTORIAL_EVENT_UPGRADE_MODAL_OPENED
        },
        onComplete: [
            { type: "set_flag", key: "openedUpgradeModal", value: true }
        ],
        nextStepId: "open_warehouse"
    },
    {
        id: "open_warehouse",
        lines: [
            { speaker: "guide", text: "마지막으로 창고 화면을 열고 운반 모드를 확인해보자." }
        ],
        completeWhen: {
            type: "event",
            eventName: TUTORIAL_EVENT_WAREHOUSE_OPENED
        },
        onComplete: [
            { type: "set_flag", key: "openedWarehouse", value: true }
        ],
        nextStepId: "done"
    },
    {
        id: "done",
        lines: [
            { speaker: "guide", text: "튜토리얼 완료. 이제 자유롭게 수조를 키워봐." }
        ],
        completeWhen: {
            type: "continue"
        },
        nextStepId: null
    }
];

export const tutorialFlowDefs = {
    [DEFAULT_FLOW_ID]: {
        id: DEFAULT_FLOW_ID,
        title: "기본 온보딩",
        firstStepId: "welcome",
        steps: onboardingV1Steps
    }
};

function getStepList(flow) {
    if (!flow || !Array.isArray(flow.steps)) {
        return [];
    }

    return flow.steps;
}

export function getDefaultTutorialFlowId() {
    return DEFAULT_FLOW_ID;
}

export function getTutorialFlow(flowId) {
    if (typeof flowId !== "string" || flowId.length <= 0) {
        return tutorialFlowDefs[DEFAULT_FLOW_ID] || null;
    }

    return tutorialFlowDefs[flowId] || null;
}

export function getTutorialFirstStepId(flowId) {
    const flow = getTutorialFlow(flowId);
    if (!flow) {
        return "";
    }

    if (typeof flow.firstStepId === "string" && flow.firstStepId.length > 0) {
        return flow.firstStepId;
    }

    const steps = getStepList(flow);
    if (steps.length <= 0) {
        return "";
    }

    return typeof steps[0].id === "string" ? steps[0].id : "";
}

export function getTutorialStep(flowId, stepId) {
    const flow = getTutorialFlow(flowId);
    if (!flow || typeof stepId !== "string" || stepId.length <= 0) {
        return null;
    }

    const steps = getStepList(flow);
    for (let i = 0; i < steps.length; i += 1) {
        if (steps[i] && steps[i].id === stepId) {
            return steps[i];
        }
    }

    return null;
}

export function hasTutorialStep(flowId, stepId) {
    return Boolean(getTutorialStep(flowId, stepId));
}

export function getTutorialStepLines(step) {
    if (!step || !Array.isArray(step.lines)) {
        return [];
    }

    return step.lines.filter((line) => line && typeof line.text === "string");
}
