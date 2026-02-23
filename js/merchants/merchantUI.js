// 파일 역할: 상인 카드 DOM 생성과 이미지 변형(base/trade) 교체 유틸을 제공한다.
// 핵심 책임: 이미지 후보 폴백 로딩을 포함해 상인 카드 시각 요소를 안정적으로 렌더링한다.
// 연동 범위: 상점 뷰 계층에서 상인 카드 컴포넌트를 만드는 공통 UI 모듈이다.

const merchantImageCandidates = {
    merchant1: {
        base: [
            new URL("../ui/assets/merchants/merchant 1.1.png", import.meta.url).href,
            new URL("../ui/assets/merchants/merchant1.png", import.meta.url).href
        ],
        trade: [
            new URL("../ui/assets/merchants/merchant 1.2.png", import.meta.url).href,
            new URL("../ui/assets/merchants/merchant 1.1.png", import.meta.url).href
        ]
    },
    merchant2: {
        base: [
            new URL("../ui/assets/merchants/merchant 2.1.png", import.meta.url).href,
            new URL("../ui/assets/merchants/merchant2.png", import.meta.url).href
        ],
        trade: [
            new URL("../ui/assets/merchants/merchant 2.2.png", import.meta.url).href,
            new URL("../ui/assets/merchants/merchant 2.1.png", import.meta.url).href
        ]
    },
    merchant3: {
        base: [
            new URL("../ui/assets/merchants/merchant 3.1.webp", import.meta.url).href
        ],
        trade: [
            new URL("../ui/assets/merchants/merchant 3.2.webp", import.meta.url).href,
            new URL("../ui/assets/merchants/merchant 3.1.webp", import.meta.url).href
        ]
    },
    merchant4: {
        base: [
            new URL("../ui/assets/merchants/merchant 4.1.jpeg", import.meta.url).href
        ],
        trade: [
            new URL("../ui/assets/merchants/merchant 4.2.jpeg", import.meta.url).href,
            new URL("../ui/assets/merchants/merchant 4.1.jpeg", import.meta.url).href
        ]
    }
};

const DEFAULT_MERCHANT_ID = "merchant1";

function resolveImageCandidates(merchantId, variant) {
    const safeId = merchantImageCandidates[merchantId] ? merchantId : DEFAULT_MERCHANT_ID;
    const entry = merchantImageCandidates[safeId];
    const candidates = entry?.[variant];
    if (Array.isArray(candidates) && candidates.length > 0) {
        return candidates;
    }

    return entry?.base || merchantImageCandidates[DEFAULT_MERCHANT_ID].base;
}

function applyImageWithFallback(imageNode, candidates) {
    if (!(imageNode instanceof HTMLImageElement)) {
        return;
    }

    const safeCandidates = Array.isArray(candidates)
        ? candidates.filter((path) => typeof path === "string" && path.length > 0)
        : [];
    const cacheKey = safeCandidates.join("|");

    const alreadyApplied = imageNode.dataset.srcKey === cacheKey && imageNode.getAttribute("src");
    if (alreadyApplied) {
        return;
    }

    imageNode.dataset.srcKey = cacheKey;

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

function findMerchantImageNode(root) {
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const imageNode = root.querySelector(".merchant-card-image");
    return imageNode instanceof HTMLImageElement ? imageNode : null;
}

export function setMerchantImageVariant(root, merchantId, variant = "base") {
    const imageNode = findMerchantImageNode(root);
    if (!imageNode) {
        return;
    }

    imageNode.dataset.variant = variant;
    applyImageWithFallback(imageNode, resolveImageCandidates(merchantId, variant));
}

export function createMerchantElement(merchantId, infoText) {
    const root = document.createElement("div");
    root.className = "merchant-card";
    root.dataset.merchantId = String(merchantId || DEFAULT_MERCHANT_ID);
    root.setAttribute("role", "button");
    root.tabIndex = 0;

    const image = document.createElement("img");
    image.className = "merchant-card-image";
    image.alt = String(merchantId || DEFAULT_MERCHANT_ID);
    image.draggable = false;
    image.decoding = "async";

    const info = document.createElement("div");
    info.className = "merchant-card-info";

    const infoTextNode = document.createElement("span");
    infoTextNode.className = "merchant-info-text";
    infoTextNode.textContent = String(infoText || "");

    info.appendChild(infoTextNode);
    root.appendChild(image);
    root.appendChild(info);

    setMerchantImageVariant(root, merchantId, "base");
    return root;
}

