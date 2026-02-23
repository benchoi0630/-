// 파일 역할: 업그레이드 레벨에 따른 비용 계산 공식을 제공하는 유틸이다.
// 핵심 책임: 기본 비용과 레벨을 입력받아 구매 비용을 일관된 방식으로 산출한다.
// 연동 범위: 업그레이드 UI/액션 로직의 공통 계산 소스로 사용된다.

// 이 파일은 업그레이드 가격 계산 공용 수식을 제공한다.
export function getUpgradeCost(baseCost, level) {
    return Math.ceil(baseCost * (1.22 ** level));
}
