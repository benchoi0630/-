// 파일 역할: 진행도 트랙 정의 데이터(레벨 조건/효과/메시지)를 선언하는 테이블 파일이다.
// 핵심 책임: progressionLogic이 참조할 정적 레벨 스키마를 트랙별로 제공한다.
// 연동 범위: 해금 규칙을 코드 로직과 분리해 데이터 중심으로 유지보수 가능하게 만든다.

// 이 파일은 트랙별 진행 조건과 상태 변화 규칙을 표 형태로 정의한다.
// 이 테이블은 feature, merchant, event, split 네 가지 트랙을 관리한다.
// 각 레벨 객체는 level, condition, goForward, rollback, message 다섯 키를 반드시 가진다.

export const progressionTrackDefs = {
    feature: {
        levels: [
            // 창고 아이템이 1개 이상이면 feature 1단계로 진행해 창고 이동 기능을 연다.
            {
                level: 1,
                condition: (currentState) => Boolean(currentState.warehouse && currentState.warehouse.length > 0),
                goForward: (currentState) => {
                    void currentState;
                },
                rollback: (currentState) => {
                    void currentState;
                },
                message: "Send to warehouse unlocked."
            }
        ]
    },
    merchant: {
        levels: [
            // merchant1 판매 횟수가 10회 이상이면 merchant2 상인을 해금한다.
            {
                level: 1,
                condition: (currentState) => {
                    const merchant1Sales = Number.isFinite(currentState.merchants.merchant1?.salesCount) ? currentState.merchants.merchant1.salesCount : 0;
                    return Boolean(currentState.merchants.merchant2 && merchant1Sales >= 10 && currentState.merchants.merchant2.unlocked === false);
                },
                goForward: (currentState) => {
                    currentState.merchants.merchant2.unlocked = true;
                    currentState.merchants.merchant2.activeOffer = null;
                },
                rollback: (currentState) => {
                    currentState.merchants.merchant2.unlocked = false;
                    currentState.merchants.merchant2.active = false;
                    currentState.merchants.merchant2.slotIndex = null;
                    currentState.merchants.merchant2.visitSales = 0;
                    currentState.merchants.merchant2.activeOffer = null;
                    const merchant1Sales = Number.isFinite(currentState.merchants.merchant1?.salesCount) ? currentState.merchants.merchant1.salesCount : 0;
                    currentState.merchants.merchant1.salesCount = Math.min(merchant1Sales, 9);
                },
                message: "Merchant 2 unlocked!"
            },
            // merchant2 판매 횟수가 8회 이상이면 merchant3 상인을 해금한다.
            {
                level: 2,
                condition: (currentState) => {
                    const merchant2Sales = Number.isFinite(currentState.merchants.merchant2?.salesCount) ? currentState.merchants.merchant2.salesCount : 0;
                    return Boolean(currentState.merchants.merchant3 && merchant2Sales >= 8 && currentState.merchants.merchant3.unlocked === false);
                },
                goForward: (currentState) => {
                    currentState.merchants.merchant3.unlocked = true;
                    currentState.merchants.merchant3.activeOffer = null;
                },
                rollback: (currentState) => {
                    currentState.merchants.merchant3.unlocked = false;
                    currentState.merchants.merchant3.active = false;
                    currentState.merchants.merchant3.slotIndex = null;
                    currentState.merchants.merchant3.visitSales = 0;
                    currentState.merchants.merchant3.activeOffer = null;
                    const merchant2Sales = Number.isFinite(currentState.merchants.merchant2?.salesCount) ? currentState.merchants.merchant2.salesCount : 0;
                    currentState.merchants.merchant2.salesCount = Math.min(merchant2Sales, 7);
                },
                message: "Merchant 3 unlocked!"
            },
            // merchant3 판매 횟수가 6회 이상이면 merchant4 상인을 해금한다.
            {
                level: 3,
                condition: (currentState) => {
                    const merchant3Sales = Number.isFinite(currentState.merchants.merchant3?.salesCount) ? currentState.merchants.merchant3.salesCount : 0;
                    return Boolean(currentState.merchants.merchant4 && merchant3Sales >= 6 && currentState.merchants.merchant4.unlocked === false);
                },
                goForward: (currentState) => {
                    currentState.merchants.merchant4.unlocked = true;
                    currentState.merchants.merchant4.activeOffer = null;
                },
                rollback: (currentState) => {
                    currentState.merchants.merchant4.unlocked = false;
                    currentState.merchants.merchant4.active = false;
                    currentState.merchants.merchant4.slotIndex = null;
                    currentState.merchants.merchant4.visitSales = 0;
                    currentState.merchants.merchant4.activeOffer = null;
                    const merchant3Sales = Number.isFinite(currentState.merchants.merchant3?.salesCount) ? currentState.merchants.merchant3.salesCount : 0;
                    currentState.merchants.merchant3.salesCount = Math.min(merchant3Sales, 5);
                },
                message: "Merchant 4 unlocked!"
            }
        ]
    },
    event: {
        levels: []
    },
    split: {
        levels: [
            // split 업그레이드 구매가 확인되면 split 단계를 올리고 분할 최대치를 2로 적용한다.
            {
                level: 1,
                condition: (currentState) => Boolean(Number.isFinite(currentState.upgrades?.splitUpgrade) && currentState.upgrades.splitUpgrade >= 1),
                goForward: (currentState) => {
                    currentState.upgrades.splitUpgrade = Math.max(1, Number.isFinite(currentState.upgrades.splitUpgrade) ? Math.round(currentState.upgrades.splitUpgrade) : 0);
                    currentState.split.maxVolume = 2;
                    currentState.split.currentVolume = Math.min(currentState.split.currentVolume, currentState.split.maxVolume);
                },
                rollback: (currentState) => {
                    currentState.upgrades.splitUpgrade = 0;
                    currentState.split.maxVolume = 1;
                    currentState.split.currentVolume = Math.max(1, Math.round(currentState.split.currentVolume));
                },
                message: "Split upgrade unlocked!"
            }
        ]
    }
};
