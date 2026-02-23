// 파일 역할: 전역 헤더/상태 모달/도감 모달군의 오픈·클로즈 라우팅을 조율한다.
// 핵심 책임: modalBase 래퍼를 생성해 부모-자식 모달 전환과 back/close 동작을 일관 처리한다.
// 연동 범위: 업그레이드 UI와 도감 렌더러를 연결하고 필요 시 페이지 재렌더를 트리거한다.

import { state, saveState } from "../state.js";
import { applyProgression } from "../progression/progressionLogic.js";
import { bindEventOnce } from "../utils/domEvents.js";
import { processUpgradePurchase } from "../upgrades/upgradeUiActions.js";
import { createModalBase } from "../ui/modalBase.js";
import { initDictionary } from "../ui/dictionary/initDictionary.js";
import { initUIChangeLogic } from "../settings/uiChangeLogic.js";
import {
    getGlobalElements,
    renderGlobalHeader,
    setUpgradeMessage,
    showGlobalMessage
} from "./globalView.js";

const MODAL_ID_STATE = "stateModal";
const MODAL_ID_HARDWARE = "hardwareUpgradeModal";
const MODAL_ID_SOFTWARE = "softwareUpgradeModal";
const MODAL_ID_FACILITY = "facilityUpgradeModal";
const MODAL_ID_DICTIONARY = "dictionaryModal";
const MODAL_ID_MARIMO_DICTIONARY = "marimoDictionaryModal";
const MODAL_ID_MERCHANT_DICTIONARY = "merchantDictionaryModal";
const MODAL_ID_DIALOGUE_HISTORY = "dialogueHistoryModal";
const MODAL_ID_SETTING = "settingModal";

// 이 변수는 상태 모달 공통 제어 객체를 저장한다.
let stateModalBase = null;
// 이 변수는 하드웨어 업그레이드 모달 공통 제어 객체를 저장한다.
let hardwareModalBase = null;
// 이 변수는 소프트웨어 업그레이드 모달 공통 제어 객체를 저장한다.
let softwareModalBase = null;
// 이 변수는 시설 업그레이드 모달 공통 제어 객체를 저장한다.
let facilityModalBase = null;
// 이 변수는 도감 메인 모달 공통 제어 객체를 저장한다.
let dictionaryModalBase = null;
// 이 변수는 마리모 도감 모달 공통 제어 객체를 저장한다.
let marimoDictionaryModalBase = null;
// 이 변수는 상인 도감 모달 공통 제어 객체를 저장한다.
let merchantDictionaryModalBase = null;
// 이 변수는 대화기록 모달 공통 제어 객체를 저장한다.
let dialogueHistoryModalBase = null;
// 이 변수는 설정 모달 공통 제어 객체를 저장한다.
let settingModalBase = null;
// 이 변수는 도감 렌더러 초기화 객체를 저장한다.
let dictionaryUI = null;

// 이 함수는 전역 액션 이후 화면 전체를 일관되게 다시 렌더링한다.
function rerenderAll(context) {
    renderGlobalHeader(state);
    if (dictionaryUI) {
        dictionaryUI.renderDictionary(state);
    }
    context.renderMainPage();

    if (context.renderWarehousePage) {
        context.renderWarehousePage();
    }

    if (context.renderShopPage) {
        context.renderShopPage();
    }
}

// 이 함수는 모달 아이디에 대응하는 모달 베이스 객체를 반환한다.
function getModalBaseById(modalId) {
    if (modalId === MODAL_ID_STATE) {
        return stateModalBase;
    }
    if (modalId === MODAL_ID_HARDWARE) {
        return hardwareModalBase;
    }
    if (modalId === MODAL_ID_SOFTWARE) {
        return softwareModalBase;
    }
    if (modalId === MODAL_ID_FACILITY) {
        return facilityModalBase;
    }
    if (modalId === MODAL_ID_DICTIONARY) {
        return dictionaryModalBase;
    }
    if (modalId === MODAL_ID_MARIMO_DICTIONARY) {
        return marimoDictionaryModalBase;
    }
    if (modalId === MODAL_ID_MERCHANT_DICTIONARY) {
        return merchantDictionaryModalBase;
    }
    if (modalId === MODAL_ID_DIALOGUE_HISTORY) {
        return dialogueHistoryModalBase;
    }
    if (modalId === MODAL_ID_SETTING) {
        return settingModalBase;
    }
    return null;
}

// 이 함수는 현재 생성된 모든 모달 베이스 객체를 배열로 반환한다.
function getAllModalBases() {
    return [
        stateModalBase,
        hardwareModalBase,
        softwareModalBase,
        facilityModalBase,
        dictionaryModalBase,
        marimoDictionaryModalBase,
        merchantDictionaryModalBase,
        dialogueHistoryModalBase,
        settingModalBase
    ].filter(Boolean);
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

// 이 함수는 부모 모달로 복귀하기 위해 현재 모달을 닫고 부모 모달을 연다.
function goBackToParent(currentModalId, parentModalId) {
    if (!parentModalId) {
        return;
    }

    const currentModal = getModalBaseById(currentModalId);
    const parentModal = getModalBaseById(parentModalId);
    if (!currentModal || !parentModal) {
        return;
    }

    currentModal.close("back");
    parentModal.open();
}

// 이 함수는 상태 모달을 닫고 지정한 하위 모달로 이동한다.
function routeFromStateTo(childModalId) {
    const stateModal = getModalBaseById(MODAL_ID_STATE);
    const childModal = getModalBaseById(childModalId);
    if (!stateModal || !childModal) {
        return;
    }

    stateModal.close("route-child");
    childModal.open();
}

// 이 함수는 특정 부모 모달에서 지정한 하위 모달로 이동한다.
function routeFromParentTo(parentModalId, childModalId) {
    const parentModal = getModalBaseById(parentModalId);
    const childModal = getModalBaseById(childModalId);
    if (!parentModal || !childModal) {
        return;
    }

    parentModal.close("route-child");
    childModal.open();
}

// 이 함수는 전역 모달 공통 제어 객체들을 한 번만 생성한다.
function ensureModalBases(elements) {
    if (!stateModalBase && elements.stateModal) {
        stateModalBase = createModalBase({
            modalId: MODAL_ID_STATE,
            rootEl: elements.stateModal,
            closeButtonSelector: "#closeStateModalBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!hardwareModalBase && elements.hardwareUpgradeModal) {
        hardwareModalBase = createModalBase({
            modalId: MODAL_ID_HARDWARE,
            parentModalId: MODAL_ID_STATE,
            rootEl: elements.hardwareUpgradeModal,
            closeButtonSelector: "#closeHardwareUpgradeBtn",
            backButtonSelector: "#backHardwareUpgradeBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onBack: ({ modalId, parentModalId }) => goBackToParent(modalId, parentModalId),
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!softwareModalBase && elements.softwareUpgradeModal) {
        softwareModalBase = createModalBase({
            modalId: MODAL_ID_SOFTWARE,
            parentModalId: MODAL_ID_STATE,
            rootEl: elements.softwareUpgradeModal,
            closeButtonSelector: "#closeSoftwareUpgradeBtn",
            backButtonSelector: "#backSoftwareUpgradeBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onBack: ({ modalId, parentModalId }) => goBackToParent(modalId, parentModalId),
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!facilityModalBase && elements.facilityUpgradeModal) {
        facilityModalBase = createModalBase({
            modalId: MODAL_ID_FACILITY,
            parentModalId: MODAL_ID_STATE,
            rootEl: elements.facilityUpgradeModal,
            closeButtonSelector: "#closeFacilityUpgradeBtn",
            backButtonSelector: "#backFacilityUpgradeBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onBack: ({ modalId, parentModalId }) => goBackToParent(modalId, parentModalId),
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!dictionaryModalBase && elements.dictionaryModal) {
        dictionaryModalBase = createModalBase({
            modalId: MODAL_ID_DICTIONARY,
            rootEl: elements.dictionaryModal,
            closeButtonSelector: "#closeDictionaryBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!marimoDictionaryModalBase && elements.marimoDictionaryModal) {
        marimoDictionaryModalBase = createModalBase({
            modalId: MODAL_ID_MARIMO_DICTIONARY,
            parentModalId: MODAL_ID_DICTIONARY,
            rootEl: elements.marimoDictionaryModal,
            closeButtonSelector: "#closeMarimoDictionaryBtn",
            backButtonSelector: "#backMarimoDictionaryBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onBack: ({ modalId, parentModalId }) => goBackToParent(modalId, parentModalId),
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!merchantDictionaryModalBase && elements.merchantDictionaryModal) {
        merchantDictionaryModalBase = createModalBase({
            modalId: MODAL_ID_MERCHANT_DICTIONARY,
            parentModalId: MODAL_ID_DICTIONARY,
            rootEl: elements.merchantDictionaryModal,
            closeButtonSelector: "#closeMerchantDictionaryBtn",
            backButtonSelector: "#backMerchantDictionaryBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onBack: ({ modalId, parentModalId }) => goBackToParent(modalId, parentModalId),
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!dialogueHistoryModalBase && elements.dialogueHistoryModal) {
        dialogueHistoryModalBase = createModalBase({
            modalId: MODAL_ID_DIALOGUE_HISTORY,
            parentModalId: MODAL_ID_DICTIONARY,
            rootEl: elements.dialogueHistoryModal,
            closeButtonSelector: "#closeDialogueHistoryBtn",
            backButtonSelector: "#backDialogueHistoryBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onBack: ({ modalId, parentModalId }) => goBackToParent(modalId, parentModalId),
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (!settingModalBase && elements.settingModal) {
        settingModalBase = createModalBase({
            modalId: MODAL_ID_SETTING,
            rootEl: elements.settingModal,
            closeButtonSelector: "#closeSettingBtn",
            closeOnOverlayClick: true,
            closeOnEscape: true,
            onOverlayCloseAll: () => closeAllModals("overlay-all")
        });
    }

    if (stateModalBase) {
        stateModalBase.setChildModalIds([MODAL_ID_HARDWARE, MODAL_ID_SOFTWARE, MODAL_ID_FACILITY]);
    }
    if (hardwareModalBase) {
        hardwareModalBase.setParentModalId(MODAL_ID_STATE);
    }
    if (softwareModalBase) {
        softwareModalBase.setParentModalId(MODAL_ID_STATE);
    }
    if (facilityModalBase) {
        facilityModalBase.setParentModalId(MODAL_ID_STATE);
    }
    if (dictionaryModalBase) {
        dictionaryModalBase.setChildModalIds([MODAL_ID_MARIMO_DICTIONARY, MODAL_ID_MERCHANT_DICTIONARY, MODAL_ID_DIALOGUE_HISTORY]);
    }
    if (marimoDictionaryModalBase) {
        marimoDictionaryModalBase.setParentModalId(MODAL_ID_DICTIONARY);
    }
    if (merchantDictionaryModalBase) {
        merchantDictionaryModalBase.setParentModalId(MODAL_ID_DICTIONARY);
    }
    if (dialogueHistoryModalBase) {
        dialogueHistoryModalBase.setParentModalId(MODAL_ID_DICTIONARY);
    }
}

// 이 함수는 업그레이드 리스트 노드에 공통 구매 이벤트를 바인딩한다.
function bindUpgradePurchaseList(listNode, listenerKey, context) {
    bindEventOnce(listNode, "click", listenerKey, (event) => {
        const button = event.target?.closest?.("[data-upgrade-id]");
        if (!button || button.disabled) {
            return;
        }

        const upgradeId = button.dataset.upgradeId;
        processUpgradePurchase({
            currentState: state,
            applyProgressionFn: applyProgression,
            saveStateFn: saveState,
            rerenderFn: () => rerenderAll(context),
            showGlobalMessageFn: showGlobalMessage,
            setUpgradeMessageFn: setUpgradeMessage,
            upgradeId
        });
    });
}

// 이 함수는 전역 헤더와 업그레이드 모달 리스너를 한 번만 연결한다.
function bindGlobalEvents(context) {
    const elements = getGlobalElements();
    if (!dictionaryUI) {
        dictionaryUI = initDictionary({ getElements: getGlobalElements });
    }
    ensureModalBases(elements);

    bindEventOnce(elements.openStateModalBtn, "click", "listenerOpenStateModalBound", () => {
        if (!stateModalBase) {
            return;
        }

        closeAllModals("open-state");
        stateModalBase.open();
        setUpgradeMessage("");
        renderGlobalHeader(state);
    });

    bindEventOnce(elements.openHardwareModalBtn, "click", "listenerOpenHardwareModalBound", () => {
        routeFromStateTo(MODAL_ID_HARDWARE);
        setUpgradeMessage("");
        renderGlobalHeader(state);
    });

    bindEventOnce(elements.openSoftwareModalBtn, "click", "listenerOpenSoftwareModalBound", () => {
        routeFromStateTo(MODAL_ID_SOFTWARE);
        setUpgradeMessage("");
        renderGlobalHeader(state);
    });

    bindEventOnce(elements.openFacilityModalBtn, "click", "listenerOpenFacilityModalBound", () => {
        routeFromStateTo(MODAL_ID_FACILITY);
    });

    bindEventOnce(elements.openDictionaryBtn, "click", "listenerOpenDictionaryModalBound", () => {
        if (!dictionaryModalBase || !dictionaryUI) {
            return;
        }

        closeAllModals("open-dictionary");
        dictionaryUI.renderDictionary(state);
        dictionaryModalBase.open();
    });

    bindEventOnce(elements.openSettingBtn, "click", "listenerOpenSettingModalBound", () => {
        if (!settingModalBase) {
            return;
        }

        closeAllModals("open-setting");
        settingModalBase.open();
    });

    bindEventOnce(elements.openMarimoDictionaryBtn, "click", "listenerOpenMarimoDictionaryBound", () => {
        if (dictionaryUI) {
            dictionaryUI.renderDictionary(state);
        }
        routeFromParentTo(MODAL_ID_DICTIONARY, MODAL_ID_MARIMO_DICTIONARY);
    });

    bindEventOnce(elements.openMerchantDictionaryBtn, "click", "listenerOpenMerchantDictionaryBound", () => {
        if (dictionaryUI) {
            dictionaryUI.renderDictionary(state);
        }
        routeFromParentTo(MODAL_ID_DICTIONARY, MODAL_ID_MERCHANT_DICTIONARY);
    });

    bindEventOnce(elements.openDialogueHistoryBtn, "click", "listenerOpenDialogueHistoryBound", () => {
        if (dictionaryUI) {
            dictionaryUI.renderDictionary(state);
        }
        routeFromParentTo(MODAL_ID_DICTIONARY, MODAL_ID_DIALOGUE_HISTORY);
    });

    bindUpgradePurchaseList(elements.hardwareUpgradeList, "listenerHardwareUpgradeListBound", context);
    bindUpgradePurchaseList(elements.softwareUpgradeList, "listenerSoftwareUpgradeListBound", context);
}

// 이 함수는 전역 헤더와 업그레이드 모달 동작을 초기화한다.
export function initGlobalUI(options) {
    const context = {
        renderMainPage: options.renderMainPage,
        renderShopPage: options.renderShopPage,
        renderWarehousePage: options.renderWarehousePage
    };

    bindGlobalEvents(context);
    initUIChangeLogic({
        settingModal: getGlobalElements().settingModal
    });

    if (dictionaryUI) {
        dictionaryUI.renderDictionary(state);
    }

    return {
        renderGlobalHeader: () => renderGlobalHeader(state),
        showGlobalMessage
    };
}
