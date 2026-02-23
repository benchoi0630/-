// 파일 역할: 업그레이드 모달 DOM 렌더와 구매 버튼 클릭 후 UI 반영을 담당한다.
// 핵심 책임: 카드 생성, 메타 문구 표시, 구매 처리 콜백 연결을 일관된 방식으로 수행한다.
// 연동 범위: globalController에서 업그레이드 UI를 실제 화면에 그릴 때 사용하는 뷰 계층이다.

import { getUpgradeDefinition, getUpgradeDefinitionsBySection } from "./upgradeDefinitions.js";
import { purchaseUpgradeById } from "./upgradeActions.js";

function clearNode(node) {
    if (node) {
        node.textContent = "";
    }
}

function createMetaNode(text) {
    const meta = document.createElement("p");
    meta.className = "message-text upgrade-card-meta";
    meta.textContent = text;
    return meta;
}

function createUpgradeButton(definition, currentState) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade-action";
    button.dataset.upgradeId = definition.id;

    const label = document.createElement("span");
    label.textContent = definition.label;

    const badge = document.createElement("span");
    badge.className = "price-badge";

    const cost = definition.getCost(currentState);
    const purchased = definition.isPurchased(currentState) === true;
    const canAfford = Number.isFinite(cost) && currentState.currency.shells >= cost;

    if (purchased) {
        badge.textContent = "✓";
        button.disabled = true;
        button.classList.add("upgrade-action-complete");
    } else {
        badge.textContent = String(cost);
        button.disabled = !canAfford;
    }

    button.appendChild(label);
    button.appendChild(badge);

    return button;
}

function renderSectionToContainer(sectionId, currentState, container) {
    if (!container) {
        return;
    }

    clearNode(container);
    const definitions = getUpgradeDefinitionsBySection(sectionId).filter((definition) => definition.isVisible(currentState));

    for (let i = 0; i < definitions.length; i += 1) {
        const definition = definitions[i];
        const card = document.createElement("section");
        card.className = "upgrade-card";
        card.appendChild(createUpgradeButton(definition, currentState));
        card.appendChild(createMetaNode(definition.getMetaText(currentState)));
        container.appendChild(card);
    }
}

// 이 함수는 업그레이드 모달의 가격과 해금 표시 상태를 데이터 정의 기반으로 렌더링한다.
export function renderUpgradeModalState(elements, currentState) {
    renderSectionToContainer("hardware", currentState, elements.hardwareUpgradeList);
    renderSectionToContainer("software", currentState, elements.softwareUpgradeList);
}

// 이 함수는 업그레이드 아이디를 받아 구매 처리와 공통 후속 렌더를 수행한다.
export function processUpgradePurchase(options) {
    const definition = getUpgradeDefinition(options.upgradeId);
    if (!definition) {
        options.setUpgradeMessageFn("Unknown upgrade.");
        return;
    }

    const result = purchaseUpgradeById(options.currentState, options.applyProgressionFn, definition.id);
    if (!result.ok) {
        options.setUpgradeMessageFn(result.message);
        return;
    }

    options.saveStateFn();
    options.rerenderFn();

    if (result.progressionMessages.length > 0) {
        options.showGlobalMessageFn(result.progressionMessages[0]);
        options.setUpgradeMessageFn(result.progressionMessages[0]);
        return;
    }

    options.setUpgradeMessageFn(result.message);
}
