# Tutorial Module Skeleton

- `tutorialFlowDefs.js`
튜토리얼 대사/완료 조건/다음 스텝을 데이터로 정의한다.

- `tutorialEventNames.js`
게임 이벤트 이름 상수를 모아 flow 정의와 페이지 이벤트 브리지가 공유한다.

- `tutorialActionTypes.js`
리듀서 액션 타입 상수를 정의한다.

- `tutorialActions.js`
액션 생성기를 제공한다. 외부에서 액션 객체를 직접 만들지 않게 한다.

- `tutorialReducer.js`
튜토리얼 상태 전이 규칙을 계산하는 순수 함수다.

- `tutorialRuntime.js`
리듀서를 실행하고 subscribe/onStateChange를 관리하는 런타임 컨테이너다.

- `tutorialState.js`
튜토리얼 저장 스키마 기본값/정규화/터미널 상태 판별을 제공한다.

- `tutorialController.js`
앱 전역 `state`/`saveState`와 runtime을 연결하는 통합 어댑터다.
