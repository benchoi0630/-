// 파일 역할: 개발 전용 패널 UI와 상태 조작 기능을 제공하는 도구 모듈이다.
// 핵심 책임: 표시 스케일 프리셋, 업그레이드 조정, 상인 상태 제어 등 디버그 액션을 묶는다.
// 연동 범위: 로컬 저장소 설정과 dev-state 이벤트를 통해 화면 반영을 동기화한다.

import { state, saveState, resetState } from "./state.js";
import { applyProgression, setProgression } from "./progression/progressionLogic.js";
import { progressionTrackDefs } from "./progression/progressionTracks.js";
import { merchantList, createDefaultMerchantsState } from "./merchants/merchantsIndex.js";
import { describeOfferSpec, resolveMerchantOfferSpec } from "./merchants/merchantOffer.js";
import { getAllUpgradeDefinitions } from "./upgrades/upgradeDefinitions.js";
import { purchaseUpgradeById } from "./upgrades/upgradeActions.js";
import { DEFAULT_MAX_MARIMO_VOLUME } from "./upgrades/upgradeSelectors.js";

const DEV_DISPLAY_STORAGE_KEY = "marimoDevDisplayConfig";
const DEV_STATE_CHANGED_EVENT = "marimo:dev-state-changed";

const DEV_PRESET_DIMENSIONS = {
    phone: { width: "400px", height: "844px", label: "400 x 844" },
    tablet: { width: "820px", height: "1180px", label: "820 x 1180" },
    desktop: { width: "100vw", height: "100dvh", label: "viewport" }
};

const DEFAULT_DISPLAY_CONFIG = {
    preset: "phone",
    uiScale: 1,
    marimoScale: 1,
    basketCanvasWidth: 360,
    basketCanvasHeight: 300,
    basketCanvasDpr: 1
};

const DYNAMIC_MERCHANT_SLOT_INDEXES = [1, 2, 3];
const UPGRADE_DEFINITION_STATE_KEY_MAP = {
    biggerSplit: "splitUpgrade"
};

let devToolsOpen = false;
let displayConfig = loadDisplayConfig();
let devPanelMessage = "";
let devPanelMessageTimerId = null;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function roundToStep(value, step) {
    return Math.round(value / step) * step;
}

function formatNumber(value, digits = 2) {
    return Number(value).toFixed(digits);
}

function createDefaultDisplayConfig() {
    return {
        preset: DEFAULT_DISPLAY_CONFIG.preset,
        uiScale: DEFAULT_DISPLAY_CONFIG.uiScale,
        marimoScale: DEFAULT_DISPLAY_CONFIG.marimoScale,
        basketCanvasWidth: DEFAULT_DISPLAY_CONFIG.basketCanvasWidth,
        basketCanvasHeight: DEFAULT_DISPLAY_CONFIG.basketCanvasHeight,
        basketCanvasDpr: DEFAULT_DISPLAY_CONFIG.basketCanvasDpr
    };
}

function sanitizeDisplayConfig(rawConfig) {
    const source = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
    const preset = source.preset === "phone" || source.preset === "tablet" || source.preset === "desktop"
        ? source.preset
        : DEFAULT_DISPLAY_CONFIG.preset;

    return {
        preset,
        uiScale: clamp(roundToStep(toNumber(source.uiScale, DEFAULT_DISPLAY_CONFIG.uiScale), 0.05), 0.7, 1.6),
        marimoScale: clamp(roundToStep(toNumber(source.marimoScale, DEFAULT_DISPLAY_CONFIG.marimoScale), 0.05), 0.6, 2),
        basketCanvasWidth: clamp(roundToStep(toNumber(source.basketCanvasWidth, DEFAULT_DISPLAY_CONFIG.basketCanvasWidth), 10), 220, 640),
        basketCanvasHeight: clamp(roundToStep(toNumber(source.basketCanvasHeight, DEFAULT_DISPLAY_CONFIG.basketCanvasHeight), 10), 180, 540),
        basketCanvasDpr: clamp(roundToStep(toNumber(source.basketCanvasDpr, DEFAULT_DISPLAY_CONFIG.basketCanvasDpr), 0.25), 1, 3)
    };
}

function loadDisplayConfig() {
    try {
        const raw = localStorage.getItem(DEV_DISPLAY_STORAGE_KEY);
        if (!raw) {
            return createDefaultDisplayConfig();
        }

        return sanitizeDisplayConfig(JSON.parse(raw));
    } catch (error) {
        return createDefaultDisplayConfig();
    }
}

function saveDisplayConfig() {
    try {
        localStorage.setItem(DEV_DISPLAY_STORAGE_KEY, JSON.stringify(displayConfig));
    } catch (error) {
        void error;
    }
}

function getPresetDimensions(preset) {
    return DEV_PRESET_DIMENSIONS[preset] || DEV_PRESET_DIMENSIONS.desktop;
}

function dispatchDisplayConfigChanged() {
    window.dispatchEvent(new CustomEvent("marimo:dev-display-config-changed", {
        detail: {
            ...displayConfig,
            ...getPresetDimensions(displayConfig.preset)
        }
    }));
}

function applyDisplayConfigToDocument() {
    const rootStyle = document.documentElement.style;
    const dimensions = getPresetDimensions(displayConfig.preset);

    rootStyle.setProperty("--app-width", dimensions.width);
    rootStyle.setProperty("--app-height", dimensions.height);
    rootStyle.setProperty("--ui-scale", String(displayConfig.uiScale));
    rootStyle.setProperty("--marimo-scale", String(displayConfig.marimoScale));
    rootStyle.setProperty("--basket-canvas-width", String(displayConfig.basketCanvasWidth));
    rootStyle.setProperty("--basket-canvas-height", String(displayConfig.basketCanvasHeight));
    rootStyle.setProperty("--basket-canvas-dpr", String(displayConfig.basketCanvasDpr));

    dispatchDisplayConfigChanged();
}

function getDevToolsElements() {
    return {
        globalHeader: document.getElementById("globalHeader"),
        devToolsToggleBtn: document.getElementById("devToolsToggleBtn"),
        devToolsPanel: document.getElementById("devToolsPanel"),

        devPanelMessage: document.getElementById("devPanelMessage"),
        devShellsValue: document.getElementById("devShellsValue"),

        devUpgradeControls: document.getElementById("devUpgradeControls"),
        devProgressControls: document.getElementById("devProgressControls"),
        devMerchantControls: document.getElementById("devMerchantControls"),

        devViewportPhoneBtn: document.getElementById("devViewportPhoneBtn"),
        devViewportTabletBtn: document.getElementById("devViewportTabletBtn"),
        devViewportDesktopBtn: document.getElementById("devViewportDesktopBtn"),
        devAppSizeValue: document.getElementById("devAppSizeValue"),

        devUiScaleInput: document.getElementById("devUiScaleInput"),
        devUiScaleValue: document.getElementById("devUiScaleValue"),
        devMarimoScaleInput: document.getElementById("devMarimoScaleInput"),
        devMarimoScaleValue: document.getElementById("devMarimoScaleValue"),

        devCanvasWidthInput: document.getElementById("devCanvasWidthInput"),
        devCanvasWidthValue: document.getElementById("devCanvasWidthValue"),
        devCanvasHeightInput: document.getElementById("devCanvasHeightInput"),
        devCanvasHeightValue: document.getElementById("devCanvasHeightValue"),
        devCanvasDprInput: document.getElementById("devCanvasDprInput"),
        devCanvasDprValue: document.getElementById("devCanvasDprValue")
    };
}

function createSection(titleText, contentId = "") {
    const section = document.createElement("section");
    section.className = "devtools-section";

    const title = document.createElement("strong");
    title.className = "devtools-section-title";
    title.textContent = titleText;

    section.appendChild(title);

    if (contentId) {
        const content = document.createElement("div");
        content.id = contentId;
        content.className = "devtools-list";
        section.appendChild(content);
    }

    return section;
}

function createSliderControlRow(options) {
    const wrap = document.createElement("div");
    wrap.className = "devtools-row";

    const labelNode = document.createElement("label");
    labelNode.className = "devtools-label";
    labelNode.htmlFor = options.inputId;
    labelNode.textContent = options.label;

    const controls = document.createElement("div");
    controls.className = "devtools-slider-wrap";

    const input = document.createElement("input");
    input.type = "range";
    input.id = options.inputId;
    input.className = "devtools-slider";
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.dataset.displayKey = options.displayKey;

    const value = document.createElement("span");
    value.id = options.valueId;
    value.className = "devtools-value";

    controls.appendChild(input);
    controls.appendChild(value);

    wrap.appendChild(labelNode);
    wrap.appendChild(controls);

    return wrap;
}

function createActionButton(label, action, extraData = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;

    const keys = Object.keys(extraData);
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        button.dataset[key] = String(extraData[key]);
    }

    return button;
}

function ensureDevToolsUI() {
    const elements = getDevToolsElements();
    if (!elements.globalHeader) {
        return;
    }

    if (!elements.devToolsToggleBtn) {
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.id = "devToolsToggleBtn";
        toggleButton.textContent = "Open Dev Tools";
        elements.globalHeader.appendChild(toggleButton);
    }

    if (elements.devToolsPanel) {
        return;
    }

    const panel = document.createElement("section");
    panel.id = "devToolsPanel";
    panel.className = "devtools-panel hidden";

    const title = document.createElement("strong");
    title.textContent = "Dev Tools";

    const message = document.createElement("p");
    message.id = "devPanelMessage";
    message.className = "devtools-message";

    const stateSection = createSection("State");

    const shellRow = document.createElement("div");
    shellRow.className = "devtools-row";

    const shellLabel = document.createElement("span");
    shellLabel.className = "devtools-label";
    shellLabel.textContent = "shells";

    const shellValue = document.createElement("span");
    shellValue.id = "devShellsValue";
    shellValue.className = "devtools-value";

    const shellControls = document.createElement("div");
    shellControls.className = "devtools-inline-controls";
    shellControls.appendChild(createActionButton("-100", "shells-adjust", { delta: -100 }));
    shellControls.appendChild(createActionButton("+100", "shells-adjust", { delta: 100 }));

    shellRow.appendChild(shellLabel);
    shellRow.appendChild(shellValue);
    shellRow.appendChild(shellControls);

    const stateActions = document.createElement("div");
    stateActions.className = "devtools-grid-actions";
    stateActions.appendChild(createActionButton("Spawn Main Marimo", "main-marimo-spawn"));
    stateActions.appendChild(createActionButton("Remove Main Marimo", "main-marimo-remove"));
    stateActions.appendChild(createActionButton("Reset Data", "state-reset"));

    stateSection.appendChild(shellRow);
    stateSection.appendChild(stateActions);

    const upgradeSection = createSection("Upgrades (+/- auto apply)", "devUpgradeControls");
    const progressionSection = createSection("Progression", "devProgressControls");

    const merchantSection = createSection("Merchants", "devMerchantControls");
    const merchantTopActions = document.createElement("div");
    merchantTopActions.className = "devtools-grid-actions";
    merchantTopActions.appendChild(createActionButton("Unlock All", "merchant-unlock-all"));
    merchantTopActions.appendChild(createActionButton("Despawn All", "merchant-despawn-all"));
    merchantTopActions.appendChild(createActionButton("Reset All", "merchant-reset-all"));
    merchantSection.insertBefore(merchantTopActions, merchantSection.lastChild);

    const displaySection = createSection("Display/Render");

    const presetWrap = document.createElement("div");
    presetWrap.className = "devtools-preset-list";
    const presetPhoneBtn = createActionButton("Phone", "display-preset", { preset: "phone" });
    presetPhoneBtn.id = "devViewportPhoneBtn";
    const presetTabletBtn = createActionButton("Tablet", "display-preset", { preset: "tablet" });
    presetTabletBtn.id = "devViewportTabletBtn";
    const presetDesktopBtn = createActionButton("Desktop", "display-preset", { preset: "desktop" });
    presetDesktopBtn.id = "devViewportDesktopBtn";

    presetWrap.appendChild(presetPhoneBtn);
    presetWrap.appendChild(presetTabletBtn);
    presetWrap.appendChild(presetDesktopBtn);
    displaySection.appendChild(presetWrap);

    const appSizeRow = document.createElement("div");
    appSizeRow.className = "devtools-row";
    const appSizeLabel = document.createElement("span");
    appSizeLabel.className = "devtools-label";
    appSizeLabel.textContent = "app size";
    const appSizeValue = document.createElement("span");
    appSizeValue.id = "devAppSizeValue";
    appSizeValue.className = "devtools-value";
    appSizeValue.style.minWidth = "88px";
    appSizeRow.appendChild(appSizeLabel);
    appSizeRow.appendChild(appSizeValue);
    displaySection.appendChild(appSizeRow);

    displaySection.appendChild(createSliderControlRow({
        label: "ui scale",
        inputId: "devUiScaleInput",
        valueId: "devUiScaleValue",
        min: 0.7,
        max: 1.6,
        step: 0.05,
        displayKey: "uiScale"
    }));

    displaySection.appendChild(createSliderControlRow({
        label: "marimo",
        inputId: "devMarimoScaleInput",
        valueId: "devMarimoScaleValue",
        min: 0.6,
        max: 2,
        step: 0.05,
        displayKey: "marimoScale"
    }));

    displaySection.appendChild(createSliderControlRow({
        label: "canvas w",
        inputId: "devCanvasWidthInput",
        valueId: "devCanvasWidthValue",
        min: 220,
        max: 640,
        step: 10,
        displayKey: "basketCanvasWidth"
    }));

    displaySection.appendChild(createSliderControlRow({
        label: "canvas h",
        inputId: "devCanvasHeightInput",
        valueId: "devCanvasHeightValue",
        min: 180,
        max: 540,
        step: 10,
        displayKey: "basketCanvasHeight"
    }));

    displaySection.appendChild(createSliderControlRow({
        label: "canvas dpr",
        inputId: "devCanvasDprInput",
        valueId: "devCanvasDprValue",
        min: 1,
        max: 3,
        step: 0.25,
        displayKey: "basketCanvasDpr"
    }));

    displaySection.appendChild(createActionButton("Reset Display Settings", "display-reset"));

    panel.appendChild(title);
    panel.appendChild(message);
    panel.appendChild(stateSection);
    panel.appendChild(upgradeSection);
    panel.appendChild(progressionSection);
    panel.appendChild(merchantSection);
    panel.appendChild(displaySection);

    document.body.appendChild(panel);
}

function getUpgradeDefinitionInfo() {
    const definitions = getAllUpgradeDefinitions();
    const definitionMap = new Map();

    for (let i = 0; i < definitions.length; i += 1) {
        definitionMap.set(definitions[i].id, definitions[i]);
    }

    return {
        definitions,
        definitionMap
    };
}

function getUpgradeEntries() {
    const { definitions } = getUpgradeDefinitionInfo();
    const upgrades = state.upgrades && typeof state.upgrades === "object" ? state.upgrades : {};
    const seen = new Set();
    const entries = [];

    for (let i = 0; i < definitions.length; i += 1) {
        const definitionId = definitions[i].id;
        const mappedStateKey = UPGRADE_DEFINITION_STATE_KEY_MAP[definitionId];
        const targetKey = mappedStateKey && Number.isFinite(upgrades[mappedStateKey]) ? mappedStateKey : definitionId;

        if (seen.has(targetKey)) {
            continue;
        }

        seen.add(targetKey);
        seen.add(definitionId);
        entries.push(targetKey);
    }

    const upgradeKeys = Object.keys(upgrades);
    for (let i = 0; i < upgradeKeys.length; i += 1) {
        const key = upgradeKeys[i];
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        entries.push(key);
    }

    return entries;
}

function createUpgradeRow(upgradeId, definitionMap) {
    const upgrades = state.upgrades && typeof state.upgrades === "object" ? state.upgrades : {};
    const currentValue = upgrades[upgradeId];
    const definition = resolveUpgradeDefinition(upgradeId, definitionMap);
    const labelText = definition?.label || upgradeId;

    const card = document.createElement("article");
    card.className = "devtools-item-card";

    const row = document.createElement("div");
    row.className = "devtools-row";

    const label = document.createElement("span");
    label.className = "devtools-label";
    label.textContent = labelText;

    const controls = document.createElement("div");
    controls.className = "devtools-inline-controls";

    if (Number.isFinite(currentValue)) {
        const down = createActionButton("-", "upgrade-adjust", { upgradeKey: upgradeId, delta: -1 });
        const value = document.createElement("span");
        value.className = "devtools-value";
        value.textContent = String(Math.round(currentValue));
        const up = createActionButton("+", "upgrade-adjust", { upgradeKey: upgradeId, delta: 1 });

        if (definition?.kind === "one_time" && currentValue >= 1) {
            up.disabled = true;
        }

        controls.appendChild(down);
        controls.appendChild(value);
        controls.appendChild(up);
    } else {
        const triggerButton = createActionButton("+", "upgrade-trigger", { upgradeId });
        controls.appendChild(triggerButton);
    }

    row.appendChild(label);
    row.appendChild(controls);
    card.appendChild(row);

    if (definition && typeof definition.getMetaText === "function") {
        const meta = document.createElement("p");
        meta.className = "devtools-meta";
        meta.textContent = definition.getMetaText(state);
        card.appendChild(meta);
    }

    return card;
}

function resolveUpgradeDefinition(upgradeId, definitionMap) {
    if (definitionMap.has(upgradeId)) {
        return definitionMap.get(upgradeId);
    }

    const definitionIds = Object.keys(UPGRADE_DEFINITION_STATE_KEY_MAP);
    for (let i = 0; i < definitionIds.length; i += 1) {
        const definitionId = definitionIds[i];
        if (UPGRADE_DEFINITION_STATE_KEY_MAP[definitionId] !== upgradeId) {
            continue;
        }

        if (definitionMap.has(definitionId)) {
            return definitionMap.get(definitionId);
        }
    }

    return null;
}

function renderUpgradeSection(elements) {
    if (!elements.devUpgradeControls) {
        return;
    }

    elements.devUpgradeControls.textContent = "";

    const { definitionMap } = getUpgradeDefinitionInfo();
    const entries = getUpgradeEntries();

    for (let i = 0; i < entries.length; i += 1) {
        elements.devUpgradeControls.appendChild(createUpgradeRow(entries[i], definitionMap));
    }
}

function getProgressionTracks() {
    const tracks = new Set();
    const defTracks = Object.keys(progressionTrackDefs);
    for (let i = 0; i < defTracks.length; i += 1) {
        tracks.add(defTracks[i]);
    }

    const stateTracks = Object.keys(state.progression || {});
    for (let i = 0; i < stateTracks.length; i += 1) {
        tracks.add(stateTracks[i]);
    }

    return [...tracks];
}

function getTrackMaxLevel(track) {
    const levels = progressionTrackDefs[track]?.levels;
    if (!Array.isArray(levels) || levels.length <= 0) {
        return 0;
    }

    let maxLevel = 0;
    for (let i = 0; i < levels.length; i += 1) {
        const level = Number.isFinite(levels[i]?.level) ? Math.max(0, Math.round(levels[i].level)) : 0;
        maxLevel = Math.max(maxLevel, level);
    }

    return maxLevel;
}

function createProgressRow(track) {
    const currentLevel = Number.isFinite(state.progression?.[track]) ? Math.max(0, Math.round(state.progression[track])) : 0;
    const maxLevel = getTrackMaxLevel(track);

    const card = document.createElement("article");
    card.className = "devtools-item-card";

    const row = document.createElement("div");
    row.className = "devtools-row";

    const label = document.createElement("span");
    label.className = "devtools-label";
    label.textContent = track;

    const controls = document.createElement("div");
    controls.className = "devtools-inline-controls";

    controls.appendChild(createActionButton("-", "progress-adjust", { track, delta: -1 }));

    const value = document.createElement("span");
    value.className = "devtools-value";
    value.textContent = `${currentLevel}/${maxLevel}`;
    controls.appendChild(value);

    controls.appendChild(createActionButton("+", "progress-adjust", { track, delta: 1 }));

    const input = document.createElement("input");
    input.type = "number";
    input.className = "devtools-number-input";
    input.min = "0";
    input.value = String(currentLevel);
    input.dataset.progressTrack = track;

    controls.appendChild(input);
    controls.appendChild(createActionButton("Set", "progress-set", { track }));

    row.appendChild(label);
    row.appendChild(controls);

    card.appendChild(row);
    return card;
}

function renderProgressionSection(elements) {
    if (!elements.devProgressControls) {
        return;
    }

    elements.devProgressControls.textContent = "";

    const tracks = getProgressionTracks();
    for (let i = 0; i < tracks.length; i += 1) {
        elements.devProgressControls.appendChild(createProgressRow(tracks[i]));
    }
}

function ensureMerchantState(merchantId) {
    if (!state.merchants || typeof state.merchants !== "object") {
        state.merchants = {};
    }

    if (state.merchants[merchantId] && typeof state.merchants[merchantId] === "object") {
        return state.merchants[merchantId];
    }

    const defaults = createDefaultMerchantsState();
    const fallback = defaults[merchantId] || {
        id: merchantId,
        salesCount: 0,
        level: 1,
        unlocked: false
    };

    state.merchants[merchantId] = { ...fallback };
    return state.merchants[merchantId];
}

function hasDynamicPresenceFields(merchantState) {
    if (!merchantState || typeof merchantState !== "object") {
        return false;
    }

    return (
        Object.prototype.hasOwnProperty.call(merchantState, "active")
        && Object.prototype.hasOwnProperty.call(merchantState, "slotIndex")
    );
}

function getOccupiedDynamicMerchantSlots(excludeMerchantId = "") {
    const occupied = new Set();

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchantId = merchantList[i]?.id;
        if (!merchantId || merchantId === excludeMerchantId) {
            continue;
        }

        const merchantState = state.merchants?.[merchantId];
        const slotIndex = Number.isFinite(merchantState?.slotIndex) ? Math.round(merchantState.slotIndex) : null;
        if (merchantState?.active === true && slotIndex !== null && DYNAMIC_MERCHANT_SLOT_INDEXES.includes(slotIndex)) {
            occupied.add(slotIndex);
        }
    }

    return occupied;
}

function pickAvailableDynamicSlot(excludeMerchantId = "") {
    const occupied = getOccupiedDynamicMerchantSlots(excludeMerchantId);
    const available = DYNAMIC_MERCHANT_SLOT_INDEXES.filter((slotIndex) => !occupied.has(slotIndex));

    if (available.length > 0) {
        const randomIndex = Math.floor(Math.random() * available.length);
        return available[randomIndex];
    }

    return DYNAMIC_MERCHANT_SLOT_INDEXES[0];
}

function createMerchantRow(merchant) {
    const merchantId = merchant?.id;
    const merchantState = ensureMerchantState(merchantId);
    const offerSpec = resolveMerchantOfferSpec(state, merchant, merchantState, Date.now());
    const rewards = typeof merchant.getRewards === "function" ? merchant.getRewards(state, merchantState) : null;

    const card = document.createElement("article");
    card.className = "devtools-merchant-card";

    const header = document.createElement("div");
    header.className = "devtools-row";

    const title = document.createElement("strong");
    title.className = "devtools-label";
    title.textContent = merchantId;

    const status = document.createElement("span");
    status.className = "devtools-value";
    const slotText = Number.isFinite(merchantState?.slotIndex) ? String(Math.round(merchantState.slotIndex)) : "-";
    status.textContent = `U:${merchantState?.unlocked === true ? "Y" : "N"} A:${merchantState?.active === true ? "Y" : "N"} S:${slotText}`;

    header.appendChild(title);
    header.appendChild(status);
    card.appendChild(header);

    const info = document.createElement("p");
    info.className = "devtools-meta";
    const salesText = Number.isFinite(merchantState?.salesCount) ? Math.max(0, Math.round(merchantState.salesCount)) : 0;
    const levelText = Number.isFinite(merchantState?.level) ? Math.max(1, Math.round(merchantState.level)) : 1;
    const reqText = describeOfferSpec(offerSpec);
    const rewardShells = Number.isFinite(rewards?.shells) ? rewards.shells : "-";
    info.textContent = `lv:${levelText} sales:${salesText} req:${reqText} reward:${rewardShells} shells`;
    card.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "devtools-grid-actions";

    actions.appendChild(createActionButton("Unlock", "merchant-unlock", { merchantId }));

    const lockBtn = createActionButton("Lock", "merchant-lock", { merchantId });
    if (merchantId === "merchant1") {
        lockBtn.disabled = true;
    }
    actions.appendChild(lockBtn);

    const canSpawn = hasDynamicPresenceFields(merchantState);

    const spawnBtn = createActionButton("Spawn Now", "merchant-spawn", { merchantId });
    spawnBtn.disabled = !canSpawn;
    actions.appendChild(spawnBtn);

    const despawnBtn = createActionButton("Despawn", "merchant-despawn", { merchantId });
    despawnBtn.disabled = !canSpawn;
    actions.appendChild(despawnBtn);

    actions.appendChild(createActionButton("sales -", "merchant-sales-adjust", { merchantId, delta: -1 }));
    actions.appendChild(createActionButton("sales +", "merchant-sales-adjust", { merchantId, delta: 1 }));
    actions.appendChild(createActionButton("level -", "merchant-level-adjust", { merchantId, delta: -1 }));
    actions.appendChild(createActionButton("level +", "merchant-level-adjust", { merchantId, delta: 1 }));
    actions.appendChild(createActionButton("Reset", "merchant-reset", { merchantId }));

    card.appendChild(actions);

    return card;
}

function renderMerchantSection(elements) {
    if (!elements.devMerchantControls) {
        return;
    }

    elements.devMerchantControls.textContent = "";

    for (let i = 0; i < merchantList.length; i += 1) {
        const merchant = merchantList[i];
        if (!merchant?.id) {
            continue;
        }

        elements.devMerchantControls.appendChild(createMerchantRow(merchant));
    }
}

function setDevPanelMessage(message) {
    devPanelMessage = String(message || "");
    renderDevPanelMessage();

    if (devPanelMessageTimerId) {
        clearTimeout(devPanelMessageTimerId);
        devPanelMessageTimerId = null;
    }

    if (!devPanelMessage) {
        return;
    }

    devPanelMessageTimerId = window.setTimeout(() => {
        devPanelMessage = "";
        renderDevPanelMessage();
        devPanelMessageTimerId = null;
    }, 1400);
}

function renderDevPanelMessage() {
    const elements = getDevToolsElements();
    if (!elements.devPanelMessage) {
        return;
    }

    elements.devPanelMessage.textContent = devPanelMessage;
    elements.devPanelMessage.classList.toggle("hidden", devPanelMessage.length <= 0);
}

function setDisplayPreset(preset) {
    displayConfig.preset = preset;
    displayConfig = sanitizeDisplayConfig(displayConfig);
    applyDisplayConfigToDocument();
    saveDisplayConfig();
    renderDevToolsUI();
}

function updateDisplayConfigFromInput(key, value) {
    displayConfig = sanitizeDisplayConfig({
        ...displayConfig,
        [key]: value
    });

    applyDisplayConfigToDocument();
    saveDisplayConfig();
    renderDevToolsUI();
}

function handleDisplayReset() {
    displayConfig = createDefaultDisplayConfig();
    applyDisplayConfigToDocument();
    saveDisplayConfig();
    renderDevToolsUI();
}

function notifyDevStateChanged(reason = "dev-tool") {
    window.dispatchEvent(new CustomEvent(DEV_STATE_CHANGED_EVENT, {
        detail: { reason }
    }));
}

function commitStateMutation(options = {}) {
    const reason = typeof options.reason === "string" ? options.reason : "dev-tool";
    const runAutoProgression = options.runAutoProgression === true;

    if (runAutoProgression) {
        applyProgression(state, reason);
    }

    saveState();
    notifyDevStateChanged(reason);
    renderDevToolsUI();
}

function handleResetData() {
    const approved = window.confirm("Reset all marimo data?");
    if (!approved) {
        return;
    }

    resetState();
    applyProgression(state, "dev-reset");
    saveState();
    notifyDevStateChanged("dev-reset");
    setDevPanelMessage("Data reset complete");
    renderDevToolsUI();
}

function adjustShells(delta) {
    const currentShells = Number.isFinite(state.currency?.shells) ? state.currency.shells : 0;
    state.currency.shells = Math.max(0, currentShells + delta);
}

function applyUpgradeSideEffects(upgradeKey, nextValue) {
    if (upgradeKey === "maxDiameterUpgrade") {
        const safeLevel = Math.max(0, Math.round(nextValue));
        const nextMaxVolume = Math.max(0.1, DEFAULT_MAX_MARIMO_VOLUME + safeLevel);
        state.maxMarimoVolume = nextMaxVolume;
        state.maxMarimoDiameter = nextMaxVolume;
        return;
    }

    if (upgradeKey === "splitUpgrade") {
        const purchased = nextValue >= 1;
        state.split.maxVolume = purchased ? 2 : 1;
        state.split.currentVolume = Math.min(state.split.currentVolume, state.split.maxVolume);
    }
}

function adjustUpgradeLevel(upgradeKey, delta) {
    if (!state.upgrades || typeof state.upgrades !== "object") {
        state.upgrades = {};
    }

    const currentValue = Number.isFinite(state.upgrades[upgradeKey]) ? Math.round(state.upgrades[upgradeKey]) : 0;
    const definitionMap = getUpgradeDefinitionInfo().definitionMap;
    const definition = definitionMap.get(upgradeKey) || null;

    let nextValue = Math.max(0, currentValue + delta);
    if (definition?.kind === "one_time" || upgradeKey === "splitUpgrade") {
        nextValue = clamp(nextValue, 0, 1);
    }

    state.upgrades[upgradeKey] = nextValue;
    applyUpgradeSideEffects(upgradeKey, nextValue);
}

function triggerUpgradeById(upgradeId) {
    if (!upgradeId) {
        return false;
    }

    if (state.upgrades && Number.isFinite(state.upgrades[upgradeId])) {
        adjustUpgradeLevel(upgradeId, 1);
        return true;
    }

    if (upgradeId === "biggerSplit") {
        adjustUpgradeLevel("splitUpgrade", 1);
        return true;
    }

    const originalShells = Number.isFinite(state.currency?.shells) ? state.currency.shells : 0;
    state.currency.shells = Math.max(originalShells, 99999999);

    const result = purchaseUpgradeById(state, null, upgradeId);
    state.currency.shells = originalShells;

    if (result?.ok === true) {
        return true;
    }

    return false;
}

function adjustProgressTrack(track, delta) {
    const currentValue = Number.isFinite(state.progression?.[track]) ? Math.max(0, Math.round(state.progression[track])) : 0;
    setProgression(state, track, Math.max(0, currentValue + delta), "dev-tool");
}

function setProgressTrack(track, value) {
    const targetValue = Math.max(0, toInteger(value, 0));
    setProgression(state, track, targetValue, "dev-tool");
}

function unlockMerchant(merchantId) {
    const merchantState = ensureMerchantState(merchantId);
    merchantState.unlocked = true;
    merchantState.activeOffer = null;
}

function lockMerchant(merchantId) {
    const merchantState = ensureMerchantState(merchantId);

    if (merchantId === "merchant1") {
        merchantState.unlocked = true;
        merchantState.activeOffer = null;
        return;
    }

    merchantState.unlocked = false;
    merchantState.activeOffer = null;

    if (hasDynamicPresenceFields(merchantState)) {
        merchantState.active = false;
        merchantState.slotIndex = null;
        merchantState.visitSales = 0;
    }
}

function spawnMerchantNow(merchantId) {
    const merchantState = ensureMerchantState(merchantId);
    merchantState.unlocked = true;
    merchantState.activeOffer = null;

    if (!hasDynamicPresenceFields(merchantState)) {
        return;
    }

    merchantState.active = true;
    merchantState.slotIndex = pickAvailableDynamicSlot(merchantId);
    merchantState.visitSales = 0;
    merchantState.cooldownUntil = 0;

    const nextInterval = Number.isFinite(merchantState.spawnCheckIntervalMs)
        ? Math.max(1, Math.round(merchantState.spawnCheckIntervalMs))
        : 10000;
    merchantState.nextSpawnCheckAt = Date.now() + nextInterval;
}

function despawnMerchantNow(merchantId) {
    const merchantState = ensureMerchantState(merchantId);
    if (!hasDynamicPresenceFields(merchantState)) {
        return;
    }

    merchantState.active = false;
    merchantState.slotIndex = null;
    merchantState.visitSales = 0;
    merchantState.activeOffer = null;
}

function adjustMerchantSales(merchantId, delta) {
    const merchantState = ensureMerchantState(merchantId);
    const currentSales = Number.isFinite(merchantState.salesCount) ? Math.max(0, Math.round(merchantState.salesCount)) : 0;
    merchantState.salesCount = Math.max(0, currentSales + delta);
}

function adjustMerchantLevel(merchantId, delta) {
    const merchantState = ensureMerchantState(merchantId);
    const currentLevel = Number.isFinite(merchantState.level) ? Math.max(1, Math.round(merchantState.level)) : 1;
    merchantState.level = Math.max(1, currentLevel + delta);
    merchantState.activeOffer = null;
}

function resetMerchantState(merchantId) {
    const defaults = createDefaultMerchantsState();
    if (!defaults[merchantId]) {
        return;
    }

    state.merchants[merchantId] = {
        ...defaults[merchantId]
    };
}

function unlockAllMerchants() {
    for (let i = 0; i < merchantList.length; i += 1) {
        const merchantId = merchantList[i]?.id;
        if (!merchantId) {
            continue;
        }

        unlockMerchant(merchantId);
    }
}

function despawnAllMerchants() {
    for (let i = 0; i < merchantList.length; i += 1) {
        const merchantId = merchantList[i]?.id;
        if (!merchantId) {
            continue;
        }

        despawnMerchantNow(merchantId);
    }
}

function resetAllMerchants() {
    const defaults = createDefaultMerchantsState();
    if (!state.merchants || typeof state.merchants !== "object") {
        state.merchants = {};
    }

    const merchantIds = Object.keys(defaults);
    for (let i = 0; i < merchantIds.length; i += 1) {
        const merchantId = merchantIds[i];
        state.merchants[merchantId] = {
            ...defaults[merchantId]
        };
    }
}

function removeMainMarimo() {
    state.mainSlotStatus = "empty";
    state.marimo = null;
}

function spawnMainMarimo() {
    state.mainSlotStatus = "occupied";

    if (state.marimo && typeof state.marimo === "object") {
        if (!Number.isFinite(state.marimo.volume) || state.marimo.volume <= 0) {
            state.marimo.volume = 1;
        }
        return;
    }

    state.marimo = {
        id: `main-marimo-${Date.now()}`,
        volume: 1,
        diameter: 1,
        stage: 1,
        type: "normal"
    };
}

function runActionFromButton(button) {
    const action = button?.dataset?.action;
    if (!action) {
        return;
    }

    if (action === "shells-adjust") {
        const delta = toInteger(button.dataset.delta, 0);
        if (delta !== 0) {
            adjustShells(delta);
            commitStateMutation({ reason: "dev-shells", runAutoProgression: false });
        }
        return;
    }

    if (action === "main-marimo-remove") {
        removeMainMarimo();
        commitStateMutation({ reason: "dev-main-marimo-remove", runAutoProgression: false });
        return;
    }

    if (action === "main-marimo-spawn") {
        spawnMainMarimo();
        commitStateMutation({ reason: "dev-main-marimo-spawn", runAutoProgression: false });
        return;
    }

    if (action === "state-reset") {
        handleResetData();
        return;
    }

    if (action === "upgrade-adjust") {
        const upgradeKey = button.dataset.upgradeKey;
        const delta = toInteger(button.dataset.delta, 0);
        if (upgradeKey && delta !== 0) {
            adjustUpgradeLevel(upgradeKey, delta);
            commitStateMutation({ reason: `dev-upgrade-${upgradeKey}`, runAutoProgression: true });
        }
        return;
    }

    if (action === "upgrade-trigger") {
        const upgradeId = button.dataset.upgradeId;
        const ok = triggerUpgradeById(upgradeId);

        if (!ok) {
            setDevPanelMessage(`Failed to apply upgrade: ${upgradeId}`);
            renderDevToolsUI();
            return;
        }

        commitStateMutation({ reason: `dev-upgrade-trigger-${upgradeId}`, runAutoProgression: true });
        return;
    }

    if (action === "progress-adjust") {
        const track = button.dataset.track;
        const delta = toInteger(button.dataset.delta, 0);

        if (track && delta !== 0) {
            adjustProgressTrack(track, delta);
            commitStateMutation({ reason: `dev-progress-${track}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "progress-set") {
        const track = button.dataset.track;
        const panel = getDevToolsElements().devToolsPanel;
        const input = panel?.querySelector?.(`input[data-progress-track="${track}"]`);

        if (track && input) {
            setProgressTrack(track, input.value);
            commitStateMutation({ reason: `dev-progress-set-${track}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "merchant-unlock") {
        const merchantId = button.dataset.merchantId;
        if (merchantId) {
            unlockMerchant(merchantId);
            commitStateMutation({ reason: `dev-merchant-unlock-${merchantId}`, runAutoProgression: true });
        }
        return;
    }

    if (action === "merchant-lock") {
        const merchantId = button.dataset.merchantId;
        if (merchantId) {
            lockMerchant(merchantId);
            commitStateMutation({ reason: `dev-merchant-lock-${merchantId}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "merchant-spawn") {
        const merchantId = button.dataset.merchantId;
        if (merchantId) {
            spawnMerchantNow(merchantId);
            commitStateMutation({ reason: `dev-merchant-spawn-${merchantId}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "merchant-despawn") {
        const merchantId = button.dataset.merchantId;
        if (merchantId) {
            despawnMerchantNow(merchantId);
            commitStateMutation({ reason: `dev-merchant-despawn-${merchantId}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "merchant-sales-adjust") {
        const merchantId = button.dataset.merchantId;
        const delta = toInteger(button.dataset.delta, 0);

        if (merchantId && delta !== 0) {
            adjustMerchantSales(merchantId, delta);
            commitStateMutation({ reason: `dev-merchant-sales-${merchantId}`, runAutoProgression: true });
        }
        return;
    }

    if (action === "merchant-level-adjust") {
        const merchantId = button.dataset.merchantId;
        const delta = toInteger(button.dataset.delta, 0);

        if (merchantId && delta !== 0) {
            adjustMerchantLevel(merchantId, delta);
            commitStateMutation({ reason: `dev-merchant-level-${merchantId}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "merchant-reset") {
        const merchantId = button.dataset.merchantId;
        if (merchantId) {
            resetMerchantState(merchantId);
            commitStateMutation({ reason: `dev-merchant-reset-${merchantId}`, runAutoProgression: false });
        }
        return;
    }

    if (action === "merchant-unlock-all") {
        unlockAllMerchants();
        commitStateMutation({ reason: "dev-merchant-unlock-all", runAutoProgression: true });
        return;
    }

    if (action === "merchant-despawn-all") {
        despawnAllMerchants();
        commitStateMutation({ reason: "dev-merchant-despawn-all", runAutoProgression: false });
        return;
    }

    if (action === "merchant-reset-all") {
        resetAllMerchants();
        commitStateMutation({ reason: "dev-merchant-reset-all", runAutoProgression: false });
        return;
    }

    if (action === "display-preset") {
        const preset = button.dataset.preset;
        if (preset === "phone" || preset === "tablet" || preset === "desktop") {
            setDisplayPreset(preset);
        }
        return;
    }

    if (action === "display-reset") {
        handleDisplayReset();
    }
}

function renderDisplaySection(elements) {
    const dimensions = getPresetDimensions(displayConfig.preset);

    if (elements.devViewportPhoneBtn) {
        elements.devViewportPhoneBtn.setAttribute("aria-pressed", String(displayConfig.preset === "phone"));
    }

    if (elements.devViewportTabletBtn) {
        elements.devViewportTabletBtn.setAttribute("aria-pressed", String(displayConfig.preset === "tablet"));
    }

    if (elements.devViewportDesktopBtn) {
        elements.devViewportDesktopBtn.setAttribute("aria-pressed", String(displayConfig.preset === "desktop"));
    }

    if (elements.devAppSizeValue) {
        elements.devAppSizeValue.textContent = dimensions.label;
    }

    if (elements.devUiScaleInput) {
        elements.devUiScaleInput.value = String(displayConfig.uiScale);
    }

    if (elements.devUiScaleValue) {
        elements.devUiScaleValue.textContent = formatNumber(displayConfig.uiScale, 2);
    }

    if (elements.devMarimoScaleInput) {
        elements.devMarimoScaleInput.value = String(displayConfig.marimoScale);
    }

    if (elements.devMarimoScaleValue) {
        elements.devMarimoScaleValue.textContent = formatNumber(displayConfig.marimoScale, 2);
    }

    if (elements.devCanvasWidthInput) {
        elements.devCanvasWidthInput.value = String(displayConfig.basketCanvasWidth);
    }

    if (elements.devCanvasWidthValue) {
        elements.devCanvasWidthValue.textContent = `${Math.round(displayConfig.basketCanvasWidth)}px`;
    }

    if (elements.devCanvasHeightInput) {
        elements.devCanvasHeightInput.value = String(displayConfig.basketCanvasHeight);
    }

    if (elements.devCanvasHeightValue) {
        elements.devCanvasHeightValue.textContent = `${Math.round(displayConfig.basketCanvasHeight)}px`;
    }

    if (elements.devCanvasDprInput) {
        elements.devCanvasDprInput.value = String(displayConfig.basketCanvasDpr);
    }

    if (elements.devCanvasDprValue) {
        elements.devCanvasDprValue.textContent = formatNumber(displayConfig.basketCanvasDpr, 2);
    }
}

function renderDevToolsUI() {
    ensureDevToolsUI();
    const elements = getDevToolsElements();

    if (elements.devToolsToggleBtn) {
        elements.devToolsToggleBtn.textContent = devToolsOpen ? "Close Dev Tools" : "Open Dev Tools";
    }

    if (elements.devToolsPanel) {
        elements.devToolsPanel.classList.toggle("hidden", !devToolsOpen);
    }

    if (elements.devShellsValue) {
        const shells = Number.isFinite(state.currency?.shells) ? Math.max(0, Math.round(state.currency.shells)) : 0;
        elements.devShellsValue.textContent = String(shells);
    }

    renderDevPanelMessage();
    renderUpgradeSection(elements);
    renderProgressionSection(elements);
    renderMerchantSection(elements);
    renderDisplaySection(elements);
}

function bindDevToolEvents() {
    ensureDevToolsUI();
    const elements = getDevToolsElements();

    if (elements.devToolsToggleBtn && elements.devToolsToggleBtn.dataset.listenerBound !== "true") {
        elements.devToolsToggleBtn.addEventListener("click", () => {
            devToolsOpen = !devToolsOpen;
            renderDevToolsUI();
        });
        elements.devToolsToggleBtn.dataset.listenerBound = "true";
    }

    if (elements.devToolsPanel && elements.devToolsPanel.dataset.clickBound !== "true") {
        elements.devToolsPanel.addEventListener("click", (event) => {
            const button = event.target?.closest?.("button[data-action]");
            if (!button) {
                return;
            }

            runActionFromButton(button);
        });

        elements.devToolsPanel.dataset.clickBound = "true";
    }

    if (elements.devToolsPanel && elements.devToolsPanel.dataset.inputBound !== "true") {
        elements.devToolsPanel.addEventListener("input", (event) => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement)) {
                return;
            }

            const displayKey = input.dataset.displayKey;
            if (!displayKey) {
                return;
            }

            updateDisplayConfigFromInput(displayKey, toNumber(input.value, displayConfig[displayKey]));
        });

        elements.devToolsPanel.dataset.inputBound = "true";
    }

    if (window.__marimoDevToolsStateListenerBound !== true) {
        window.addEventListener(DEV_STATE_CHANGED_EVENT, () => {
            renderDevToolsUI();
        });
        window.__marimoDevToolsStateListenerBound = true;
    }
}

function mountDevTools() {
    ensureDevToolsUI();
    applyDisplayConfigToDocument();
    bindDevToolEvents();
    renderDevToolsUI();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountDevTools, { once: true });
} else {
    mountDevTools();
}
