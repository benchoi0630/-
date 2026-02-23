// 파일 역할: 창고 아이템을 모드별(no_stack/유사볼륨/타입)로 그룹화하는 로직을 제공한다.
// 핵심 책임: 스택 모드 버튼 생성·순환·라벨 렌더와 그룹 메타 생성 알고리즘을 담당한다.
// 연동 범위: warehouseIndex가 화면 모드에 따라 호출하는 정렬/집계 계층이다.

import { getMarimoType, getMarimoVolume } from "../../utils/marimoData.js";

// 이 섹션은 창고 스택 모드 순서와 표시 라벨을 정의한다.
const STACK_MODE_ORDER = ["no_stack", "by_similar_volume", "by_type"];
const STACK_MODE_LABEL = {
    no_stack: "no stack",
    by_similar_volume: "by similar volume",
    by_type: "by type"
};
const SIMILAR_VOLUME_TOLERANCE = 0.25;

/** 이 함수는 상태에서 유효한 창고 스택 모드를 반환한다. */
export function getCurrentStackMode(currentState) {
    if (!currentState.warehouseView || typeof currentState.warehouseView !== "object") {
        currentState.warehouseView = { stackMode: "no_stack" };
    }

    const mode = currentState.warehouseView.stackMode;
    if (!STACK_MODE_ORDER.includes(mode)) {
        currentState.warehouseView.stackMode = "no_stack";
    }

    return currentState.warehouseView.stackMode;
}

/** 이 함수는 창고 페이지에 스택 모드 버튼이 없으면 생성해서 반환한다. */
export function ensureStackModeButton(elements) {
    if (elements.stackModeBtn) {
        return elements.stackModeBtn;
    }

    if (!elements.warehousePageContent) {
        return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.id = "warehouseStackModeBtn";

    const anchor = elements.warehouseEmptyText || elements.warehouseGrid;
    if (anchor) {
        elements.warehousePageContent.insertBefore(button, anchor);
    } else {
        elements.warehousePageContent.prepend(button);
    }

    return button;
}

/** 이 함수는 현재 스택 모드에 맞춰 버튼 라벨을 렌더링한다. */
export function renderStackModeButton(elements, currentState) {
    const button = ensureStackModeButton(elements);
    if (!button) {
        return;
    }

    const mode = getCurrentStackMode(currentState);
    button.textContent = `Storage mode: ${STACK_MODE_LABEL[mode]}`;
}

/** 이 함수는 창고 스택 모드를 다음 단계로 순환시켜 반환한다. */
export function cycleStackMode(currentState) {
    const currentMode = getCurrentStackMode(currentState);
    const currentIndex = STACK_MODE_ORDER.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % STACK_MODE_ORDER.length;
    currentState.warehouseView.stackMode = STACK_MODE_ORDER[nextIndex];
    return currentState.warehouseView.stackMode;
}

/** 이 함수는 스택 모드에 맞는 창고 렌더러를 실행하고 현재 모드를 반환한다. */
export function renderWarehouseByMode(options) {
    const mode = getCurrentStackMode(options.currentState);

    if (mode === "by_similar_volume") {
        renderBySimilarVolumeMode(options);
        return mode;
    }

    if (mode === "by_type") {
        renderByTypeMode(options);
        return mode;
    }

    renderNoStackMode(options);
    return mode;
}

// 이 함수는 스택 없이 창고 아이템을 원본 배열 기준으로 렌더링한다.
function renderNoStackMode(options) {
    for (let i = options.currentState.warehouse.length - 1; i >= 0; i -= 1) {
        const item = options.currentState.warehouse[i];
        const volume = getMarimoVolume(item);
        const card = options.createWarehouseCard(`Vol: ${volume.toFixed(2)}`, undefined, () => {
            options.onNoStackItemClick(item.id);
        }, item);
        card.dataset.warehouseItemId = item.id;
        card.dataset.warehouseCardKind = "single-item";
        options.elements.warehouseGrid.appendChild(card);
    }
}

// 이 함수는 볼륨 유사도 스택 모드를 카드 목록으로 렌더링한다.
function renderBySimilarVolumeMode(options) {
    const stacks = buildSimilarVolumeStacks(options.currentState);

    for (let i = 0; i < stacks.length; i += 1) {
        const stack = stacks[i];
        const sampleMarimo = {
            id: `stack-sim-${stack.stackKey}`,
            volume: stack.stackRepresentativeVolume,
            type: stack.type
        };

        const card = options.createWarehouseCard(`Vol: ~${stack.stackRepresentativeVolume.toFixed(2)}`, stack.count, () => {
            options.onStackedItemClick({
                stackKey: stack.stackKey,
                stackAllItemIds: stack.stackAllItemIds,
                stackRepresentativeVolume: stack.stackRepresentativeVolume
            });
        }, sampleMarimo);
        options.elements.warehouseGrid.appendChild(card);
    }
}

// 이 함수는 타입 스택 모드를 카드 목록으로 렌더링한다.
function renderByTypeMode(options) {
    const stacks = buildTypeStacks(options.currentState);

    for (let i = 0; i < stacks.length; i += 1) {
        const stack = stacks[i];
        const sampleMarimo = {
            id: `stack-type-${stack.type}`,
            volume: stack.stackRepresentativeVolume,
            type: stack.type
        };

        const card = options.createWarehouseCard(`Type: ${stack.type}`, stack.count, () => {
            options.onStackedItemClick({
                stackKey: stack.stackKey,
                stackAllItemIds: stack.stackAllItemIds,
                stackRepresentativeVolume: stack.stackRepresentativeVolume
            });
        }, sampleMarimo);
        options.elements.warehouseGrid.appendChild(card);
    }
}

// 이 함수는 볼륨 유사도 기준 스택을 정렬 순서대로 생성한다.
function buildSimilarVolumeStacks(currentState) {
    const sortedItems = [...currentState.warehouse].sort((a, b) => {
        const volumeDiff = getMarimoVolume(a) - getMarimoVolume(b);
        if (volumeDiff !== 0) {
            return volumeDiff;
        }

        const typeDiff = getMarimoType(a).localeCompare(getMarimoType(b));
        if (typeDiff !== 0) {
            return typeDiff;
        }

        const createdAtA = typeof a.createdAt === "string" ? a.createdAt : "";
        const createdAtB = typeof b.createdAt === "string" ? b.createdAt : "";
        const createdAtDiff = createdAtA.localeCompare(createdAtB);
        if (createdAtDiff !== 0) {
            return createdAtDiff;
        }

        const idA = typeof a.id === "string" ? a.id : "";
        const idB = typeof b.id === "string" ? b.id : "";
        return idA.localeCompare(idB);
    });

    const stacks = [];

    for (let i = 0; i < sortedItems.length; i += 1) {
        const item = sortedItems[i];
        const itemVolume = getMarimoVolume(item);
        const itemType = getMarimoType(item);
        const lastStack = stacks[stacks.length - 1];
        const canStackWithPrevious = Boolean(
            lastStack
            && itemType === "normal"
            && lastStack.type === "normal"
            && Math.abs(itemVolume - lastStack.anchorVolume) <= SIMILAR_VOLUME_TOLERANCE
        );

        if (canStackWithPrevious) {
            lastStack.count += 1;
            lastStack.totalVolume += itemVolume;
            lastStack.stackAllItemIds.push(item.id);
            continue;
        }

        stacks.push({
            stackKey: `similar-${item.id}`,
            type: itemType,
            anchorVolume: itemVolume,
            totalVolume: itemVolume,
            count: 1,
            stackAllItemIds: [item.id]
        });
    }

    return stacks.map((stack) => ({
        stackKey: stack.stackKey,
        stackAllItemIds: [...stack.stackAllItemIds],
        stackRepresentativeVolume: stack.totalVolume / stack.count,
        count: stack.count,
        type: stack.type
    }));
}

// 이 함수는 타입 문자열 기준으로 창고 아이템을 그룹화한다.
function buildTypeStacks(currentState) {
    const typeMap = new Map();

    for (let i = 0; i < currentState.warehouse.length; i += 1) {
        const item = currentState.warehouse[i];
        const type = getMarimoType(item);
        const volume = getMarimoVolume(item);

        if (!typeMap.has(type)) {
            typeMap.set(type, {
                stackKey: `type-${type}`,
                type,
                totalVolume: 0,
                count: 0,
                stackAllItemIds: []
            });
        }

        const entry = typeMap.get(type);
        entry.totalVolume += volume;
        entry.count += 1;
        entry.stackAllItemIds.push(item.id);
    }

    return [...typeMap.values()]
        .sort((a, b) => a.type.localeCompare(b.type))
        .map((entry) => ({
            stackKey: entry.stackKey,
            stackAllItemIds: [...entry.stackAllItemIds],
            stackRepresentativeVolume: entry.count > 0 ? entry.totalVolume / entry.count : 0,
            count: entry.count,
            type: entry.type
        }));
}
