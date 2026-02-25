// 파일 역할: 메인 페이지 로직 엔트리로 성장 입력과 화면 흐름을 조율한다.
// 핵심 책임: 영양제 사용·굴림 성장·분할·창고 이동 동작 후 저장과 렌더를 호출한다.
// 연동 범위: UI 레이어(`mainPageUI`)와 상태 로직 사이의 오케스트레이션 계층이다.

import { saveState, state } from "../../state.js";
import { createMainPageMainUI } from "./mainpageUI/mainpageMainUI.js";
import { getSplitAmount, isSendToWarehouseUnlocked, syncMainMarimoDerivedState, volumeToDiameter } from "./mainpageLogic/runtime/mainPageStateLogic.js";
import { adjustSplitVolume, handleMainMarimoClick, handleMainMarimoRolling, handleSendToWarehouse, handleSplit, handleToggleMarimoFixed } from "./mainpageLogic/mainPageActionLogic.js";
import { bindDevDisplayEvents, bindMainEvents } from "./mainpageLogic/runtime/mainPageEventLogic.js";
import { calculateAutoRollingSurfaceDistance } from "./mainpageLogic/growthEngine.js";
import { startMainLoop } from "./mainpageLogic/runtime/mainPageLoopLogic.js";

const mainPageUI = createMainPageMainUI({
    getSplitAmount,
    volumeToDiameter,
    isSendToWarehouseUnlocked,
    onManualRollingDistanceAbs: (rollingSurfaceDistanceAbs) => {
        if (!Number.isFinite(rollingSurfaceDistanceAbs) || rollingSurfaceDistanceAbs <= 0) {
            return;
        }

        handleMainMarimoRolling({
            rollingSurfaceDistance: rollingSurfaceDistanceAbs,
            renderMainPage
        });
    }
});

export { getSplitAmount, volumeToDiameter };

export function renderMainPage() {
    syncMainMarimoDerivedState();
    mainPageUI.renderMainPage();
}

export function initMainPage(options = {}) {
    const context = {
        renderWarehousePage: options.renderWarehousePage,
        renderShopPage: options.renderShopPage,
        showGlobalMessage: options.showGlobalMessage,
        renderMainPage
    };

    syncMainMarimoDerivedState();

    bindDevDisplayEvents(context.renderMainPage);

    bindMainEvents({
        getMainElements: mainPageUI.getMainElements,
        onMainMarimoClick: () => {
            handleMainMarimoClick({
                mainPageUI,
                renderMainPage: context.renderMainPage
            });
        },
        onRollingStart: () => {
            mainPageUI.startManualRolling();
        },
        onRolling: ({ rollingSurfaceDistance, rollingSurfaceDistanceAbs }) => {
            const appliedRolling = mainPageUI.applyRollingVisual(
                Number.isFinite(rollingSurfaceDistance) ? rollingSurfaceDistance : rollingSurfaceDistanceAbs,
                { source: "manual" }
            );
            if (!appliedRolling || appliedRolling.distanceAbs <= 0) {
                return;
            }

            handleMainMarimoRolling({
                rollingSurfaceDistance: appliedRolling.distanceAbs,
                renderMainPage: context.renderMainPage
            });
        },
        onRollingEnd: () => {
            mainPageUI.endManualRolling();
        },
        onSplit: () => {
            handleSplit({
                mainPageUI,
                context
            });
        },
        onSplitUp: () => {
            adjustSplitVolume(1, context.renderMainPage);
        },
        onSplitDown: () => {
            adjustSplitVolume(-1, context.renderMainPage);
        },
        onToggleMarimoFixed: () => {
            handleToggleMarimoFixed({
                mainPageUI,
                renderMainPage: context.renderMainPage
            });
        },
        onSendToWarehouse: () => {
            handleSendToWarehouse({
                mainPageUI,
                context
            });
        }
    });

    startMainLoop({
        onFrame: (deltaSeconds) => {
            if (!state.marimo || state.mainSlotStatus === "empty") {
                return false;
            }

            const autoRollingSurfaceDistance = calculateAutoRollingSurfaceDistance(state, deltaSeconds);
            const appliedRolling = mainPageUI.applyRollingVisual(autoRollingSurfaceDistance, { source: "ambient" });
            if (!appliedRolling || appliedRolling.distanceAbs <= 0) {
                return false;
            }

            const result = handleMainMarimoRolling({
                rollingSurfaceDistance: appliedRolling.distanceAbs
            });

            return result.didGrow || result.usableRolling > 0;
        },
        persistState: saveState,
        renderMainPage: context.renderMainPage
    });

    return {
        renderMainPage
    };
}
