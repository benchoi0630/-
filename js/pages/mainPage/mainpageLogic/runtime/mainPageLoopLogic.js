// 파일 역할: 메인 페이지의 지속 루프(주기 저장과 선택적 프레임 갱신)를 관리한다.
// 핵심 책임: requestAnimationFrame 루프 상태를 보존하고 프레임별 콜백 실행을 조정한다.
// 연동 범위: mainPageIndex가 전달한 콜백으로 저장과 렌더 호출을 연결한다.

let loopStarted = false;
let lastFrameTime = 0;
let lastPersistTime = 0;
let lastRenderTime = 0;

const MAIN_LOOP_RENDER_INTERVAL_MS = 1000 / 30;

export function startMainLoop(options = {}) {
    const onFrame = typeof options.onFrame === "function" ? options.onFrame : () => false;
    const persistState = typeof options.persistState === "function" ? options.persistState : () => {};
    const renderMainPage = typeof options.renderMainPage === "function" ? options.renderMainPage : () => {};

    if (loopStarted) {
        return;
    }

    loopStarted = true;
    lastFrameTime = performance.now();
    lastPersistTime = performance.now();
    lastRenderTime = performance.now();

    function gameLoop(now) {
        const deltaSeconds = (now - lastFrameTime) / 1000;
        lastFrameTime = now;

        const shouldRender = onFrame(deltaSeconds) === true;

        if (now - lastPersistTime >= 1000) {
            persistState();
            lastPersistTime = now;
        }

        if (shouldRender && now - lastRenderTime >= MAIN_LOOP_RENDER_INTERVAL_MS) {
            renderMainPage();
            lastRenderTime = now;
        }

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}
