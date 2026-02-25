// 파일 역할: 도감 버튼 모달군(메인/마리모/상인/대화기록)의 전환을 제어한다.
// 핵심 책임: 도감 렌더 초기화와 모달 라우팅을 전역 close-all 정책과 연동한다.
// 연동 범위: globalController가 전달한 getElements/closeAll 콜백을 통해 작동한다.

import { state } from "../../state.js";
import { bindEventOnce } from "../../utils/domEvents.js";
import { createModalBase } from "../../ui/modal/modalBase.js";
import { initDictionary } from "./dictionary/initDictionary.js";

const MODAL_ID_DICTIONARY = "dictionaryModal";
const MODAL_ID_MARIMO_DICTIONARY = "marimoDictionaryModal";
const MODAL_ID_MERCHANT_DICTIONARY = "merchantDictionaryModal";
const MODAL_ID_DIALOGUE_HISTORY = "dialogueHistoryModal";

// 이 변수는 도감 메인 모달 공통 제어 객체를 저장한다.
let dictionaryModalBase = null;
// 이 변수는 마리모 도감 모달 공통 제어 객체를 저장한다.
let marimoDictionaryModalBase = null;
// 이 변수는 상인 도감 모달 공통 제어 객체를 저장한다.
let merchantDictionaryModalBase = null;
// 이 변수는 대화기록 모달 공통 제어 객체를 저장한다.
let dialogueHistoryModalBase = null;
// 이 변수는 도감 렌더러 초기화 객체를 저장한다.
let dictionaryUI = null;

function getModalBaseById(modalId) {
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

function routeFromParentTo(parentModalId, childModalId) {
    const parentModal = getModalBaseById(parentModalId);
    const childModal = getModalBaseById(childModalId);
    if (!parentModal || !childModal) {
        return;
    }

    parentModal.close("route-child");
    childModal.open();
}

function ensureModalBases(elements, closeAllModals) {
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

function renderDictionary(currentState = state) {
    if (!dictionaryUI) {
        return;
    }

    dictionaryUI.renderDictionary(currentState);
}

// 이 함수는 도감 버튼 모달 흐름과 렌더러를 초기화한다.
export function initDictionaryButtonController(options = {}) {
    const getElements = typeof options.getElements === "function" ? options.getElements : () => ({});
    const closeAllModals = typeof options.closeAllModals === "function" ? options.closeAllModals : () => {};
    if (!dictionaryUI) {
        dictionaryUI = initDictionary({ getElements });
    }

    const elements = getElements();
    ensureModalBases(elements, closeAllModals);

    bindEventOnce(elements.openDictionaryBtn, "click", "listenerOpenDictionaryModalBound", () => {
        if (!dictionaryModalBase || !dictionaryUI) {
            return;
        }

        closeAllModals("open-dictionary");
        renderDictionary(state);
        dictionaryModalBase.open();
    });

    bindEventOnce(elements.openMarimoDictionaryBtn, "click", "listenerOpenMarimoDictionaryBound", () => {
        renderDictionary(state);
        routeFromParentTo(MODAL_ID_DICTIONARY, MODAL_ID_MARIMO_DICTIONARY);
    });

    bindEventOnce(elements.openMerchantDictionaryBtn, "click", "listenerOpenMerchantDictionaryBound", () => {
        renderDictionary(state);
        routeFromParentTo(MODAL_ID_DICTIONARY, MODAL_ID_MERCHANT_DICTIONARY);
    });

    bindEventOnce(elements.openDialogueHistoryBtn, "click", "listenerOpenDialogueHistoryBound", () => {
        renderDictionary(state);
        routeFromParentTo(MODAL_ID_DICTIONARY, MODAL_ID_DIALOGUE_HISTORY);
    });

    return {
        getModalBases: () => [dictionaryModalBase, marimoDictionaryModalBase, merchantDictionaryModalBase, dialogueHistoryModalBase].filter(Boolean),
        renderDictionary
    };
}
