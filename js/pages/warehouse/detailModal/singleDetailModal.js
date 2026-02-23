// 파일 역할: 단일 마리모 상세보기 모달 바디를 렌더하는 뷰 헬퍼다.
// 핵심 책임: 마리모 미리보기와 메타 정보(볼륨/타입/생성시간) 표시 마크업을 구성한다.
// 연동 범위: detailModal 컨트롤러가 모달 모드에 따라 호출하는 렌더 단위다.

import { getMarimoDiameter, getMarimoType, getMarimoVolume } from "../../../utils/marimoData.js";
import { renderMarimoVisual } from "../../../ui/marimoRender.js";

/** 이 함수는 단일 마리모 상세 본문을 렌더링하고 액션 버튼 노출을 조정한다. */
export function renderSingleDetail(options) {
    const detailBody = options?.detailBody;
    const detailSendToMainBtn = options?.detailSendToMainBtn;
    const selectedItem = options?.selectedItem;

    if (!detailBody) {
        return;
    }

    detailBody.textContent = "";
    detailBody.classList.remove("single-detail-body");

    if (!selectedItem) {
        const missingText = document.createElement("div");
        missingText.textContent = "Could not find the selected marimo.";
        detailBody.appendChild(missingText);

        if (detailSendToMainBtn) {
            detailSendToMainBtn.classList.add("hidden");
        }
        return;
    }

    detailBody.classList.add("single-detail-body");

    const previewWrap = document.createElement("div");
    previewWrap.className = "single-detail-preview";

    const marimoPreview = document.createElement("div");
    marimoPreview.className = "marimo single-detail-marimo";
    renderMarimoVisual(marimoPreview, { marimo: selectedItem, showFace: true });
    previewWrap.appendChild(marimoPreview);
    detailBody.appendChild(previewWrap);

    const metaWrap = document.createElement("div");
    metaWrap.className = "single-detail-meta";

    const lines = [
        `volume: ${getMarimoVolume(selectedItem).toFixed(2)}`,
        `type: ${getMarimoType(selectedItem)}`,
        `createdAt: ${typeof selectedItem.createdAt === "string" ? selectedItem.createdAt : ""}`,
        `diameter: ${getMarimoDiameter(selectedItem).toFixed(2)}`
    ];

    for (let i = 0; i < lines.length; i += 1) {
        const line = document.createElement("div");
        line.className = "single-detail-line";
        line.textContent = lines[i];
        metaWrap.appendChild(line);
    }
    detailBody.appendChild(metaWrap);

    if (detailSendToMainBtn) {
        detailSendToMainBtn.classList.remove("hidden");
    }
}
