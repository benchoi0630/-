// 파일 역할: merchant3의 확률 등장과 동적 슬롯 점유 규칙, 오퍼/보상 정의를 담당한다.
// 핵심 책임: 방문 주기·판매 횟수·쿨다운 상태 전이를 merchant 메서드로 캡슐화한다.
// 연동 범위: 상점 갱신 루프에서 merchant3 개별 행동을 결정하는 소스다.

import { normalizeOptionalOfferSpec } from "./merchantOffer.js";

// 이 파일은 동적 슬롯에 등장하는 merchant3 상태/등장 규칙을 정의한다.
const MERCHANT3_DEFAULT_MAX_SALES_PER_VISIT = 2;
const MERCHANT3_DEFAULT_SPAWN_CHANCE = 0.24;
const MERCHANT3_DEFAULT_SPAWN_CHECK_INTERVAL_MS = 12000;
const MERCHANT3_DEFAULT_COOLDOWN_MS = 42000;
const DEFAULT_DYNAMIC_SLOT_INDEXES = [1, 2, 3];

function isValidDynamicSlotIndex(slotIndex, dynamicSlotIndexes = DEFAULT_DYNAMIC_SLOT_INDEXES) {
    return dynamicSlotIndexes.includes(slotIndex);
}

function pickRandomItem(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * list.length);
    return list[randomIndex];
}

function getMerchantLevel(merchantState) {
    return Number.isFinite(merchantState?.level) ? Math.max(1, Math.round(merchantState.level)) : 1;
}

function buildMerchant3Offer(merchantState) {
    const level = getMerchantLevel(merchantState);
    const offerPool = [
        {
            mode: "all_of",
            rules: [{ kind: "predicate", count: 1, types: ["normal"], minVolume: 3 }]
        },
        {
            mode: "any_of",
            rules: [
                { kind: "volume_exact", count: 1, exactVolume: 3, tolerance: 0.11 },
                { kind: "volume_min", count: 1, minVolume: 3.7 }
            ]
        },
        {
            mode: "all_of",
            rules: [
                { kind: "volume_min", count: 1, minVolume: 2 },
                { kind: "volume_min", count: 1, minVolume: 1.5 }
            ]
        }
    ];

    if (level >= 4) {
        offerPool.push({
            mode: "all_of",
            rules: [{ kind: "predicate", count: 2, types: ["normal"], minVolume: 2.6 }]
        });
    }

    return pickRandomItem(offerPool) || offerPool[0];
}

const merchant3 = {
    id: "merchant3",

    createDefaultState(baseState) {
        return {
            ...baseState,
            unlocked: false,
            activeOffer: null,
            active: false,
            slotIndex: null,
            cooldownUntil: 0,
            visitSales: 0,
            maxSalesPerVisit: MERCHANT3_DEFAULT_MAX_SALES_PER_VISIT,
            spawnChance: MERCHANT3_DEFAULT_SPAWN_CHANCE,
            spawnCheckIntervalMs: MERCHANT3_DEFAULT_SPAWN_CHECK_INTERVAL_MS,
            nextSpawnCheckAt: 0
        };
    },

    normalizeState(currentState, rawState, fallbackState) {
        const raw = rawState && typeof rawState === "object" ? rawState : {};
        const normalized = {
            ...currentState,
            active: typeof raw.active === "boolean" ? raw.active : fallbackState.active,
            slotIndex: Number.isFinite(raw.slotIndex) ? Math.round(raw.slotIndex) : null,
            cooldownUntil: Number.isFinite(raw.cooldownUntil) ? Math.max(0, Math.round(raw.cooldownUntil)) : fallbackState.cooldownUntil,
            visitSales: Number.isFinite(raw.visitSales) ? Math.max(0, Math.round(raw.visitSales)) : fallbackState.visitSales,
            maxSalesPerVisit: Number.isFinite(raw.maxSalesPerVisit) ? Math.max(1, Math.round(raw.maxSalesPerVisit)) : fallbackState.maxSalesPerVisit,
            spawnChance: Number.isFinite(raw.spawnChance) ? Math.max(0, Math.min(1, raw.spawnChance)) : fallbackState.spawnChance,
            spawnCheckIntervalMs: Number.isFinite(raw.spawnCheckIntervalMs) ? Math.max(1, Math.round(raw.spawnCheckIntervalMs)) : fallbackState.spawnCheckIntervalMs,
            nextSpawnCheckAt: Number.isFinite(raw.nextSpawnCheckAt) ? Math.max(0, Math.round(raw.nextSpawnCheckAt)) : fallbackState.nextSpawnCheckAt,
            activeOffer: normalizeOptionalOfferSpec(raw.activeOffer, fallbackState.activeOffer)
        };

        if (normalized.active !== true || !isValidDynamicSlotIndex(normalized.slotIndex)) {
            normalized.active = false;
            normalized.slotIndex = null;
            normalized.activeOffer = null;
        }

        if (normalized.unlocked !== true) {
            normalized.active = false;
            normalized.slotIndex = null;
            normalized.visitSales = 0;
            normalized.activeOffer = null;
        }

        return normalized;
    },

    getAssignedSlotIndex(state, merchantState, now) {
        void state;
        void now;

        if (merchantState?.unlocked !== true || merchantState?.active !== true) {
            return null;
        }

        return isValidDynamicSlotIndex(merchantState.slotIndex) ? merchantState.slotIndex : null;
    },

    updatePresenceState(params) {
        const merchantState = params?.merchantState;
        const now = Number.isFinite(params?.now) ? params.now : Date.now();
        const dynamicSlotIndexes = Array.isArray(params?.dynamicSlotIndexes) ? params.dynamicSlotIndexes : DEFAULT_DYNAMIC_SLOT_INDEXES;
        const occupiedSlotIndexes = params?.occupiedSlotIndexes instanceof Set ? params.occupiedSlotIndexes : new Set();

        if (!merchantState || typeof merchantState !== "object") {
            return false;
        }

        let changed = false;

        if (merchantState.unlocked !== true) {
            if (merchantState.active !== false) {
                merchantState.active = false;
                changed = true;
            }

            if (merchantState.slotIndex !== null) {
                merchantState.slotIndex = null;
                changed = true;
            }

            if (merchantState.visitSales !== 0) {
                merchantState.visitSales = 0;
                changed = true;
            }

            if (merchantState.activeOffer !== null) {
                merchantState.activeOffer = null;
                changed = true;
            }

            return changed;
        }

        if (merchantState.active === true) {
            if (!isValidDynamicSlotIndex(merchantState.slotIndex, dynamicSlotIndexes) || occupiedSlotIndexes.has(merchantState.slotIndex)) {
                merchantState.active = false;
                merchantState.slotIndex = null;
                merchantState.activeOffer = null;
                changed = true;
            }

            return changed;
        }

        if (now < merchantState.cooldownUntil) {
            return changed;
        }

        if (now < merchantState.nextSpawnCheckAt) {
            return changed;
        }

        const availableSlots = dynamicSlotIndexes.filter((slotIndex) => !occupiedSlotIndexes.has(slotIndex));

        if (availableSlots.length > 0 && Math.random() < merchantState.spawnChance) {
            merchantState.active = true;
            merchantState.slotIndex = pickRandomItem(availableSlots);
            merchantState.visitSales = 0;
            merchantState.activeOffer = null;
            changed = true;
        }

        const nextSpawnCheckAt = now + merchantState.spawnCheckIntervalMs;
        if (merchantState.nextSpawnCheckAt !== nextSpawnCheckAt) {
            merchantState.nextSpawnCheckAt = nextSpawnCheckAt;
            changed = true;
        }

        return changed;
    },

    canAttemptPurchase(state, merchantState, now) {
        void state;
        void now;

        return Boolean(
            merchantState
            && merchantState.unlocked === true
            && merchantState.active === true
            && isValidDynamicSlotIndex(merchantState.slotIndex)
        );
    },

    getOfferSpec(state, merchantState, now, reason) {
        void state;
        void now;
        void reason;
        return buildMerchant3Offer(merchantState);
    },

    beforeProgressionOnSale(state, merchantState, now) {
        void state;
        void now;

        merchantState.visitSales = Math.max(0, Math.round(merchantState.visitSales)) + 1;
        return true;
    },

    afterProgressionOnSale(state, merchantState, now) {
        void state;

        const safeNow = Number.isFinite(now) ? now : Date.now();
        if (merchantState.visitSales < merchantState.maxSalesPerVisit) {
            return false;
        }

        merchantState.active = false;
        merchantState.slotIndex = null;
        merchantState.cooldownUntil = safeNow + MERCHANT3_DEFAULT_COOLDOWN_MS;
        merchantState.nextSpawnCheckAt = merchantState.cooldownUntil + merchantState.spawnCheckIntervalMs;
        merchantState.activeOffer = null;
        return true;
    },

    getRequirements(state, merchantState) {
        void state;
        void merchantState;

        return {
            volume: 3,
            count: 1
        };
    },

    getRewards(state, merchantState) {
        void state;
        void merchantState;

        return {
            shells: 6
        };
    },

    getAppearSpec(state, merchantState, now) {
        void state;
        void now;

        return {
            visible: merchantState?.unlocked === true && merchantState?.active === true,
            priority: 3
        };
    }
};

export default merchant3;
