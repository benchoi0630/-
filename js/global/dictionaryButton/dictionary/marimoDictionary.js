// 파일 역할: 마리모 도감 카드 목록을 현재 상태 기준으로 렌더링한다.
// 핵심 책임: 발견 타입 집계와 잠금/해금 표시 규칙을 적용해 그리드 항목을 생성한다.
// 연동 범위: 도감 모달에서 마리모 수집 진행도를 시각화하는 뷰 모듈이다.

import { getMarimoType } from "../../../utils/marimoData.js";
import { renderMarimoVisual } from "../../../ui/marimoRender.js";

const KNOWN_MARIMO_TYPES = [
    { type: "normal", label: "Basic Marimo" },
    { type: "special", label: "Special Marimo" }
];

// 이 함수는 현재 상태에서 발견된 마리모 타입 집합을 계산한다.
function collectDiscoveredTypes(currentState) {
    const discovered = new Set();

    if (currentState?.marimo) {
        discovered.add(getMarimoType(currentState.marimo));
    }

    if (Array.isArray(currentState?.warehouse)) {
        for (let i = 0; i < currentState.warehouse.length; i += 1) {
            discovered.add(getMarimoType(currentState.warehouse[i]));
        }
    }

    return discovered;
}

// 이 함수는 기본 타입 목록과 발견 타입을 합쳐 도감 엔트리를 만든다.
function buildMarimoEntries(currentState) {
    const discoveredTypes = collectDiscoveredTypes(currentState);
    const knownTypeSet = new Set(KNOWN_MARIMO_TYPES.map((entry) => entry.type));
    const entries = [...KNOWN_MARIMO_TYPES];

    discoveredTypes.forEach((type) => {
        if (!knownTypeSet.has(type)) {
            entries.push({
                type,
                label: `${type} Marimo`
            });
        }
    });

    return { entries, discoveredTypes };
}

// 이 함수는 마리모 도감 그리드를 상태 기준으로 렌더링한다.
export function renderMarimoDictionary(container, currentState) {
    if (!container) {
        return;
    }

    container.textContent = "";
    const { entries, discoveredTypes } = buildMarimoEntries(currentState);

    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const isUnlocked = discoveredTypes.has(entry.type);

        const card = document.createElement("article");
        card.className = "dictionary-entry-card";
        card.classList.toggle("dictionary-entry-locked", !isUnlocked);

        const previewWrap = document.createElement("div");
        previewWrap.className = "dictionary-entry-preview";

        const marimoNode = document.createElement("div");
        marimoNode.className = "marimo";
        renderMarimoVisual(marimoNode, {
            marimo: {
                id: `dictionary-${entry.type}`,
                type: entry.type,
                volume: 1,
                createdAt: "dictionary"
            },
            showFace: true
        });
        previewWrap.appendChild(marimoNode);

        const label = document.createElement("div");
        label.className = "dictionary-entry-label";
        label.textContent = isUnlocked ? entry.label : "???";

        const status = document.createElement("div");
        status.className = "dictionary-entry-status";
        status.textContent = isUnlocked ? "Unlocked" : "Locked";

        card.appendChild(previewWrap);
        card.appendChild(label);
        card.appendChild(status);
        container.appendChild(card);
    }
}
