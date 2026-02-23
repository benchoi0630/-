// 파일 역할: 상점에서 쓰는 카드 이동/거래 완료/쉘 보상 비주얼 연출을 담당한다.
// 핵심 책임: 입장·퇴장 wobble 이동과 거래 파티클, HUD flyTo 애니메이션을 제공한다.
// 연동 범위: 비즈니스 상태와 분리된 시각 효과 계층으로 재사용성을 높인다.

import { flyTo } from "../../ui/animation/flyTo.js";
import { setMerchantImageVariant } from "../../merchants/merchantUI.js";
import { wobbleMove } from "../../ui/animation/wobbleMove.js";
import { poyoBounce } from "../../ui/animation/poyoBounce.js";
import { floatUpParticles } from "../../ui/animation/floatUpParticles.js";

const MERCHANT_ENTER_DURATION_MS = 1680;
const MERCHANT_EXIT_DURATION_MS = 1290;
const SHELL_ICON_SRC = new URL("../../ui/assets/UI elements/shell.png", import.meta.url).href;
const HEART_PARTICLE_SRC = new URL("../../ui/assets/merchants/heart.png", import.meta.url).href;

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function runHudBounceEffect(element) {
    if (!element) {
        return;
    }

    if (typeof element.animate === "function") {
        element.animate([
            { transform: "scale(1)" },
            { offset: 0.45, transform: "scale(1.1)" },
            { transform: "scale(1)" }
        ], {
            duration: 180,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        });
        return;
    }

    element.style.transform = "scale(1.1)";
    setTimeout(() => {
        element.style.transform = "scale(1)";
    }, 180);
}

export function playShellRewardAnimation(params = {}) {
    const sourceElement = params.sourceElement;
    const targetElement = params.targetElement;
    const onArrive = typeof params.onArrive === "function" ? params.onArrive : () => {};
    const shellsEarned = params.shellsEarned;
    const safeShellsEarned = Number.isFinite(shellsEarned) ? Math.max(0, Math.round(shellsEarned)) : 0;

    if (safeShellsEarned <= 0) {
        onArrive();
        return;
    }

    if (!sourceElement || !targetElement) {
        onArrive();
        return;
    }

    flyTo({
        imageSrc: SHELL_ICON_SRC,
        fromEl: sourceElement,
        toEl: targetElement,
        amount: safeShellsEarned,
        maxIcons: 12,
        onArrive
    });
}

function cleanupNode(node) {
    if (node && node.parentNode) {
        node.parentNode.removeChild(node);
    }
}

function clearMotionInlineStyle(node) {
    if (!node) {
        return;
    }

    node.style.position = "";
    node.style.left = "";
    node.style.top = "";
    node.style.width = "";
    node.style.height = "";
    node.style.margin = "";
    node.style.pointerEvents = "";
    node.style.willChange = "";
    node.style.zIndex = "";
}

function getOffscreenRightRect(baseRect) {
    const topMin = 12;
    const topMax = Math.max(topMin, window.innerHeight - baseRect.height - 12);
    const top = clamp(baseRect.top + randomBetween(-20, 20), topMin, topMax);

    return {
        left: window.innerWidth + randomBetween(28, 96),
        top,
        width: baseRect.width,
        height: baseRect.height
    };
}

export function animateMerchantEnter(slotNode, merchantNode) {
    const toRect = slotNode.getBoundingClientRect();
    if (toRect.width <= 0 || toRect.height <= 0) {
        slotNode.textContent = "";
        slotNode.appendChild(merchantNode);
        return;
    }

    document.body.appendChild(merchantNode);

    wobbleMove({
        el: merchantNode,
        fromRect: getOffscreenRightRect(toRect),
        toRect,
        duration: MERCHANT_ENTER_DURATION_MS + randomBetween(0, 130),
        wobbleStrength: randomBetween(26, 42),
        onDone: () => {
            clearMotionInlineStyle(merchantNode);
            slotNode.textContent = "";
            slotNode.appendChild(merchantNode);
        }
    });
}

export function animateMerchantExit(slotNode, merchantNode) {
    const fromRect = slotNode.getBoundingClientRect();
    if (fromRect.width <= 0 || fromRect.height <= 0) {
        cleanupNode(merchantNode);
        return;
    }

    if (merchantNode.parentNode) {
        merchantNode.parentNode.removeChild(merchantNode);
    }

    document.body.appendChild(merchantNode);

    wobbleMove({
        el: merchantNode,
        fromRect,
        toRect: getOffscreenRightRect(fromRect),
        duration: MERCHANT_EXIT_DURATION_MS + randomBetween(0, 110),
        wobbleStrength: randomBetween(22, 36),
        onDone: () => {
            cleanupNode(merchantNode);
        }
    });
}

function findMerchantImageNode(root) {
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const imageNode = root.querySelector(".merchant-card-image");
    return imageNode instanceof HTMLElement ? imageNode : null;
}

export async function playTradeCompleteMotion(params = {}) {
    const merchantId = params.merchantId;
    const merchantNode = params.merchantNode;
    const signal = params.signal;

    if (!(merchantNode instanceof HTMLElement) || typeof merchantId !== "string") {
        return;
    }

    if (signal?.aborted === true) {
        return;
    }

    setMerchantImageVariant(merchantNode, merchantId, "trade");
    const imageNode = findMerchantImageNode(merchantNode) || merchantNode;

    await Promise.all([
        poyoBounce({
            el: imageNode,
            duration: 430,
            stretch: 0.22,
            iterations: 1,
            signal
        }),
        floatUpParticles({
            imageSrc: HEART_PARTICLE_SRC,
            originEl: imageNode,
            amount: 10,
            sizeMin: 8,
            sizeMax: 16,
            spreadRadius: 22,
            riseMin: 34,
            riseMax: 90,
            driftX: 28,
            durationMinMs: 420,
            durationMaxMs: 860,
            signal
        })
    ]);

    if (signal?.aborted === true) {
        return;
    }

    if (merchantNode.isConnected) {
        setMerchantImageVariant(merchantNode, merchantId, "base");
    }
}
