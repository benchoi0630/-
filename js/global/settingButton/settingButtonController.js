// 파일 역할: 설정 버튼 모달의 생성과 오픈 동작을 전담한다.
// 핵심 책임: 설정 모달의 open/close 루트를 전역 모달 규칙과 일치시킨다.
// 연동 범위: globalController에서 close-all 라우팅을 공유해 사용한다.

import { bindEventOnce } from "../../utils/domEvents.js";
import { createModalBase } from "../../ui/modal/modalBase.js";

const MODAL_ID_SETTING = "settingModal";

// 이 변수는 설정 모달 공통 제어 객체를 저장한다.
let settingModalBase = null;

function ensureModalBase(elements, closeAllModals) {
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
}

// 이 함수는 설정 버튼 모달 흐름을 초기화한다.
export function initSettingButtonController(options = {}) {
    const getElements = typeof options.getElements === "function" ? options.getElements : () => ({});
    const closeAllModals = typeof options.closeAllModals === "function" ? options.closeAllModals : () => {};
    const elements = getElements();

    ensureModalBase(elements, closeAllModals);

    bindEventOnce(elements.openSettingBtn, "click", "listenerOpenSettingModalBound", () => {
        if (!settingModalBase) {
            return;
        }

        closeAllModals("open-setting");
        settingModalBase.open();
    });

    return {
        getModalBases: () => [settingModalBase].filter(Boolean)
    };
}
