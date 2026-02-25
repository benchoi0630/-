// 파일 역할: net 레이어에서 단일/스택 마리모 커서 비주얼과 표시 아이템 규칙을 제공한다.
// 핵심 책임: pending 개수에 따라 커서 stack 렌더를 관리하고 net 캔버스 개별 렌더를 제어한다.
// 연동 범위: transportMode view/basketLayer가 공용으로 호출하는 net 시각화 전용 모듈이다.

import { renderMarimoStackVisual } from "../../../modules/marimoStackVisual.js";
import { getTransportModeRuntimeState } from "../transportModeState.js";

const TRANSPORT_NET_CURSOR_STACK_HOST_CLASS = "transport-net-cursor-stack-host";
const TRANSPORT_NET_DROP_STACK_HOST_CLASS = "transport-net-drop-stack-host";
const TRANSPORT_NET_DROP_STACK_VISUAL_CLASS = "transport-net-drop-stack-visual";
const TRANSPORT_NET_ABSORB_ORB_CLASS = "transport-net-absorb-orb";
const TRANSPORT_NET_STACK_PULSE_CLASS = "transport-net-cursor-stack-pulse";
const TRANSPORT_NET_ABSORB_DURATION_MS = 170;
const TRANSPORT_NET_STACK_PULSE_MS = 180;

const dropStackState = {
    active: false,
    clientX: 0,
    clientY: 0,
    remainingItemIdSet: new Set(),
    representativeMarimo: null
};

function toSafePendingItems(snapshot) {
    if (!Array.isArray(snapshot?.pendingItems)) {
        return [];
    }

    return snapshot.pendingItems.filter((item) => item && typeof item === "object");
}

function toUniqueItemIds(itemIds) {
    if (!Array.isArray(itemIds)) {
        return [];
    }

    const uniqueIds = [];
    const seen = new Set();
    for (let i = 0; i < itemIds.length; i += 1) {
        const itemId = itemIds[i];
        if (typeof itemId !== "string" || itemId.length <= 0 || seen.has(itemId)) {
            continue;
        }

        seen.add(itemId);
        uniqueIds.push(itemId);
    }

    return uniqueIds;
}

function getDropStackHost(layer) {
    return layer.querySelector(`.${TRANSPORT_NET_DROP_STACK_HOST_CLASS}`);
}

function clearDropStackHost(layer) {
    if (!(layer instanceof HTMLElement)) {
        return;
    }

    const host = getDropStackHost(layer);
    if (host) {
        host.remove();
    }
}

function resetDropStackState() {
    dropStackState.active = false;
    dropStackState.clientX = 0;
    dropStackState.clientY = 0;
    dropStackState.remainingItemIdSet = new Set();
    dropStackState.representativeMarimo = null;
}

function findRepresentativeMarimoByIds(pendingItems, itemIds) {
    const idSet = new Set(itemIds);
    for (let i = 0; i < pendingItems.length; i += 1) {
        const item = pendingItems[i];
        const itemId = typeof item?.id === "string" ? item.id : "";
        if (idSet.has(itemId)) {
            return item;
        }
    }

    return pendingItems[0] || null;
}

function getStackVisualKey(pendingItems) {
    if (!Array.isArray(pendingItems) || pendingItems.length < 2) {
        return "";
    }

    const representative = pendingItems[0];
    const representativeId = typeof representative?.id === "string" ? representative.id : "";
    const representativeType = typeof representative?.type === "string" ? representative.type : "";
    return `${pendingItems.length}:${representativeId}:${representativeType}`;
}

function clearTransportNetStackVisual(cursor) {
    if (!(cursor instanceof HTMLElement)) {
        return;
    }

    const host = cursor.querySelector(`.${TRANSPORT_NET_CURSOR_STACK_HOST_CLASS}`);
    if (host) {
        host.remove();
    }

    cursor.classList.remove("transport-net-cursor-has-stack");
    cursor.dataset.stackVisualKey = "";
}

/** 이 함수는 net 커서에 stack 비주얼을 렌더/정리한다. */
export function renderTransportNetStackVisual(cursor, snapshot) {
    if (!(cursor instanceof HTMLElement)) {
        return;
    }

    const pendingItems = toSafePendingItems(snapshot);
    if (pendingItems.length < 2) {
        clearTransportNetStackVisual(cursor);
        return;
    }

    const nextVisualKey = getStackVisualKey(pendingItems);
    if (cursor.dataset.stackVisualKey === nextVisualKey) {
        cursor.classList.add("transport-net-cursor-has-stack");
        return;
    }

    clearTransportNetStackVisual(cursor);

    const host = document.createElement("div");
    host.className = TRANSPORT_NET_CURSOR_STACK_HOST_CLASS;

    const visual = document.createElement("div");
    host.appendChild(visual);

    renderMarimoStackVisual(visual, {
        marimo: pendingItems[0],
        count: pendingItems.length
    });

    cursor.appendChild(host);
    cursor.classList.add("transport-net-cursor-has-stack");
    cursor.dataset.stackVisualKey = nextVisualKey;
}

/** 이 함수는 net 캔버스에 표시할 pending 마리모 목록을 반환한다. */
export function getTransportNetRenderablePendingItems(pendingItems) {
    const safePendingItems = Array.isArray(pendingItems)
        ? pendingItems.filter((item) => item && typeof item === "object")
        : [];

    // 1개일 때만 실제 마리모를 보이고, 2개 이상이면 커서 stack 비주얼만 표시한다.
    if (safePendingItems.length >= 2) {
        return [];
    }

    return safePendingItems;
}

/** 이 함수는 drop 지점 고정 stack 비주얼을 시작한다. */
export function startTransportNetDropStack(options = {}) {
    const clientX = options?.clientX;
    const clientY = options?.clientY;
    const itemIds = toUniqueItemIds(options?.itemIds);

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || itemIds.length <= 0) {
        resetDropStackState();
        return false;
    }

    const snapshot = getTransportModeRuntimeState();
    const pendingItems = toSafePendingItems(snapshot);
    const representativeMarimo = findRepresentativeMarimoByIds(pendingItems, itemIds);

    dropStackState.active = true;
    dropStackState.clientX = clientX;
    dropStackState.clientY = clientY;
    dropStackState.remainingItemIdSet = new Set(itemIds);
    dropStackState.representativeMarimo = representativeMarimo ? { ...representativeMarimo } : null;
    return true;
}

/** 이 함수는 커밋된 아이템을 drop stack 잔여 개수에서 차감한다. */
export function consumeTransportNetDropStackItems(itemIds) {
    if (!dropStackState.active) {
        return 0;
    }

    const uniqueIds = toUniqueItemIds(itemIds);
    if (uniqueIds.length <= 0) {
        return dropStackState.remainingItemIdSet.size;
    }

    for (let i = 0; i < uniqueIds.length; i += 1) {
        dropStackState.remainingItemIdSet.delete(uniqueIds[i]);
    }

    if (dropStackState.remainingItemIdSet.size <= 0) {
        resetDropStackState();
        return 0;
    }

    return dropStackState.remainingItemIdSet.size;
}

/** 이 함수는 drop stack 상태를 강제로 초기화한다. */
export function clearTransportNetDropStack() {
    resetDropStackState();
}

/** 이 함수는 drop 지점에 고정된 stack 비주얼을 렌더/정리한다. */
export function renderTransportNetDropStackVisual(layer) {
    if (!(layer instanceof HTMLElement)) {
        return;
    }

    if (!dropStackState.active || dropStackState.remainingItemIdSet.size <= 0) {
        clearDropStackHost(layer);
        return;
    }

    let host = getDropStackHost(layer);
    if (!host) {
        host = document.createElement("div");
        host.className = TRANSPORT_NET_DROP_STACK_HOST_CLASS;
        const visual = document.createElement("div");
        visual.className = TRANSPORT_NET_DROP_STACK_VISUAL_CLASS;
        host.appendChild(visual);
        layer.appendChild(host);
    }

    const layerRect = layer.getBoundingClientRect();
    const localX = dropStackState.clientX - layerRect.left;
    const localY = dropStackState.clientY - layerRect.top;
    host.style.transform = `translate(${Math.round(localX)}px, ${Math.round(localY)}px)`;

    const count = dropStackState.remainingItemIdSet.size;
    const marimo = dropStackState.representativeMarimo;
    const visualKey = `${count}:${typeof marimo?.id === "string" ? marimo.id : ""}:${typeof marimo?.type === "string" ? marimo.type : ""}`;
    if (host.dataset.visualKey === visualKey) {
        return;
    }

    const visual = host.querySelector(`.${TRANSPORT_NET_DROP_STACK_VISUAL_CLASS}`);
    if (!(visual instanceof HTMLElement)) {
        return;
    }

    renderMarimoStackVisual(visual, {
        marimo,
        count
    });
    host.dataset.visualKey = visualKey;
}

/** 이 함수는 포집된 마리모가 stack으로 흡수되는 짧은 궤적 애니메이션을 재생한다. */
export function playTransportNetAbsorbAnimation(options = {}) {
    const host = options?.host;
    const startClientX = options?.startClientX;
    const startClientY = options?.startClientY;
    const targetClientX = options?.targetClientX;
    const targetClientY = options?.targetClientY;

    if (!(host instanceof HTMLElement)) {
        return;
    }

    if (!Number.isFinite(startClientX) || !Number.isFinite(startClientY)
        || !Number.isFinite(targetClientX) || !Number.isFinite(targetClientY)) {
        return;
    }

    const hostRect = host.getBoundingClientRect();
    if (!Number.isFinite(hostRect.width) || !Number.isFinite(hostRect.height) || hostRect.width <= 0 || hostRect.height <= 0) {
        return;
    }

    const startX = startClientX - hostRect.left;
    const startY = startClientY - hostRect.top;
    const targetX = targetClientX - hostRect.left;
    const targetY = targetClientY - hostRect.top;

    const orb = document.createElement("span");
    orb.className = TRANSPORT_NET_ABSORB_ORB_CLASS;
    host.appendChild(orb);

    const startTransform = `translate(${Math.round(startX)}px, ${Math.round(startY)}px) scale(1)`;
    const endTransform = `translate(${Math.round(targetX)}px, ${Math.round(targetY)}px) scale(0.18)`;

    if (typeof orb.animate === "function") {
        const animation = orb.animate(
            [
                { transform: startTransform, opacity: 0.88 },
                { transform: endTransform, opacity: 0 }
            ],
            {
                duration: TRANSPORT_NET_ABSORB_DURATION_MS,
                easing: "cubic-bezier(0.18, 0.82, 0.16, 1)",
                fill: "forwards"
            }
        );

        animation.onfinish = () => {
            orb.remove();
        };
        return;
    }

    orb.style.transform = startTransform;
    orb.style.opacity = "0.88";
    orb.style.transition = `transform ${TRANSPORT_NET_ABSORB_DURATION_MS}ms cubic-bezier(0.18, 0.82, 0.16, 1), opacity ${TRANSPORT_NET_ABSORB_DURATION_MS}ms linear`;

    requestAnimationFrame(() => {
        orb.style.transform = endTransform;
        orb.style.opacity = "0";
    });

    setTimeout(() => {
        orb.remove();
    }, TRANSPORT_NET_ABSORB_DURATION_MS + 40);
}

/** 이 함수는 stack 커서에 짧은 pulse를 주어 흡수 피드백을 강조한다. */
export function pulseTransportNetStackVisual(cursor) {
    if (!(cursor instanceof HTMLElement)) {
        return;
    }

    cursor.classList.remove(TRANSPORT_NET_STACK_PULSE_CLASS);
    void cursor.offsetWidth;
    cursor.classList.add(TRANSPORT_NET_STACK_PULSE_CLASS);

    setTimeout(() => {
        cursor.classList.remove(TRANSPORT_NET_STACK_PULSE_CLASS);
    }, TRANSPORT_NET_STACK_PULSE_MS);
}
