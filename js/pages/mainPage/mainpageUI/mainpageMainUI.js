// 파일 역할: 메인 페이지의 핵심 DOM 렌더링과 사용자 피드백 UI를 담당한다.
// 핵심 책임: 메시지 표시, 영양제 표정, 굴림 시각 효과, split/send 컨트롤, 마리모 렌더를 처리한다.
// 연동 범위: logic 계층이 호출하는 UI API(`renderMainPage`, `setMainMessage` 등)를 제공한다.

import { state } from "../../../state.js";
import { hasMainMarimo } from "../../../utils/marimoData.js";
import { clearMarimoVisual, renderMarimoVisual } from "../../../ui/marimoRender.js";
import { createModalBase } from "../../../ui/modalBase.js";
import { createMainPageBackgroundUI } from "./mainPageBackgroundUI.js";
import { createMainPageRollAnimator } from "./mainPageRollAnimator.js";
import { getGrowthSnapshot } from "../mainpageLogic/growthEngine.js";

let clearMainMessageTimerId = null;
let fertilizerFaceTimerId = null;
let fertilizerFaceActive = false;
let splitCompleteModalBase = null;
let closeSplitCompleteModalTimerId = null;

const DEFAULT_FACE_VARIANT = 1;
const FERTILIZER_FACE_VARIANT = 2;
const FERTILIZER_FACE_DURATION_MS = 500;
const SPLIT_COMPLETE_MODAL_DURATION_MS = 1100;

function queryMainElements() {
    return {
        marimoArea: document.querySelector("#mainPage .marimo-area"),
        marimo: document.getElementById("marimo"),
        diameterText: document.getElementById("diameter-text"),
        volumeText: document.getElementById("volume-text"),
        splitBtn: document.getElementById("splitBtn"),
        splitControl: document.getElementById("splitControl"),
        splitVolumeText: document.getElementById("splitVolumeText"),
        splitUpBtn: document.getElementById("splitUpBtn"),
        splitDownBtn: document.getElementById("splitDownBtn"),
        sendToWarehouseBtn: document.getElementById("sendToWarehouseBtn"),
        splitCompleteModal: document.getElementById("splitCompleteModal"),
        mainMessage: document.getElementById("mainMessage"),
        mainNutritionBarWrap: document.getElementById("mainNutritionBarWrap"),
        mainNutritionBarFill: document.getElementById("mainNutritionBarFill"),
        mainNutritionBarText: document.getElementById("mainNutritionBarText")
    };
}

function resolveCssNumberFromRaw(rawValue, computedStyle, fallback, depth = 0) {
    if (depth > 8 || typeof rawValue !== "string") {
        return fallback;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return fallback;
    }

    const numericValue = Number.parseFloat(trimmed);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    const varMatch = trimmed.match(/^var\(\s*(--[A-Za-z0-9\-_]+)\s*(?:,\s*(.+))?\)$/);
    if (!varMatch) {
        return fallback;
    }

    const referencedTokenName = varMatch[1];
    const referencedRawValue = computedStyle.getPropertyValue(referencedTokenName);
    if (referencedRawValue && referencedRawValue.trim().length > 0) {
        return resolveCssNumberFromRaw(referencedRawValue, computedStyle, fallback, depth + 1);
    }

    const inlineFallbackRaw = varMatch[2];
    if (typeof inlineFallbackRaw === "string" && inlineFallbackRaw.trim().length > 0) {
        return resolveCssNumberFromRaw(inlineFallbackRaw, computedStyle, fallback, depth + 1);
    }

    return fallback;
}

function getCssNumberVariable(variableName, fallback) {
    if (
        typeof document === "undefined"
        || typeof HTMLElement === "undefined"
        || typeof getComputedStyle !== "function"
        || !(document.documentElement instanceof HTMLElement)
    ) {
        return fallback;
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const rawValue = computedStyle.getPropertyValue(variableName);
    return resolveCssNumberFromRaw(rawValue, computedStyle, fallback);
}

function getMainMarimoPixelScale() {
    const baseScale = getCssNumberVariable("--main-marimo-base-scale", 80);
    const uiScale = getCssNumberVariable("--ui-scale", 1);
    const marimoScale = getCssNumberVariable("--marimo-scale", 1);
    return Math.max(1, baseScale * uiScale * marimoScale);
}

export function createMainPageMainUI(options = {}) {
    const getSplitAmount = typeof options.getSplitAmount === "function" ? options.getSplitAmount : () => 1;
    const volumeToDiameter = typeof options.volumeToDiameter === "function" ? options.volumeToDiameter : () => 1;
    const isSendToWarehouseUnlocked = typeof options.isSendToWarehouseUnlocked === "function"
        ? options.isSendToWarehouseUnlocked
        : () => {
            const featureLevel = state.progression?.feature;
            return Number.isFinite(featureLevel) && featureLevel >= 1;
        };

    let mainElementsCache = null;
    const backgroundUI = createMainPageBackgroundUI();

    function getMainElements() {
        if (!mainElementsCache || !mainElementsCache.marimo) {
            mainElementsCache = queryMainElements();
        }

        return mainElementsCache;
    }

    function ensureSplitCompleteModalBase(elements) {
        if (splitCompleteModalBase || !(elements.splitCompleteModal instanceof HTMLElement)) {
            return;
        }

        splitCompleteModalBase = createModalBase({
            modalId: "splitCompleteModal",
            rootEl: elements.splitCompleteModal
        });
    }

    function showSplitCompleteModal() {
        const elements = getMainElements();
        ensureSplitCompleteModalBase(elements);
        if (!splitCompleteModalBase) {
            return;
        }

        splitCompleteModalBase.open();

        if (closeSplitCompleteModalTimerId) {
            clearTimeout(closeSplitCompleteModalTimerId);
        }

        closeSplitCompleteModalTimerId = setTimeout(() => {
            if (splitCompleteModalBase) {
                splitCompleteModalBase.close("auto");
            }
        }, SPLIT_COMPLETE_MODAL_DURATION_MS);
    }

    function setMarimoRollAngle(angleDeg) {
        const elements = getMainElements();
        if (!elements.marimo) {
            return;
        }

        elements.marimo.style.setProperty("--main-roll-angle", `${angleDeg.toFixed(2)}deg`);
    }

    function getMarimoRadiusPx() {
        const elements = getMainElements();
        if (!elements.marimo) {
            return 60;
        }

        const rect = elements.marimo.getBoundingClientRect();
        if (Number.isFinite(rect.width) && rect.width > 0) {
            return rect.width / 2;
        }

        const marimoSizeToken = Number.parseFloat(elements.marimo.style.getPropertyValue("--marimo-size"));
        if (Number.isFinite(marimoSizeToken) && marimoSizeToken > 0) {
            return marimoSizeToken / 2;
        }

        return 60;
    }

    const rollAnimator = createMainPageRollAnimator({
        setMarimoRollAngle,
        getMarimoRadiusPx
    });

    function setMainMessage(message) {
        const elements = getMainElements();

        if (!elements.mainMessage) {
            return;
        }

        elements.mainMessage.textContent = message;

        if (clearMainMessageTimerId) {
            clearTimeout(clearMainMessageTimerId);
        }

        if (!message) {
            return;
        }

        clearMainMessageTimerId = setTimeout(() => {
            const latestElements = getMainElements();
            if (latestElements.mainMessage) {
                latestElements.mainMessage.textContent = "";
            }
        }, 1200);
    }

    function ensureNutritionBar(elements) {
        if (!elements.marimoArea) {
            return null;
        }

        let barWrap = elements.mainNutritionBarWrap;
        let barFill = elements.mainNutritionBarFill;
        let barText = elements.mainNutritionBarText;

        if (!barWrap || !barFill || !barText) {
            barWrap = document.createElement("div");
            barWrap.id = "mainNutritionBarWrap";
            barWrap.className = "main-nutrition-bar-wrap";

            const barTrack = document.createElement("div");
            barTrack.className = "main-nutrition-bar-track";

            barFill = document.createElement("div");
            barFill.id = "mainNutritionBarFill";
            barFill.className = "main-nutrition-bar-fill";

            barText = document.createElement("p");
            barText.id = "mainNutritionBarText";
            barText.className = "main-nutrition-bar-text";

            barTrack.appendChild(barFill);
            barWrap.appendChild(barTrack);
            barWrap.appendChild(barText);
            elements.marimoArea.appendChild(barWrap);

            elements.mainNutritionBarWrap = barWrap;
            elements.mainNutritionBarFill = barFill;
            elements.mainNutritionBarText = barText;
        }

        return {
            barWrap,
            barFill,
            barText
        };
    }

    function renderNutritionBar(elements, visible) {
        const nutritionBar = ensureNutritionBar(elements);
        if (!nutritionBar) {
            return;
        }

        const growthSnapshot = getGrowthSnapshot(state);
        const maxNutrition = Number.isFinite(growthSnapshot.maxAccumulatedNutrition) ? Math.max(0, growthSnapshot.maxAccumulatedNutrition) : 0;
        const currentNutrition = Number.isFinite(growthSnapshot.accumulatedNutrition) ? Math.max(0, growthSnapshot.accumulatedNutrition) : 0;
        const shouldShow = visible && currentNutrition > 0;
        nutritionBar.barWrap.classList.toggle("hidden", !shouldShow);
        if (!shouldShow) {
            return;
        }

        const ratio = maxNutrition > 0 ? Math.max(0, Math.min(1, currentNutrition / maxNutrition)) : 0;

        nutritionBar.barFill.style.width = `${(ratio * 100).toFixed(2)}%`;
        nutritionBar.barText.textContent = `Stored nutrients ${Math.round(currentNutrition)} / ${Math.round(maxNutrition)}`;
    }

    function triggerFertilizerFaceExpression() {
        fertilizerFaceActive = true;

        if (fertilizerFaceTimerId) {
            clearTimeout(fertilizerFaceTimerId);
        }

        fertilizerFaceTimerId = setTimeout(() => {
            fertilizerFaceActive = false;
            renderMainPage();
        }, FERTILIZER_FACE_DURATION_MS);
    }

    function renderSplitControl(elements) {
        const sendToWarehouseUnlocked = isSendToWarehouseUnlocked();
        const splitAmount = getSplitAmount();

        if (elements.sendToWarehouseBtn) {
            elements.sendToWarehouseBtn.classList.toggle("hidden", !sendToWarehouseUnlocked);
        }

        if (elements.splitVolumeText) {
            elements.splitVolumeText.textContent = `volume: ${splitAmount}`;
        }

        if (elements.splitControl) {
            const unlocked = state.split.maxVolume > 1;
            elements.splitControl.classList.toggle("hidden", !unlocked);
        }
    }

    function renderMainPage() {
        const elements = getMainElements();
        if (!elements.marimo) {
            return;
        }

        backgroundUI.ensureMainBackgroundScene(elements);

        if (!hasMainMarimo(state)) {
            if (elements.diameterText) {
                elements.diameterText.textContent = "-";
            }

            if (elements.volumeText) {
                elements.volumeText.textContent = "-";
            }

            elements.marimo.style.setProperty("--marimo-size", "0px");
            clearMarimoVisual(elements.marimo);
            rollAnimator.clearRollingVisualState();
            renderNutritionBar(elements, false);
            renderSplitControl(elements);
            return;
        }

        const diameter = volumeToDiameter(state.marimo.volume);

        if (elements.diameterText) {
            elements.diameterText.textContent = diameter.toFixed(2);
        }

        if (elements.volumeText) {
            elements.volumeText.textContent = state.marimo.volume.toFixed(2);
        }

        const scale = getMainMarimoPixelScale();
        elements.marimo.style.setProperty("--marimo-size", `${scale * diameter}px`);

        renderMarimoVisual(elements.marimo, {
            marimo: state.marimo,
            showFace: true,
            faceVariant: fertilizerFaceActive ? FERTILIZER_FACE_VARIANT : DEFAULT_FACE_VARIANT
        });

        renderNutritionBar(elements, true);
        renderSplitControl(elements);
    }

    return {
        getMainElements,
        setMainMessage,
        showSplitCompleteModal,
        triggerFertilizerFaceExpression,
        applyRollingVisual: rollAnimator.applyRollingVisual,
        resetRollingVisual: rollAnimator.resetRollingVisual,
        renderMainPage
    };
}
