// 파일 역할: 도감 메인/하위 모달 버튼 바인딩과 렌더 트리거를 초기화한다.
// 핵심 책임: 마리모/상인 도감, 대화 기록 목록 표시를 모달 전환 흐름에 맞춰 연결한다.
// 연동 범위: dictionaryButtonController가 호출하는 도감 UI 초기 진입점을 제공한다.

import { renderMarimoDictionary } from "./marimoDictionary.js";
import { renderMerchantDictionary } from "./merchantDictionary.js";

// 이 함수는 대화기록 목록을 최신순으로 렌더링한다.
function renderDialogueHistory(container, currentState) {
    if (!container) {
        return;
    }

    container.textContent = "";
    const notifications = Array.isArray(currentState?.notifications) ? currentState.notifications : [];

    if (notifications.length <= 0) {
        const empty = document.createElement("p");
        empty.className = "dictionary-log-item";
        empty.textContent = "No records yet.";
        container.appendChild(empty);
        return;
    }

    for (let i = notifications.length - 1; i >= 0; i -= 1) {
        const message = notifications[i];
        if (typeof message !== "string" || message.length <= 0) {
            continue;
        }

        const line = document.createElement("p");
        line.className = "dictionary-log-item";
        line.textContent = message;
        container.appendChild(line);
    }
}

// 이 함수는 도감 모달 전용 렌더러를 초기화한다.
export function initDictionary(options = {}) {
    const getElements = typeof options.getElements === "function" ? options.getElements : () => ({});

    function renderDictionary(currentState) {
        const elements = getElements();
        renderMarimoDictionary(elements.marimoDictionaryGrid, currentState);
        renderMerchantDictionary(elements.merchantDictionaryGrid, currentState);
        renderDialogueHistory(elements.dialogueHistoryList, currentState);
    }

    return {
        renderDictionary
    };
}
