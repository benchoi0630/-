// 파일 역할: warehouse와 운송모드(pending/transport) 사이 데이터 이동을 처리한다.
// 핵심 책임: 아이디 정규화, 중복 방지, state 배열 이동/복구를 안전하게 수행한다.
// 연동 범위: transportMode controller/interaction/queue에서 공통으로 사용한다.

import { state } from "../../state.js";
import { removeBasketItems } from "../../modules/basketPhysics/index.js";
import {
    getTransportModeRuntimeState,
    setTransportModePendingItems,
    setTransportModeSourceItems,
    setTransportModeTransportItems
} from "./transportModeState.js";

export const TRANSPORT_WAREHOUSE_CHANGED_EVENT = "marimo:transport-warehouse-changed";

export function notifyTransportWarehouseChanged() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return;
    }

    if (typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent(TRANSPORT_WAREHOUSE_CHANGED_EVENT));
        return;
    }

    window.dispatchEvent(new Event(TRANSPORT_WAREHOUSE_CHANGED_EVENT));
}

function splitWarehouseByItemIds(itemIds) {
    const itemIdSet = new Set(toUniqueItemIds(itemIds));
    if (itemIdSet.size <= 0) {
        return [];
    }

    const removedById = new Map();
    for (let i = state.warehouse.length - 1; i >= 0; i -= 1) {
        const item = state.warehouse[i];
        const itemId = getItemId(item);
        if (!itemIdSet.has(itemId) || removedById.has(itemId)) {
            continue;
        }

        const [removedItem] = state.warehouse.splice(i, 1);
        removedById.set(itemId, removedItem);
    }

    const removedInRequestedOrder = [];
    for (let i = 0; i < itemIds.length; i += 1) {
        const itemId = itemIds[i];
        const item = removedById.get(itemId);
        if (item) {
            removedInRequestedOrder.push(item);
        }
    }

    return removedInRequestedOrder;
}

function appendPendingItems(items) {
    if (!Array.isArray(items) || items.length <= 0) {
        return [];
    }

    const snapshot = getTransportModeRuntimeState();
    const nextPending = [...snapshot.pendingItems];
    const existingIdSet = new Set();

    for (let i = 0; i < snapshot.pendingItems.length; i += 1) {
        const itemId = getItemId(snapshot.pendingItems[i]);
        if (itemId) {
            existingIdSet.add(itemId);
        }
    }

    for (let i = 0; i < snapshot.transportItems.length; i += 1) {
        const itemId = getItemId(snapshot.transportItems[i]);
        if (itemId) {
            existingIdSet.add(itemId);
        }
    }

    const appendedIds = [];
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const itemId = getItemId(item);
        if (!itemId || existingIdSet.has(itemId)) {
            continue;
        }

        nextPending.push({ ...item });
        existingIdSet.add(itemId);
        appendedIds.push(itemId);
    }

    if (appendedIds.length > 0) {
        setTransportModePendingItems(nextPending);
    }

    return appendedIds;
}

export function movePendingItemsToTransport(itemIds) {
    const targetIdSet = new Set(toUniqueItemIds(itemIds));
    if (targetIdSet.size <= 0) {
        return [];
    }

    const snapshot = getTransportModeRuntimeState();
    const remainPending = [];
    const movedItems = [];

    for (let i = 0; i < snapshot.pendingItems.length; i += 1) {
        const item = snapshot.pendingItems[i];
        const itemId = getItemId(item);
        if (targetIdSet.has(itemId)) {
            movedItems.push(item);
        } else {
            remainPending.push(item);
        }
    }

    if (movedItems.length <= 0) {
        return [];
    }

    const nextTransport = [...snapshot.transportItems];
    const transportIdSet = new Set();
    for (let i = 0; i < snapshot.transportItems.length; i += 1) {
        const itemId = getItemId(snapshot.transportItems[i]);
        if (itemId) {
            transportIdSet.add(itemId);
        }
    }

    const movedIds = [];
    for (let i = 0; i < movedItems.length; i += 1) {
        const item = movedItems[i];
        const itemId = getItemId(item);
        if (!itemId || transportIdSet.has(itemId)) {
            continue;
        }

        nextTransport.push({ ...item });
        transportIdSet.add(itemId);
        movedIds.push(itemId);
    }

    setTransportModePendingItems(remainPending);
    setTransportModeTransportItems(nextTransport);
    return movedIds;
}

export function removeTransportItemsByIds(itemIds) {
    const targetIdSet = new Set(toUniqueItemIds(itemIds));
    if (targetIdSet.size <= 0) {
        return [];
    }

    const snapshot = getTransportModeRuntimeState();
    const nextTransportItems = [];
    const removedItems = [];
    const removedItemIdSet = new Set();

    for (let i = 0; i < snapshot.transportItems.length; i += 1) {
        const item = snapshot.transportItems[i];
        const itemId = getItemId(item);
        if (!itemId || !targetIdSet.has(itemId) || removedItemIdSet.has(itemId)) {
            nextTransportItems.push(item);
            continue;
        }

        removedItems.push({ ...item });
        removedItemIdSet.add(itemId);
    }

    if (removedItems.length <= 0) {
        return [];
    }

    setTransportModeTransportItems(nextTransportItems);
    return removedItems;
}

export function syncSourceItemsFromWarehouse() {
    setTransportModeSourceItems(state.warehouse);
}

export function restoreTransportItemsToWarehouse() {
    const snapshot = getTransportModeRuntimeState();
    const pooledItems = [...snapshot.pendingItems, ...snapshot.transportItems];
    if (pooledItems.length <= 0) {
        return 0;
    }

    const existingIdSet = new Set();
    for (let i = 0; i < state.warehouse.length; i += 1) {
        const itemId = getItemId(state.warehouse[i]);
        if (itemId) {
            existingIdSet.add(itemId);
        }
    }

    let restoredCount = 0;
    for (let i = 0; i < pooledItems.length; i += 1) {
        const item = pooledItems[i];
        const itemId = getItemId(item);
        if (!itemId || existingIdSet.has(itemId)) {
            continue;
        }

        state.warehouse.push({ ...item });
        existingIdSet.add(itemId);
        restoredCount += 1;
    }

    return restoredCount;
}

export function captureItemsIntoPending(itemIds) {
    const uniqueIds = toUniqueItemIds(itemIds);
    if (uniqueIds.length <= 0) {
        return [];
    }

    const removedItems = splitWarehouseByItemIds(uniqueIds);
    if (removedItems.length <= 0) {
        return [];
    }

    const removedIds = [];
    for (let i = 0; i < removedItems.length; i += 1) {
        const itemId = getItemId(removedItems[i]);
        if (itemId) {
            removedIds.push(itemId);
        }
    }

    if (removedIds.length > 0) {
        removeBasketItems({ itemIds: removedIds });
    }

    const appendedIds = appendPendingItems(removedItems);
    if (appendedIds.length > 0) {
        syncSourceItemsFromWarehouse();
    }

    return appendedIds;
}

// 안전 보조 함수: 데이터 정규화와 중복 방지용 유틸을 파일 하단에 모아 둔다.
function getItemId(item) {
    if (item && typeof item.id === "string" && item.id.length > 0) {
        return item.id;
    }

    return "";
}

export function toUniqueItemIds(itemIds) {
    const uniqueIds = [];
    const seen = new Set();

    if (!Array.isArray(itemIds)) {
        return uniqueIds;
    }

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
