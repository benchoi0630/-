// 파일 역할: 전역 헤더 영역의 DOM 조회와 쉘/메시지 렌더 유틸을 제공한다.
// 핵심 책임: 쉘 카운트 표시, 글로벌 메시지 자동 소거, 업그레이드 메시지 노출을 처리한다.
// 연동 범위: 다른 모듈이 공통 HUD 상태를 갱신할 때 사용하는 뷰 계층 API다.

import { renderUpgradeModalState } from "../upgrades/upgradeUiActions.js";
import { renderUpgradeModalInfo } from "./upgradeButton/upgradeModalInfo.js";

// 이 변수는 전역 메시지 자동 삭제 타이머를 저장한다.
let clearGlobalMessageTimerId = null;

// 이 함수는 전역 헤더와 업그레이드 모달에서 사용하는 DOM 요소를 조회한다.
export function getGlobalElements() {
    return {
        globalHeader: document.getElementById("globalHeader"),
        globalHeaderMessage: document.getElementById("globalHeaderMessage"),
        shellsCount: document.getElementById("shellsCount"),
        shellsText: document.querySelector(".shells-text"),
        openStateModalBtn: document.getElementById("openStateModalBtn"),
        openDictionaryBtn: document.getElementById("openDictionaryBtn"),
        openSettingBtn: document.getElementById("openSettingBtn"),
        stateModal: document.getElementById("stateModal"),
        settingModal: document.getElementById("settingModal"),
        openHardwareModalBtn: document.getElementById("openHardwareModalBtn"),
        openSoftwareModalBtn: document.getElementById("openSoftwareModalBtn"),
        openFacilityModalBtn: document.getElementById("openFacilityModalBtn"),
        dictionaryModal: document.getElementById("dictionaryModal"),
        openMarimoDictionaryBtn: document.getElementById("openMarimoDictionaryBtn"),
        openMerchantDictionaryBtn: document.getElementById("openMerchantDictionaryBtn"),
        openDialogueHistoryBtn: document.getElementById("openDialogueHistoryBtn"),
        marimoDictionaryModal: document.getElementById("marimoDictionaryModal"),
        marimoDictionaryGrid: document.getElementById("marimoDictionaryGrid"),
        merchantDictionaryModal: document.getElementById("merchantDictionaryModal"),
        merchantDictionaryGrid: document.getElementById("merchantDictionaryGrid"),
        dialogueHistoryModal: document.getElementById("dialogueHistoryModal"),
        dialogueHistoryList: document.getElementById("dialogueHistoryList"),
        hardwareUpgradeModal: document.getElementById("hardwareUpgradeModal"),
        hardwareUpgradeList: document.getElementById("hardwareUpgradeList"),
        hardwareUpgradeInfo: document.getElementById("hardwareUpgradeInfo"),
        hardwareUpgradeMessage: document.getElementById("hardwareUpgradeMessage"),
        softwareUpgradeModal: document.getElementById("softwareUpgradeModal"),
        softwareUpgradeList: document.getElementById("softwareUpgradeList"),
        softwareUpgradeInfo: document.getElementById("softwareUpgradeInfo"),
        softwareUpgradeMessage: document.getElementById("softwareUpgradeMessage"),
        facilityUpgradeModal: document.getElementById("facilityUpgradeModal"),
        facilityUpgradeInfo: document.getElementById("facilityUpgradeInfo")
    };
}

// 이 함수는 쉘 HUD 요소를 애니메이션 타깃으로 반환한다.
export function getShellHudElement() {
    const elements = getGlobalElements();
    return elements.shellsText || elements.shellsCount || null;
}

// 이 함수는 전역 헤더에 메시지 노드가 없으면 생성해서 반환한다.
function ensureGlobalHeaderMessage(elements) {
    if (elements.globalHeaderMessage) {
        return elements.globalHeaderMessage;
    }

    if (!elements.globalHeader) {
        return null;
    }

    const message = document.createElement("span");
    message.id = "globalHeaderMessage";
    message.className = "message-text hidden";
    message.style.flex = "1";
    message.style.textAlign = "center";
    message.style.minHeight = "0";
    message.style.fontSize = "12px";

    if (elements.shellsText) {
        elements.globalHeader.insertBefore(message, elements.shellsText);
    } else {
        elements.globalHeader.appendChild(message);
    }

    return message;
}

// 이 함수는 전역 헤더 정보와 업그레이드 모달 표시값을 렌더링한다.
export function renderGlobalHeader(currentState) {
    const elements = getGlobalElements();

    if (elements.shellsCount) {
        elements.shellsCount.textContent = String(currentState.currency.shells);
    }

    ensureGlobalHeaderMessage(elements);
    renderUpgradeModalState(elements, currentState);
    renderUpgradeModalInfo(elements);
}

// 이 함수는 전역 헤더에 한 줄 메시지를 표시하고 잠시 뒤 지운다.
export function showGlobalMessage(message) {
    const elements = getGlobalElements();
    const messageNode = ensureGlobalHeaderMessage(elements);

    if (!messageNode) {
        return;
    }

    const safeMessage = typeof message === "string" ? message : "";
    messageNode.textContent = safeMessage;
    messageNode.classList.toggle("hidden", safeMessage.length <= 0);

    if (clearGlobalMessageTimerId) {
        clearTimeout(clearGlobalMessageTimerId);
    }

    if (!safeMessage) {
        return;
    }

    clearGlobalMessageTimerId = setTimeout(() => {
        const latestElements = getGlobalElements();
        const latestNode = ensureGlobalHeaderMessage(latestElements);
        if (latestNode) {
            latestNode.textContent = "";
            latestNode.classList.add("hidden");
        }
    }, 1400);
}

// 이 함수는 업그레이드 모달 메시지를 갱신한다.
export function setUpgradeMessage(message) {
    const elements = getGlobalElements();

    if (elements.hardwareUpgradeMessage) {
        elements.hardwareUpgradeMessage.textContent = message;
    }

    if (elements.softwareUpgradeMessage) {
        elements.softwareUpgradeMessage.textContent = message;
    }
}
