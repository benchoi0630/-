// 파일 역할: 상인 정의 목록과 id 기반 레지스트리를 구성하는 인덱스 모듈이다.
// 핵심 책임: 초기 merchant 상태 생성/정규화 헬퍼를 제공해 저장 데이터 형태를 통일한다.
// 연동 범위: 상점 presence·거래 로직이 참조하는 상인 메타 진입점을 제공한다.

import merchant1 from "./merchant1.js";
import merchant2 from "./merchant2.js";
import merchant3 from "./merchant3.js";
import merchant4 from "./merchant4.js";

export const merchantList = [merchant1, merchant2, merchant3, merchant4];

export const merchantRegistry = merchantList.reduce((acc, merchant) => {
    acc[merchant.id] = merchant;
    return acc;
}, {});

function createDefaultMerchantState(id) {
    const merchant = merchantRegistry[id];
    const index = merchantList.findIndex((entry) => entry.id === id);
    const unlocked = index === 0;
    const baseState = {
        id,
        salesCount: 0,
        level: 1,
        unlocked
    };

    if (merchant && typeof merchant.createDefaultState === "function") {
        return merchant.createDefaultState(baseState);
    }

    return baseState;
}

export function createDefaultMerchantsState() {
    const defaults = {};

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        defaults[merchant.id] = createDefaultMerchantState(merchant.id);
    }

    return defaults;
}

export function normalizeMerchantsState(rawMerchants) {
    const safeMerchants = rawMerchants && typeof rawMerchants === "object" ? rawMerchants : {};
    const normalized = {};

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        const fallback = createDefaultMerchantState(merchant.id);
        const raw = safeMerchants[merchant.id] && typeof safeMerchants[merchant.id] === "object" ? safeMerchants[merchant.id] : {};

        let normalizedState = {
            ...fallback,
            id: fallback.id,
            salesCount: Number.isFinite(raw.salesCount) ? Math.max(0, Math.round(raw.salesCount)) : fallback.salesCount,
            level: Number.isFinite(raw.level) ? Math.max(1, Math.round(raw.level)) : fallback.level,
            unlocked: typeof raw.unlocked === "boolean" ? raw.unlocked : fallback.unlocked
        };

        if (typeof merchant.normalizeState === "function") {
            normalizedState = merchant.normalizeState(normalizedState, raw, fallback);
        }

        normalized[merchant.id] = normalizedState;
    }

    if (normalized.merchant1) {
        normalized.merchant1.unlocked = true;
    }

    return normalized;
}
