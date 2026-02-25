// 파일 역할: 전역 헤더와 버튼별 모달 컨트롤러의 초기화/재렌더 흐름을 조율한다.
// 핵심 책임: 공통 close-all, 전체 화면 재렌더, transport 모드 동기화를 일관되게 관리한다.
// 연동 범위: upgrade/dictionary/setting 버튼 컨트롤러를 묶어 app 진입점에 제공한다.

import { state } from "../state.js";
import { initUIChangeLogic } from "./settingButton/uiChangeLogic.js";
import {
    initTransportMode,
    renderTransportModeLayer,
    setTransportModeVisibleItems
} from "./transportMode/index.js";
import { initDictionaryButtonController } from "./dictionaryButton/dictionaryButtonController.js";
import { initSettingButtonController } from "./settingButton/settingButtonController.js";
import { initUpgradeButtonController } from "./upgradeButton/upgradeButtonController.js";
import {
    getGlobalElements,
    renderGlobalHeader,
    setUpgradeMessage,
    showGlobalMessage
} from "./globalView.js";

// 이 변수는 업그레이드 버튼 컨트롤러 초기화 객체를 저장한다.
let upgradeButtonController = null;
// 이 변수는 도감 버튼 컨트롤러 초기화 객체를 저장한다.
let dictionaryButtonController = null;
// 이 변수는 설정 버튼 컨트롤러 초기화 객체를 저장한다.
let settingButtonController = null;

// 이 함수는 현재 생성된 모든 모달 베이스 객체를 배열로 반환한다.
function getAllModalBases() {
    const upgradeModalBases = upgradeButtonController ? upgradeButtonController.getModalBases() : [];
    const dictionaryModalBases = dictionaryButtonController ? dictionaryButtonController.getModalBases() : [];
    const settingModalBases = settingButtonController ? settingButtonController.getModalBases() : [];

    return [...upgradeModalBases, ...dictionaryModalBases, ...settingModalBases].filter(Boolean);
}

// 이 함수는 열려 있는 모든 모달을 한 번에 닫는다.
function closeAllModals(reason = "close-all") {
    const modalBases = getAllModalBases();
    for (let i = 0; i < modalBases.length; i += 1) {
        if (modalBases[i].isOpen()) {
            modalBases[i].close(reason);
        }
    }
}

// 이 함수는 전역 액션 이후 화면 전체를 일관되게 다시 렌더링한다.
function rerenderAll(context) {
    renderGlobalHeader(state);

    if (dictionaryButtonController) {
        dictionaryButtonController.renderDictionary(state);
    }

    context.renderMainPage();

    if (context.renderWarehousePage) {
        context.renderWarehousePage();
    }

    if (context.renderShopPage) {
        context.renderShopPage();
    }

    setTransportModeVisibleItems({
        sourceItems: state.warehouse
    });
    renderTransportModeLayer();
}

// 이 함수는 전역 헤더 버튼별 컨트롤러를 한 번만 생성한다.
function bindGlobalEvents(context) {
    upgradeButtonController = initUpgradeButtonController({
        getElements: getGlobalElements,
        closeAllModals,
        rerenderAll: () => rerenderAll(context),
        renderGlobalHeader: () => renderGlobalHeader(state),
        setUpgradeMessage,
        showGlobalMessage
    });

    dictionaryButtonController = initDictionaryButtonController({
        getElements: getGlobalElements,
        closeAllModals
    });

    settingButtonController = initSettingButtonController({
        getElements: getGlobalElements,
        closeAllModals
    });
}

// 이 함수는 전역 헤더와 업그레이드 모달 동작을 초기화한다.
export function initGlobalUI(options) {
    const context = {
        renderMainPage: options.renderMainPage,
        renderShopPage: options.renderShopPage,
        renderWarehousePage: options.renderWarehousePage
    };

    bindGlobalEvents(context);
    initTransportMode({
        renderWarehousePage: context.renderWarehousePage
    });
    setTransportModeVisibleItems({
        sourceItems: state.warehouse
    });
    renderTransportModeLayer();
    initUIChangeLogic({
        settingModal: getGlobalElements().settingModal
    });

    if (dictionaryButtonController) {
        dictionaryButtonController.renderDictionary(state);
    }

    return {
        renderGlobalHeader: () => renderGlobalHeader(state),
        showGlobalMessage
    };
}
