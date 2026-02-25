// 파일 역할: pending -> transport 커밋 지연 타이머를 관리한다.
// 핵심 책임: 아이템별 타이머 중복을 막고 모드 종료 시 전체 타이머를 안전하게 정리한다.
// 연동 범위: transportMode controller/interaction이 호출해 순차 보충을 구현한다.

import { movePendingItemsToTransport, toUniqueItemIds } from "./transportModeTransfer.js";

const pendingCommitTimerByItemId = new Map();

function clearPendingCommitTimer(itemId) {
    const timerId = pendingCommitTimerByItemId.get(itemId);
    if (!timerId) {
        return;
    }

    clearTimeout(timerId);
    pendingCommitTimerByItemId.delete(itemId);
}

export function clearAllPendingCommitTimers() {
    for (const timerId of pendingCommitTimerByItemId.values()) {
        clearTimeout(timerId);
    }
    pendingCommitTimerByItemId.clear();
}

export function schedulePendingCommit(itemIds, delayMs, onCommitted, options = {}) {
    const uniqueIds = toUniqueItemIds(itemIds);
    if (uniqueIds.length <= 0) {
        return;
    }

    const commitHandler = typeof onCommitted === "function" ? onCommitted : () => {};
    const baseDelayMs = Number.isFinite(delayMs) ? Math.max(0, Math.round(delayMs)) : 0;
    const intervalMs = Number.isFinite(options?.intervalMs) ? Math.max(0, Math.round(options.intervalMs)) : 0;

    for (let i = 0; i < uniqueIds.length; i += 1) {
        const itemId = uniqueIds[i];
        clearPendingCommitTimer(itemId);
        const queuedDelayMs = baseDelayMs + (i * intervalMs);

        const timerId = setTimeout(() => {
            pendingCommitTimerByItemId.delete(itemId);
            const movedIds = movePendingItemsToTransport([itemId]);
            if (movedIds.length > 0) {
                commitHandler(movedIds);
            }
        }, queuedDelayMs);

        pendingCommitTimerByItemId.set(itemId, timerId);
    }
}
