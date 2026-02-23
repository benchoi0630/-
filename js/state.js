// 파일 역할: 게임 전역 상태의 기본값과 정규화와 저장·복원 로직을 담당한다.
// 핵심 책임: 로컬 저장소 입출력과 legacy 필드 호환을 포함해 상태 스키마를 안정화한다.
// 연동 범위: 모든 페이지 모듈이 공유하는 단일 상태 객체와 저장 API를 제공한다.

import { createDefaultMerchantsState, normalizeMerchantsState } from "./merchants/merchantsIndex.js";

const STORAGE_KEY = "marimoGameState";
const MAX_WAREHOUSE_ITEMS = 600;
const MAX_PERSISTED_STATE_CHARS = 220000;
const MAX_LOADABLE_STATE_CHARS = 450000;

const defaultProgression = {
    feature: 0,
    merchant: 0,
    event: 0,
    split: 0
};

const defaultWarehouseView = {
    stackMode: "no_stack"
};

const defaultState = {
    mainSlotStatus: "occupied",
    maxMarimoVolume: 3,
    maxMarimoDiameter: 3,
    marimo: {
        id: "main-marimo",
        volume: 1.0,
        diameter: 1.0,
        stage: 1,
        type: "normal"
    },
    upgrades: {
        splitUpgrade: 0,
        fertilizerUpgrade: 0,
        maxDiameterUpgrade: 0,
        waterCurrentUpgrade: 0,
        algaeManagementUpgrade: 0
    },
    growth: {
        feeding: false,
        capVolume: 0,
        accumulatedNutrition: 0
    },
    environment: {
        waterCurrent: 0,
        algae: 0
    },
    split: {
        currentVolume: 1,
        maxVolume: 1,
        minMainVolumeAfterSplit: 1
    },
    currency: {
        shells: 0
    },
    merchants: createDefaultMerchantsState(),
    progression: {
        ...defaultProgression
    },
    warehouseView: {
        ...defaultWarehouseView
    },
    notifications: [],
    warehouse: []
};

function createDefaultProgression() {
    return {
        feature: defaultProgression.feature,
        merchant: defaultProgression.merchant,
        event: defaultProgression.event,
        split: defaultProgression.split
    };
}

function createDefaultWarehouseView() {
    return {
        stackMode: defaultWarehouseView.stackMode
    };
}

function createDefaultState() {
    return {
        mainSlotStatus: defaultState.mainSlotStatus,
        maxMarimoVolume: defaultState.maxMarimoVolume,
        maxMarimoDiameter: defaultState.maxMarimoDiameter,
        marimo: { ...defaultState.marimo },
        upgrades: { ...defaultState.upgrades },
        growth: { ...defaultState.growth },
        environment: { ...defaultState.environment },
        split: { ...defaultState.split },
        currency: { ...defaultState.currency },
        merchants: createDefaultMerchantsState(),
        progression: createDefaultProgression(),
        warehouseView: createDefaultWarehouseView(),
        notifications: [],
        warehouse: []
    };
}

function normalizeSplit(split) {
    const rawMax = Number.isFinite(split.maxVolume) ? split.maxVolume : defaultState.split.maxVolume;
    const rawCurrent = Number.isFinite(split.currentVolume) ? split.currentVolume : defaultState.split.currentVolume;
    const rawMinMainVolumeAfterSplit = Number.isFinite(split.minMainVolumeAfterSplit) ? split.minMainVolumeAfterSplit : defaultState.split.minMainVolumeAfterSplit;
    const maxVolume = Math.max(1, Math.min(2, Math.round(rawMax)));
    const minCurrent = maxVolume > 1 ? 0 : 1;
    const currentVolume = Math.max(minCurrent, Math.min(maxVolume, Math.round(rawCurrent)));
    const minMainVolumeAfterSplit = Math.max(0, rawMinMainVolumeAfterSplit);

    return {
        currentVolume,
        maxVolume,
        minMainVolumeAfterSplit
    };
}

function normalizeUpgradeLevel(value, fallback = 0) {
    if (!Number.isFinite(value)) {
        return fallback;
    }

    return Math.max(0, Math.round(value));
}

function normalizeUpgrades(upgrades) {
    const safeUpgrades = upgrades && typeof upgrades === "object" ? upgrades : {};

    return {
        splitUpgrade: normalizeUpgradeLevel(safeUpgrades.splitUpgrade, defaultState.upgrades.splitUpgrade),
        fertilizerUpgrade: normalizeUpgradeLevel(safeUpgrades.fertilizerUpgrade, defaultState.upgrades.fertilizerUpgrade),
        maxDiameterUpgrade: normalizeUpgradeLevel(safeUpgrades.maxDiameterUpgrade, defaultState.upgrades.maxDiameterUpgrade),
        waterCurrentUpgrade: normalizeUpgradeLevel(safeUpgrades.waterCurrentUpgrade, defaultState.upgrades.waterCurrentUpgrade),
        algaeManagementUpgrade: normalizeUpgradeLevel(safeUpgrades.algaeManagementUpgrade, defaultState.upgrades.algaeManagementUpgrade)
    };
}

function normalizeGrowth(growth) {
    const safeGrowth = growth && typeof growth === "object" ? growth : {};
    const legacyConsumedRollingDistance = Number.isFinite(safeGrowth.consumedRollingDistance)
        ? Math.max(0, safeGrowth.consumedRollingDistance)
        : defaultState.growth.accumulatedNutrition;

    return {
        feeding: safeGrowth.feeding === true,
        capVolume: Number.isFinite(safeGrowth.capVolume) ? Math.max(0, safeGrowth.capVolume) : defaultState.growth.capVolume,
        accumulatedNutrition: Number.isFinite(safeGrowth.accumulatedNutrition)
            ? Math.max(0, safeGrowth.accumulatedNutrition)
            : legacyConsumedRollingDistance
    };
}

function normalizeEnvironment(environment) {
    const safeEnvironment = environment && typeof environment === "object" ? environment : {};

    return {
        waterCurrent: Number.isFinite(safeEnvironment.waterCurrent) ? Math.max(0, safeEnvironment.waterCurrent) : defaultState.environment.waterCurrent,
        algae: Number.isFinite(safeEnvironment.algae) ? Math.max(0, safeEnvironment.algae) : defaultState.environment.algae
    };
}

function normalizeProgression(progression, legacyFlags) {
    const safeProgression = progression && typeof progression === "object" ? progression : {};
    const safeFlags = legacyFlags && typeof legacyFlags === "object" ? legacyFlags : {};
    const featureLevel = Number.isFinite(safeProgression.feature) ? Math.max(0, Math.round(safeProgression.feature)) : defaultProgression.feature;
    const merchantLevel = Number.isFinite(safeProgression.merchant) ? Math.max(0, Math.round(safeProgression.merchant)) : defaultProgression.merchant;
    const eventLevel = Number.isFinite(safeProgression.event) ? Math.max(0, Math.round(safeProgression.event)) : defaultProgression.event;
    let splitLevel = Number.isFinite(safeProgression.split) ? Math.max(0, Math.round(safeProgression.split)) : defaultProgression.split;

    if (safeFlags.biggerSplitPurchased === true) {
        splitLevel = Math.max(splitLevel, 1);
    }

    return {
        feature: featureLevel,
        merchant: merchantLevel,
        event: eventLevel,
        split: splitLevel
    };
}

function normalizeWarehouseView(warehouseView) {
    const safeWarehouseView = warehouseView && typeof warehouseView === "object" ? warehouseView : {};
    const rawStackMode = typeof safeWarehouseView.stackMode === "string" ? safeWarehouseView.stackMode : defaultWarehouseView.stackMode;
    const validStackMode = rawStackMode === "by_similar_volume" || rawStackMode === "by_type" || rawStackMode === "no_stack";

    return {
        stackMode: validStackMode ? rawStackMode : defaultWarehouseView.stackMode
    };
}

function normalizeNotifications(notifications) {
    if (!Array.isArray(notifications)) {
        return [];
    }

    return notifications
        .filter((message) => typeof message === "string")
        .slice(-20);
}

function normalizeWarehouseItem(item, fallbackId) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const normalizedItem = {
        id: typeof item.id === "string" ? item.id : fallbackId,
        volume: Number.isFinite(item.volume) ? Math.max(0, item.volume) : 1,
        type: typeof item.type === "string" ? item.type : "normal",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString()
    };

    if (Number.isFinite(item.diameter)) {
        normalizedItem.diameter = Math.max(0, item.diameter);
    }

    return normalizedItem;
}

function normalizeWarehouseItems(warehouse) {
    if (!Array.isArray(warehouse) || warehouse.length <= 0) {
        return [];
    }

    const tailItems = warehouse.slice(-MAX_WAREHOUSE_ITEMS);
    const normalized = [];

    for (let i = 0; i < tailItems.length; i += 1) {
        const normalizedItem = normalizeWarehouseItem(tailItems[i], `loaded-${i}`);
        if (normalizedItem) {
            normalized.push(normalizedItem);
        }
    }

    return normalized;
}

function trimStateToStorageBudget(nextState) {
    const safeState = nextState && typeof nextState === "object" ? nextState : createDefaultState();
    const budgetedState = {
        ...safeState,
        notifications: normalizeNotifications(safeState.notifications),
        warehouse: normalizeWarehouseItems(safeState.warehouse)
    };
    const initialWarehouseLength = budgetedState.warehouse.length;
    let serialized = JSON.stringify(budgetedState);

    while (serialized.length > MAX_PERSISTED_STATE_CHARS && budgetedState.warehouse.length > 0) {
        const removeCount = Math.max(1, Math.ceil(budgetedState.warehouse.length * 0.15));
        budgetedState.warehouse.splice(0, removeCount);
        serialized = JSON.stringify(budgetedState);
    }

    if (serialized.length > MAX_PERSISTED_STATE_CHARS) {
        budgetedState.notifications = [];
        budgetedState.warehouse = [];
        serialized = JSON.stringify(budgetedState);
    }

    return {
        state: budgetedState,
        serialized,
        wasTrimmed: budgetedState.warehouse.length !== initialWarehouseLength
    };
}

function mergeState(stored) {
    const safeStored = stored && typeof stored === "object" ? stored : {};
    const hasMarimoKey = Object.prototype.hasOwnProperty.call(safeStored, "marimo");
    const marimoValue = hasMarimoKey ? safeStored.marimo : undefined;
    const marimo = marimoValue && typeof marimoValue === "object" ? marimoValue : {};
    const upgrades = safeStored.upgrades && typeof safeStored.upgrades === "object" ? safeStored.upgrades : {};
    const growth = safeStored.growth && typeof safeStored.growth === "object" ? safeStored.growth : {};
    const environment = safeStored.environment && typeof safeStored.environment === "object" ? safeStored.environment : {};
    const split = safeStored.split && typeof safeStored.split === "object" ? safeStored.split : {};
    const currency = safeStored.currency && typeof safeStored.currency === "object" ? safeStored.currency : {};
    const rawWarehouse = Array.isArray(safeStored.warehouse) ? safeStored.warehouse : [];
    const normalizedMainSlotStatus = safeStored.mainSlotStatus === "empty" ? "empty" : "occupied";
    const normalizedMaxMarimoVolume = Number.isFinite(safeStored.maxMarimoVolume)
        ? Math.max(0.1, safeStored.maxMarimoVolume)
        : (Number.isFinite(safeStored.maxMarimoDiameter) ? Math.max(0.1, safeStored.maxMarimoDiameter) : defaultState.maxMarimoVolume);

    const normalizedMarimo = {
        id: typeof marimo.id === "string" ? marimo.id : defaultState.marimo.id,
        volume: Number.isFinite(marimo.volume) ? marimo.volume : defaultState.marimo.volume,
        diameter: Number.isFinite(marimo.diameter) ? marimo.diameter : defaultState.marimo.diameter,
        stage: Number.isFinite(marimo.stage) ? marimo.stage : defaultState.marimo.stage,
        type: typeof marimo.type === "string" ? marimo.type : defaultState.marimo.type
    };

    const shouldUseNullMarimo = normalizedMainSlotStatus === "empty" || marimoValue === null || (Number.isFinite(normalizedMarimo.volume) && normalizedMarimo.volume <= 0);

    return {
        mainSlotStatus: shouldUseNullMarimo ? "empty" : "occupied",
        maxMarimoVolume: normalizedMaxMarimoVolume,
        maxMarimoDiameter: normalizedMaxMarimoVolume,
        marimo: shouldUseNullMarimo ? null : {
            id: normalizedMarimo.id,
            volume: normalizedMarimo.volume,
            diameter: normalizedMarimo.diameter,
            stage: normalizedMarimo.stage,
            type: normalizedMarimo.type
        },
        upgrades: normalizeUpgrades(upgrades),
        growth: normalizeGrowth(growth),
        environment: normalizeEnvironment(environment),
        split: normalizeSplit(split),
        currency: {
            shells: Number.isFinite(currency.shells) ? currency.shells : defaultState.currency.shells
        },
        merchants: normalizeMerchantsState(safeStored.merchants),
        progression: normalizeProgression(safeStored.progression, safeStored.flags),
        warehouseView: normalizeWarehouseView(safeStored.warehouseView),
        notifications: normalizeNotifications(safeStored.notifications),
        warehouse: normalizeWarehouseItems(rawWarehouse)
    };
}

function applyState(nextState) {
    const normalizedMainSlotStatus = nextState.mainSlotStatus === "empty" ? "empty" : "occupied";
    state.mainSlotStatus = normalizedMainSlotStatus;
    state.maxMarimoVolume = Number.isFinite(nextState.maxMarimoVolume) ? Math.max(0.1, nextState.maxMarimoVolume) : defaultState.maxMarimoVolume;
    state.maxMarimoDiameter = Number.isFinite(nextState.maxMarimoDiameter) ? Math.max(0.1, nextState.maxMarimoDiameter) : state.maxMarimoVolume;
    state.marimo = normalizedMainSlotStatus === "empty" ? null : (nextState.marimo && typeof nextState.marimo === "object" ? { ...nextState.marimo } : { ...defaultState.marimo });
    state.upgrades = normalizeUpgrades(nextState.upgrades);
    state.growth = { ...normalizeGrowth(nextState.growth) };
    state.environment = { ...normalizeEnvironment(nextState.environment) };
    state.split = { ...nextState.split };
    state.currency = { ...nextState.currency };
    state.merchants = normalizeMerchantsState(nextState.merchants);
    state.progression = { ...nextState.progression };
    state.warehouseView = { ...nextState.warehouseView };
    state.notifications = [...nextState.notifications];
    state.warehouse = normalizeWarehouseItems(nextState.warehouse).map((item) => ({ ...item }));

    if (state.mainSlotStatus === "empty" || state.marimo === null) {
        state.growth.feeding = false;
        state.growth.accumulatedNutrition = 0;
    }

    return state;
}

export const state = createDefaultState();

export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return applyState(createDefaultState());
        }

        if (raw.length > MAX_LOADABLE_STATE_CHARS) {
            localStorage.removeItem(STORAGE_KEY);
            return applyState(createDefaultState());
        }

        const parsed = JSON.parse(raw);
        return applyState(mergeState(parsed));
    } catch (error) {
        return applyState(createDefaultState());
    }
}

export function saveState() {
    if (state.mainSlotStatus === "empty") {
        state.marimo = null;
        state.growth.feeding = false;
        state.growth.accumulatedNutrition = 0;
    }

    const normalizedState = mergeState(state);
    const savePayload = trimStateToStorageBudget(normalizedState);

    if (savePayload.wasTrimmed) {
        applyState(savePayload.state);
    }

    try {
        localStorage.setItem(STORAGE_KEY, savePayload.serialized);
    } catch (error) {
        const minimalState = {
            ...savePayload.state,
            notifications: [],
            warehouse: []
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(minimalState));
        } catch (finalError) {
            void finalError;
        }
        applyState(minimalState);
    }
}

export function resetState() {
    const reset = applyState(createDefaultState());
    saveState();
    return reset;
}
