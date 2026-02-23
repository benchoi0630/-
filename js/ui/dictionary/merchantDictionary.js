// 파일 역할: 상인 도감 카드 목록을 상태 해금 조건에 따라 렌더링한다.
// 핵심 책임: 상인 이미지 폴백 로딩과 잠금 처리, 이름 매핑을 함께 제공한다.
// 연동 범위: 상인 해금 진척을 도감 모달에서 일관된 카드 형식으로 표시한다.

import { merchantList } from "../../merchants/merchantsIndex.js";

const merchantImageCandidates = {
    merchant1: [
        new URL("../assets/merchants/merchant 1.1.png", import.meta.url).href,
        new URL("../assets/merchants/merchant1.png", import.meta.url).href
    ],
    merchant2: [
        new URL("../assets/merchants/merchant 2.1.png", import.meta.url).href,
        new URL("../assets/merchants/merchant2.png", import.meta.url).href
    ],
    merchant3: [
        new URL("../assets/merchants/merchant 3.1.webp", import.meta.url).href
    ],
    merchant4: [
        new URL("../assets/merchants/merchant 4.1.jpeg", import.meta.url).href
    ]
};

const merchantNameMap = {
    merchant1: "Merchant 1",
    merchant2: "Merchant 2",
    merchant3: "Merchant 3",
    merchant4: "Merchant 4"
};

function applyImageWithFallback(imageNode, candidates) {
    if (!(imageNode instanceof HTMLImageElement)) {
        return;
    }

    const safeCandidates = Array.isArray(candidates)
        ? candidates.filter((path) => typeof path === "string" && path.length > 0)
        : [];

    if (safeCandidates.length <= 0) {
        imageNode.removeAttribute("src");
        return;
    }

    let index = 0;

    const trySet = () => {
        if (index >= safeCandidates.length) {
            imageNode.onerror = null;
            imageNode.onload = null;
            return;
        }

        imageNode.src = safeCandidates[index];
    };

    imageNode.onerror = () => {
        index += 1;
        trySet();
    };

    imageNode.onload = () => {
        imageNode.onerror = null;
        imageNode.onload = null;
    };

    trySet();
}

// 이 함수는 상인 한 명의 해금 여부를 상태에서 읽어 반환한다.
function isMerchantUnlocked(currentState, merchantId) {
    return Boolean(currentState?.merchants?.[merchantId]?.unlocked === true);
}

// 이 함수는 상인 도감 그리드를 상태 기준으로 렌더링한다.
export function renderMerchantDictionary(container, currentState) {
    if (!container) {
        return;
    }

    container.textContent = "";

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        const merchantId = merchant?.id;
        if (typeof merchantId !== "string" || merchantId.length <= 0) {
            continue;
        }

        const unlocked = isMerchantUnlocked(currentState, merchantId);
        const card = document.createElement("article");
        card.className = "dictionary-entry-card";
        card.classList.toggle("dictionary-entry-locked", !unlocked);

        const previewWrap = document.createElement("div");
        previewWrap.className = "dictionary-entry-preview";

        const previewImage = document.createElement("img");
        previewImage.alt = unlocked ? (merchantNameMap[merchantId] || merchantId) : "locked merchant";
        previewImage.draggable = false;
        previewImage.decoding = "async";
        applyImageWithFallback(previewImage, merchantImageCandidates[merchantId] || merchantImageCandidates.merchant1);
        previewWrap.appendChild(previewImage);

        const label = document.createElement("div");
        label.className = "dictionary-entry-label";
        label.textContent = unlocked ? (merchantNameMap[merchantId] || merchantId) : "???";

        const status = document.createElement("div");
        status.className = "dictionary-entry-status";
        status.textContent = unlocked ? "Unlocked" : "Locked";

        card.appendChild(previewWrap);
        card.appendChild(label);
        card.appendChild(status);
        container.appendChild(card);
    }
}
