// 파일 역할: 상점 상인의 등장 상태와 슬롯 점유 계산을 수행하는 순수 로직 모듈이다.
// 핵심 책임: 고정 슬롯과 동적 슬롯 충돌을 해소해 현재 프레임 배치(assignments)를 만든다.
// 연동 범위: DOM/애니메이션 의존 없이 상태 계산만 처리해 테스트 가능성을 높인다.

export const SHOP_SLOT_COUNT = 4;
export const FIXED_MERCHANT1_SLOT_INDEX = 0;
export const DYNAMIC_SLOT_INDEXES = [1, 2, 3];

export function getMerchantState(state, merchantId) {
    const merchantState = state?.merchants?.[merchantId];
    return merchantState && typeof merchantState === "object" ? merchantState : null;
}

export function isDynamicSlotIndex(slotIndex) {
    return slotIndex === 1 || slotIndex === 2 || slotIndex === 3;
}

export function getAssignedSlotIndexForMerchant(state, merchant, merchantState, now) {
    if (!merchant || !merchantState) {
        return null;
    }

    let assignedSlot = null;

    if (typeof merchant.getAssignedSlotIndex === "function") {
        assignedSlot = merchant.getAssignedSlotIndex(state, merchantState, now);
    } else if (typeof merchant.getAppearSpec === "function") {
        const appearSpec = merchant.getAppearSpec(state, merchantState, now);
        if (appearSpec?.visible === true && merchant.id === "merchant1") {
            assignedSlot = FIXED_MERCHANT1_SLOT_INDEX;
        }
    }

    if (!Number.isFinite(assignedSlot)) {
        return null;
    }

    const normalizedSlot = Math.round(assignedSlot);
    if (normalizedSlot === FIXED_MERCHANT1_SLOT_INDEX) {
        return normalizedSlot;
    }

    return isDynamicSlotIndex(normalizedSlot) ? normalizedSlot : null;
}

export function collectOccupiedDynamicSlotIndexes(state, merchantList, excludeMerchantId, now) {
    const occupiedSlotIndexes = new Set();

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        if (!merchant || merchant.id === excludeMerchantId) {
            continue;
        }

        const merchantState = getMerchantState(state, merchant.id);
        const slotIndex = getAssignedSlotIndexForMerchant(state, merchant, merchantState, now);

        if (isDynamicSlotIndex(slotIndex)) {
            occupiedSlotIndexes.add(slotIndex);
        }
    }

    return occupiedSlotIndexes;
}

export function updateMerchantPresence(state, merchantList, now) {
    let changed = false;

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        if (!merchant || typeof merchant.updatePresenceState !== "function") {
            continue;
        }

        const merchantState = getMerchantState(state, merchant.id);
        if (!merchantState) {
            continue;
        }

        const occupiedSlotIndexes = collectOccupiedDynamicSlotIndexes(state, merchantList, merchant.id, now);
        const didChange = merchant.updatePresenceState({
            state,
            merchantState,
            now,
            dynamicSlotIndexes: DYNAMIC_SLOT_INDEXES,
            occupiedSlotIndexes
        });

        if (didChange) {
            changed = true;
        }
    }

    return changed;
}

export function buildSlotAssignments(state, merchantList, now) {
    const assignments = new Array(SHOP_SLOT_COUNT).fill(null);

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        const merchantState = merchant ? getMerchantState(state, merchant.id) : null;
        const slotIndex = getAssignedSlotIndexForMerchant(state, merchant, merchantState, now);

        if (slotIndex === null) {
            continue;
        }

        if (slotIndex === FIXED_MERCHANT1_SLOT_INDEX && merchant.id !== "merchant1") {
            continue;
        }

        if (slotIndex !== FIXED_MERCHANT1_SLOT_INDEX && !isDynamicSlotIndex(slotIndex)) {
            continue;
        }

        if (assignments[slotIndex]) {
            continue;
        }

        assignments[slotIndex] = {
            merchantId: merchant.id,
            merchant,
            merchantState
        };
    }

    return assignments;
}
