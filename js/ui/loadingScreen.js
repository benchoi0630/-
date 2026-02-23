// 파일 역할: 앱 로딩 화면의 표시/해제 흐름을 전담하는 UI 유틸이다.
// 핵심 책임: 초기 검은 오버레이를 유지하고 첫 렌더 이후 안전하게 숨긴다.
// 연동 범위: 앱 부트스트랩(`js/app.js`)에서만 호출되는 초기화 전용 모듈이다.

const LOADING_SCREEN_ID = "loadingScreen";
const LOADING_SCREEN_HIDDEN_CLASS = "loading-screen-hidden";

let isHideScheduled = false;

function getLoadingScreenElement() {
    return document.getElementById(LOADING_SCREEN_ID);
}

function runAfterNextPaint(callback) {
    if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(callback);
        });
        return;
    }

    window.setTimeout(callback, 0);
}

function waitForWindowLoad() {
    if (document.readyState === "complete") {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        window.addEventListener("load", () => {
            resolve();
        }, { once: true });
    });
}

function waitForFontsReady() {
    if (!document.fonts || !document.fonts.ready) {
        return Promise.resolve();
    }

    return document.fonts.ready.catch(() => undefined);
}

export function initLoadingScreen() {
    const loadingScreen = getLoadingScreenElement();
    if (!loadingScreen) {
        return null;
    }

    isHideScheduled = false;
    loadingScreen.classList.remove(LOADING_SCREEN_HIDDEN_CLASS);
    loadingScreen.setAttribute("aria-hidden", "false");
    return loadingScreen;
}

export function hideLoadingScreen() {
    const loadingScreen = getLoadingScreenElement();
    if (!loadingScreen || isHideScheduled) {
        return;
    }

    isHideScheduled = true;

    runAfterNextPaint(() => {
        loadingScreen.classList.add(LOADING_SCREEN_HIDDEN_CLASS);
        loadingScreen.setAttribute("aria-hidden", "true");
    });
}

export function waitForInitialLoadComplete() {
    return Promise.all([
        waitForWindowLoad(),
        waitForFontsReady()
    ]).then(() => undefined);
}
