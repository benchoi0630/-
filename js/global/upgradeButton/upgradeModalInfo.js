// 파일 역할: 업그레이드 모달 상단 안내 문구를 섹션별로 관리한다.
// 핵심 책임: 하드웨어/소프트웨어/시설 모달의 info 문구를 일관되게 채운다.
// 연동 범위: globalView가 헤더 렌더 시 모달 안내 텍스트를 갱신한다.

const UPGRADE_MODAL_INFO_TEXT = {
    hardware: "Tune growth conditions and automation speed.",
    software: "Unlock growth controls and split utilities.",
    facility: "Facility upgrades are under construction."
};

// 이 함수는 업그레이드 모달 안내 문구를 DOM에 반영한다.
export function renderUpgradeModalInfo(elements = {}) {
    if (elements.hardwareUpgradeInfo) {
        elements.hardwareUpgradeInfo.textContent = UPGRADE_MODAL_INFO_TEXT.hardware;
    }

    if (elements.softwareUpgradeInfo) {
        elements.softwareUpgradeInfo.textContent = UPGRADE_MODAL_INFO_TEXT.software;
    }

    if (elements.facilityUpgradeInfo) {
        elements.facilityUpgradeInfo.textContent = UPGRADE_MODAL_INFO_TEXT.facility;
    }
}
