// 파일 역할: 애플리케이션 부트스트랩 순서를 구성하는 런타임 진입점이다.
// 핵심 책임: 상태 로드/초기 progression 적용 후 main·warehouse·shop·global 모듈을 연결한다.
// 연동 범위: 초기 렌더와 개발 이벤트 기반 전체 재렌더 트리거를 관리한다.

import { loadState, saveState, state } from "./state.js";
import { applyProgression } from "./progression/progressionLogic.js";
import { initGlobalUI } from "./global/globalController.js";
import { initSnapNavigation } from "./ui/nav.js";
import { initIconButtonImageTrim } from "./ui/iconButtonImageTrim.js";
import { hideLoadingScreen, initLoadingScreen, waitForInitialLoadComplete } from "./ui/loadingScreen.js";

import { initMainPage } from "./pages/mainPage/mainPageIndex.js";
import { initWarehousePage } from "./pages/warehouse/warehouseIndex.js";
import { initShopPage } from "./pages/shop/shopIndex.js";

const DEV_STATE_CHANGED_EVENT = "marimo:dev-state-changed";

function lockWindowScrollToTop() {
    const resetWindowScroll = () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) {
            window.scrollTo(0, 0);
        }
    };

    window.addEventListener("scroll", resetWindowScroll, { passive: true });
    resetWindowScroll();
}

// 이 섹션은 페이지 모듈 초기화와 첫 렌더 순서를 구성한다.
/** 이 함수는 앱 모듈을 초기화하고 첫 렌더를 수행한다. */
function bootstrapApp() {
    initLoadingScreen();
    lockWindowScrollToTop();

    try {
        initIconButtonImageTrim();
        loadState();

        const bootstrapMessages = applyProgression(state, "bootstrap");
        saveState();

        initSnapNavigation();

        let mainPageRef = null;
        let shopPageRef = null;
        const warehousePage = initWarehousePage({
            renderMainPage: () => {
                if (mainPageRef) {
                    mainPageRef.renderMainPage();
                }
            }
        });

        const globalUI = initGlobalUI({
            renderMainPage: () => {
                if (mainPageRef) {
                    mainPageRef.renderMainPage();
                }
            },
            renderWarehousePage: warehousePage.renderWarehousePage,
            renderShopPage: () => {
                if (shopPageRef) {
                    shopPageRef.renderShopPage();
                }
            }
        });

        const mainPage = initMainPage({
            renderWarehousePage: warehousePage.renderWarehousePage,
            renderShopPage: () => {
                if (shopPageRef) {
                    shopPageRef.renderShopPage();
                }
            },
            showGlobalMessage: globalUI.showGlobalMessage
        });
        mainPageRef = mainPage;

        const shopPage = initShopPage({
            renderMainPage: mainPage.renderMainPage,
            renderWarehousePage: warehousePage.renderWarehousePage,
            renderGlobalHeader: globalUI.renderGlobalHeader,
            showGlobalMessage: globalUI.showGlobalMessage
        });
        shopPageRef = shopPage;

        globalUI.renderGlobalHeader();
        mainPage.renderMainPage();
        warehousePage.renderWarehousePage();
        shopPage.renderShopPage();

        window.addEventListener(DEV_STATE_CHANGED_EVENT, () => {
            globalUI.renderGlobalHeader();
            mainPage.renderMainPage();
            warehousePage.renderWarehousePage();
            shopPage.renderShopPage();
        });

        if (bootstrapMessages.length > 0) {
            globalUI.showGlobalMessage(bootstrapMessages[0]);
        }
    } finally {
        void waitForInitialLoadComplete()
            .catch(() => undefined)
            .finally(() => {
                hideLoadingScreen();
            });
    }
}
bootstrapApp();
