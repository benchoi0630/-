// 파일 역할: 업그레이드 버튼(상태/하드웨어/소프트웨어/시설) 모달 흐름을 제어한다.
// 핵심 책임: 모달 생성·전환·구매 클릭 처리와 공통 메시지 갱신을 담당한다.
// 연동 범위: globalController가 전달한 콜백과 state/upgrades 로직을 연결한다.

import { state, saveState } from "../../state.js";
import { applyProgression } from "../../progression/progressionLogic.js";
import { bindEventOnce } from "../../utils/domEvents.js";
import { processUpgradePurchase } from "../../upgrades/upgradeUiActions.js";
import { createModalBase } from "../../ui/modal/modalBase.js";

const MODAL_ID_STATE = "stateModal";
const MODAL_ID_HARDWARE = "hardwareUpgradeModal";
const MODAL_ID_SOFTWARE = "softwareUpgradeModal";
const MODAL_ID_FACILITY = "facilityUpgradeModal";

// 이 변수는 상태 모달 공통 제어 객체를 저장한다.
let stateModalBase = null;
// 이 변수는 하드웨어 업그레이드 모달 공통 제어 객체를 저장한다.
let hardwareModalBase = null;
// 이 변수는 소프트웨어 업그레이드 모달 공통 제어 객체를 저장한다.
let softwareModalBase = null;
// 이 변수는 시설 업그레이드 모달 공통 제어 객체를 저장한다.
let facilityModalBase = null;

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

    return null;
}

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

function routeFromStateTo(childModalId) {
    const stateModal = getModalBaseById(MODAL_ID_STATE);
    const childModal = getModalBaseById(childModalId);
    if (!stateModal || !childModal) {
        return;
    }

    stateModal.close("route-child");
    childModal.open();
}

function ensureModalBases(elements, closeAllModals) {
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
}

function bindUpgradePurchaseList(listNode, listenerKey, callbacks) {
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
            rerenderFn: callbacks.rerenderAll,
            showGlobalMessageFn: callbacks.showGlobalMessage,
            setUpgradeMessageFn: callbacks.setUpgradeMessage,
            upgradeId
        });
    });
}

// 이 함수는 업그레이드 버튼군 모달 흐름과 구매 이벤트를 초기화한다.
export function initUpgradeButtonController(options = {}) {
    const getElements = typeof options.getElements === "function" ? options.getElements : () => ({});
    const closeAllModals = typeof options.closeAllModals === "function" ? options.closeAllModals : () => {};
    const rerenderAll = typeof options.rerenderAll === "function" ? options.rerenderAll : () => {};
    const renderGlobalHeader = typeof options.renderGlobalHeader === "function" ? options.renderGlobalHeader : () => {};
    const setUpgradeMessage = typeof options.setUpgradeMessage === "function" ? options.setUpgradeMessage : () => {};
    const showGlobalMessage = typeof options.showGlobalMessage === "function" ? options.showGlobalMessage : () => {};
    const elements = getElements();

    ensureModalBases(elements, closeAllModals);

    bindEventOnce(elements.openStateModalBtn, "click", "listenerOpenStateModalBound", () => {
        if (!stateModalBase) {
            return;
        }

        closeAllModals("open-state");
        stateModalBase.open();
        setUpgradeMessage("");
        renderGlobalHeader();
    });

    bindEventOnce(elements.openHardwareModalBtn, "click", "listenerOpenHardwareModalBound", () => {
        routeFromStateTo(MODAL_ID_HARDWARE);
        setUpgradeMessage("");
        renderGlobalHeader();
    });

    bindEventOnce(elements.openSoftwareModalBtn, "click", "listenerOpenSoftwareModalBound", () => {
        routeFromStateTo(MODAL_ID_SOFTWARE);
        setUpgradeMessage("");
        renderGlobalHeader();
    });

    bindEventOnce(elements.openFacilityModalBtn, "click", "listenerOpenFacilityModalBound", () => {
        routeFromStateTo(MODAL_ID_FACILITY);
    });

    bindUpgradePurchaseList(elements.hardwareUpgradeList, "listenerHardwareUpgradeListBound", {
        rerenderAll,
        showGlobalMessage,
        setUpgradeMessage
    });

    bindUpgradePurchaseList(elements.softwareUpgradeList, "listenerSoftwareUpgradeListBound", {
        rerenderAll,
        showGlobalMessage,
        setUpgradeMessage
    });

    return {
        getModalBases: () => [stateModalBase, hardwareModalBase, softwareModalBase, facilityModalBase].filter(Boolean)
    };
}
