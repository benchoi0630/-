// 파일 역할: 설정 모달에서 폰트 테마를 선택하고 적용 상태를 유지하는 로직을 담당한다.

const UI_FONT_STORAGE_KEY = "marimoUiFont";
const UI_FONT_WEIGHT_STORAGE_KEY = "marimoUiFontWeight";
const DEFAULT_UI_FONT_KEY = "fredoka";
const DEFAULT_UI_FONT_WEIGHT = 600;
const MIN_UI_FONT_WEIGHT = 400;
const MAX_UI_FONT_WEIGHT = 800;
const UI_FONT_WEIGHT_STEP = 100;
const FONT_BUTTON_ACTIVE_CLASS = "setting-font-btn-active";

const UI_FONT_MAP = {
    fredoka: "\"Fredoka\", \"Nunito\", Arial, sans-serif",
    baloo2: "\"Baloo 2\", \"Nunito\", Arial, sans-serif",
    nunito: "\"Nunito\", Arial, sans-serif"
};

function normalizeFontKey(fontKey) {
    if (typeof fontKey !== "string") {
        return DEFAULT_UI_FONT_KEY;
    }

    const normalized = fontKey.trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(UI_FONT_MAP, normalized) ? normalized : DEFAULT_UI_FONT_KEY;
}

function readSavedFontKey() {
    try {
        return normalizeFontKey(localStorage.getItem(UI_FONT_STORAGE_KEY));
    } catch (error) {
        return DEFAULT_UI_FONT_KEY;
    }
}

function saveFontKey(fontKey) {
    try {
        localStorage.setItem(UI_FONT_STORAGE_KEY, fontKey);
    } catch (error) {
        void error;
    }
}

function normalizeFontWeight(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_UI_FONT_WEIGHT;
    }

    const snapped = Math.round(parsed / UI_FONT_WEIGHT_STEP) * UI_FONT_WEIGHT_STEP;
    return Math.min(MAX_UI_FONT_WEIGHT, Math.max(MIN_UI_FONT_WEIGHT, snapped));
}

function readSavedFontWeight() {
    try {
        return normalizeFontWeight(localStorage.getItem(UI_FONT_WEIGHT_STORAGE_KEY));
    } catch (error) {
        return DEFAULT_UI_FONT_WEIGHT;
    }
}

function saveFontWeight(fontWeight) {
    try {
        localStorage.setItem(UI_FONT_WEIGHT_STORAGE_KEY, String(normalizeFontWeight(fontWeight)));
    } catch (error) {
        void error;
    }
}

function applyFontKey(fontKey) {
    const normalizedFontKey = normalizeFontKey(fontKey);
    const fontFamily = UI_FONT_MAP[normalizedFontKey] || UI_FONT_MAP[DEFAULT_UI_FONT_KEY];
    document.documentElement.style.setProperty("--app-font-family", fontFamily);
    document.documentElement.dataset.uiFont = normalizedFontKey;
    return normalizedFontKey;
}

function applyFontWeight(fontWeight) {
    const normalizedFontWeight = normalizeFontWeight(fontWeight);
    document.documentElement.style.setProperty("--app-font-weight", String(normalizedFontWeight));
    return normalizedFontWeight;
}

function updateFontButtons(settingModal, currentFontKey) {
    if (!settingModal) {
        return;
    }

    const buttons = settingModal.querySelectorAll("[data-ui-font]");
    for (let i = 0; i < buttons.length; i += 1) {
        const button = buttons[i];
        const isActive = normalizeFontKey(button.dataset.uiFont) === currentFontKey;
        button.classList.toggle(FONT_BUTTON_ACTIVE_CLASS, isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
}

function getFontWeightLabel(fontWeight) {
    if (fontWeight >= 800) {
        return "Extra Bold";
    }
    if (fontWeight >= 700) {
        return "Bold";
    }
    if (fontWeight >= 600) {
        return "Semi Bold";
    }
    if (fontWeight >= 500) {
        return "Medium";
    }
    return "Regular";
}

function updateFontWeightControls(settingModal, fontWeight) {
    if (!settingModal) {
        return;
    }

    const rangeInput = settingModal.querySelector("#settingFontWeightRange");
    const valueText = settingModal.querySelector("#settingFontWeightValue");

    if (rangeInput) {
        rangeInput.value = String(fontWeight);
    }

    if (valueText) {
        valueText.textContent = `${fontWeight} (${getFontWeightLabel(fontWeight)})`;
    }
}

export function applySavedUIFont() {
    return {
        fontKey: applyFontKey(readSavedFontKey()),
        fontWeight: applyFontWeight(readSavedFontWeight())
    };
}

export function initUIChangeLogic(options = {}) {
    const settingModal = options.settingModal instanceof HTMLElement ? options.settingModal : document.getElementById("settingModal");
    const theme = applySavedUIFont();
    updateFontButtons(settingModal, theme.fontKey);
    updateFontWeightControls(settingModal, theme.fontWeight);

    if (!settingModal || settingModal.dataset.fontSettingBound === "true") {
        return;
    }

    const fontWeightRangeInput = settingModal.querySelector("#settingFontWeightRange");

    settingModal.addEventListener("click", (event) => {
        const targetButton = event.target?.closest?.("[data-ui-font]");
        if (!targetButton) {
            return;
        }

        const nextFontKey = applyFontKey(targetButton.dataset.uiFont);
        saveFontKey(nextFontKey);
        updateFontButtons(settingModal, nextFontKey);
    });

    if (fontWeightRangeInput) {
        fontWeightRangeInput.addEventListener("input", (event) => {
            const nextFontWeight = applyFontWeight(event.target?.value);
            saveFontWeight(nextFontWeight);
            updateFontWeightControls(settingModal, nextFontWeight);
        });
    }

    settingModal.dataset.fontSettingBound = "true";
}
