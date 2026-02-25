// 파일 역할: 튜토리얼 상태 전이에 사용하는 액션 타입 상수를 정의한다.
// 핵심 책임: 런타임·리듀서·이벤트 브리지 사이의 액션 계약을 고정한다.
// 연동 범위: tutorialReducer와 tutorialRuntime이 공유하는 공용 타입 레이어다.

export const TUTORIAL_ACTION_ADVANCE_DIALOGUE = "ADVANCE_DIALOGUE";
export const TUTORIAL_ACTION_TUTORIAL_EVENT = "TUTORIAL_EVENT";
export const TUTORIAL_ACTION_GOTO_STEP = "GOTO_STEP";
