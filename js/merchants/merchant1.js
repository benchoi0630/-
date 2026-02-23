// 파일 역할: merchant1의 등장 규칙, 오퍼 스펙, 보상 정의를 담은 상인 정의 모듈이다.
// 핵심 책임: 고정 슬롯(0번) 배치와 방문 상태 갱신 로직을 상인 객체 메서드로 제공한다.
// 연동 범위: 상점 시스템이 참조하는 merchant1 고유 행동 계약을 구현한다.

import { normalizeOptionalOfferSpec } from "./merchantOffer.js";

// 이 파일은 향후 상인 스케줄러 확장 시 공통 표시 스펙 훅을 재사용하기 위해 구조를 유지한다.
const FIXED_SHOP_SLOT_INDEX = 0;

function getMerchantLevel(merchantState) {
    return Number.isFinite(merchantState?.level) ? Math.max(1, Math.round(merchantState.level)) : 1;
}

function buildMerchant1Offer(merchantState) {
    const level = getMerchantLevel(merchantState);

    if (level <= 2) {
        return {
            mode: "all_of",
            rules: [{ kind: "any", count: 1 }]
        };
    }

    const roll = Math.random();
    if (roll < 0.55) {
        return {
            mode: "all_of",
            rules: [{ kind: "any", count: 1 }]
        };
    }

    if (roll < 0.82) {
        return {
            mode: "all_of",
            rules: [{ kind: "volume_min", count: 1, minVolume: 1.2 }]
        };
    }

    return {
        mode: "all_of",
        rules: [{ kind: "volume_exact", count: 1, exactVolume: 1, tolerance: 0.2 }]
    };
}

const merchant1 = {
    id: "merchant1",

    createDefaultState(baseState) {
        return {
            ...baseState,
            unlocked: true,
            activeOffer: null
        };
    },

    normalizeState(currentState, rawState, fallbackState) {
        const raw = rawState && typeof rawState === "object" ? rawState : {};
        return {
            ...currentState,
            activeOffer: normalizeOptionalOfferSpec(raw.activeOffer, fallbackState.activeOffer)
        };
    },

    getAssignedSlotIndex(state, merchantState, now) {
        void state;
        void merchantState;
        void now;
        return FIXED_SHOP_SLOT_INDEX;
    },

    canAttemptPurchase(state, merchantState, now) {
        void state;
        void now;
        return merchantState?.unlocked === true;
    },

    getOfferSpec(state, merchantState, now, reason) {
        void state;
        void now;
        void reason;
        return buildMerchant1Offer(merchantState);
    },

    getRequirements(state, merchantState) {
        void state;
        void merchantState;

        return {
            volume: 1,
            count: 1
        };
    },

    getRewards(state, merchantState) {
        void state;
        void merchantState;

        return {
            shells: 1
        };
    },

    getAppearSpec(state, merchantState, now) {
        void state;
        void merchantState;
        void now;

        return {
            visible: true,
            priority: 1
        };
    }
};

export default merchant1;
