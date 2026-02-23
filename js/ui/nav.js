// 파일 역할: 좌우 화살표 버튼 기반 페이지 네비게이션을 초기화한다.
// 핵심 책임: page id 스크롤 이동, 현재 페이지 인덱스 추적, 버튼 활성 상태를 관리한다.
// 연동 범위: 앱 초기화 시 메인/창고/상점 페이지 이동 UX를 제공한다.

const LEFT_NAV_BUTTON_ID = "pageNavLeftBtn";
const RIGHT_NAV_BUTTON_ID = "pageNavRightBtn";

let pageContainerRef = null;
let pageIds = [];
let currentPageIndex = 0;
let leftNavButtonRef = null;
let rightNavButtonRef = null;
let navigationListenersBound = false;

function clampPageIndex(index) {
    if (pageIds.length <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(pageIds.length - 1, index));
}

function getPageIndexById(pageId) {
    const targetIndex = pageIds.indexOf(pageId);
    if (targetIndex >= 0) {
        return targetIndex;
    }

    return clampPageIndex(currentPageIndex);
}

function readCurrentPageIndexFromScroll() {
    if (!pageContainerRef) {
        return 0;
    }

    const pageWidth = Math.max(1, pageContainerRef.clientWidth);
    return clampPageIndex(Math.round(pageContainerRef.scrollLeft / pageWidth));
}

function updateNavButtonState() {
    currentPageIndex = readCurrentPageIndexFromScroll();

    if (leftNavButtonRef) {
        leftNavButtonRef.disabled = currentPageIndex <= 0;
    }

    if (rightNavButtonRef) {
        rightNavButtonRef.disabled = currentPageIndex >= Math.max(0, pageIds.length - 1);
    }
}

function scrollToPageIndex(index, behavior = "smooth") {
    if (pageIds.length <= 0) {
        return;
    }

    const targetIndex = clampPageIndex(index);
    const targetPageId = pageIds[targetIndex];
    currentPageIndex = targetIndex;
    scrollToPage(targetPageId, behavior);
}

function bindNavigationButtons() {
    if (leftNavButtonRef && leftNavButtonRef.dataset.listenerPageNavLeftBound !== "true") {
        leftNavButtonRef.addEventListener("click", () => {
            currentPageIndex = readCurrentPageIndexFromScroll();
            scrollToPageIndex(currentPageIndex - 1, "smooth");
        });
        leftNavButtonRef.dataset.listenerPageNavLeftBound = "true";
    }

    if (rightNavButtonRef && rightNavButtonRef.dataset.listenerPageNavRightBound !== "true") {
        rightNavButtonRef.addEventListener("click", () => {
            currentPageIndex = readCurrentPageIndexFromScroll();
            scrollToPageIndex(currentPageIndex + 1, "smooth");
        });
        rightNavButtonRef.dataset.listenerPageNavRightBound = "true";
    }
}

/** 이 함수는 스냅 컨테이너를 대상 페이지 아이디 위치로 스크롤한다. */
export function scrollToPage(pageId, behavior = "smooth") {
    if (!pageContainerRef) {
        return;
    }

    const targetPage = document.getElementById(pageId);
    if (!targetPage) {
        return;
    }

    currentPageIndex = getPageIndexById(pageId);
    pageContainerRef.scrollTo({
        left: targetPage.offsetLeft,
        behavior
    });
    updateNavButtonState();
}

/** 이 함수는 스냅 네비게이션을 초기화하고 첫 진입을 메인 페이지로 맞춘다. */
export function initSnapNavigation() {
    pageContainerRef = document.getElementById("pageContainer");
    leftNavButtonRef = document.getElementById(LEFT_NAV_BUTTON_ID);
    rightNavButtonRef = document.getElementById(RIGHT_NAV_BUTTON_ID);

    const mainPage = document.getElementById("mainPage");
    if (!pageContainerRef || !mainPage) {
        return { container: null, scrollToPage };
    }

    pageIds = Array.from(pageContainerRef.querySelectorAll(".page[id]"))
        .map((page) => page.id)
        .filter((pageId) => typeof pageId === "string" && pageId.length > 0);
    currentPageIndex = getPageIndexById("mainPage");

    bindNavigationButtons();

    if (!navigationListenersBound) {
        pageContainerRef.addEventListener("scroll", updateNavButtonState, { passive: true });
        window.addEventListener("resize", updateNavButtonState);
        navigationListenersBound = true;
    }

    requestAnimationFrame(() => {
        // 초기 진입에서 시각적 이동을 막기 위해 auto 동작을 사용한다.
        scrollToPage("mainPage", "auto");
        requestAnimationFrame(updateNavButtonState);
    });

    return { container: pageContainerRef, scrollToPage };
}
