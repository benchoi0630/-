// 파일 역할: 상인 오퍼 스펙 정규화와 매칭 규칙 평가 엔진을 제공한다.
// 핵심 책임: legacy 요구조건 변환, 오퍼 캐시 갱신, 창고 아이템 선택 로직을 처리한다.
// 연동 범위: 거래 가능 여부와 요구 텍스트 표현의 공통 기반 유틸 역할을 한다.

import { getMarimoType, getMarimoVolume } from "../utils/marimoData.js";

const DEFAULT_EXACT_TOLERANCE = 0.0001;
const MIN_EXACT_TOLERANCE = 0.000001;
const OFFER_MODES = new Set(["all_of", "any_of"]);
const RULE_KINDS = new Set(["any", "type", "volume_min", "volume_max", "volume_range", "volume_exact", "predicate"]);
const RULE_PICKS = new Set(["first", "smallest_volume", "largest_volume", "random"]);

function toSafeNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
}

function toSafePositiveInteger(value, fallback = 1) {
    const safe = Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.max(1, safe);
}

function normalizeMode(mode, fallbackMode = "all_of") {
    if (typeof mode === "string" && OFFER_MODES.has(mode)) {
        return mode;
    }
    return fallbackMode;
}

function normalizeKind(kind, fallbackKind = "any") {
    if (typeof kind === "string" && RULE_KINDS.has(kind)) {
        return kind;
    }
    return fallbackKind;
}

function normalizePick(pick, fallbackPick = "first") {
    if (typeof pick === "string" && RULE_PICKS.has(pick)) {
        return pick;
    }
    return fallbackPick;
}

function normalizeTypes(rawTypes, fallbackTypes = []) {
    const source = Array.isArray(rawTypes)
        ? rawTypes
        : (typeof rawTypes === "string" && rawTypes ? [rawTypes] : fallbackTypes);

    const unique = [];

    for (let i = 0; i < source.length; i += 1) {
        const candidate = source[i];
        if (typeof candidate !== "string") {
            continue;
        }

        const trimmed = candidate.trim();
        if (!trimmed || unique.includes(trimmed)) {
            continue;
        }

        unique.push(trimmed);
    }

    return unique;
}

function normalizeRange(minVolume, maxVolume) {
    if (!Number.isFinite(minVolume) && !Number.isFinite(maxVolume)) {
        return {
            minVolume: null,
            maxVolume: null
        };
    }

    const safeMin = Number.isFinite(minVolume) ? minVolume : maxVolume;
    const safeMax = Number.isFinite(maxVolume) ? maxVolume : minVolume;

    return safeMin <= safeMax
        ? {
            minVolume: safeMin,
            maxVolume: safeMax
        }
        : {
            minVolume: safeMax,
            maxVolume: safeMin
        };
}

function normalizeRuleSpec(rawRule, fallbackRule = null) {
    const raw = rawRule && typeof rawRule === "object" ? rawRule : {};
    const fallback = fallbackRule && typeof fallbackRule === "object" ? fallbackRule : {};

    const baseKind = normalizeKind(raw.kind, normalizeKind(fallback.kind, "any"));
    const baseCount = toSafePositiveInteger(raw.count, toSafePositiveInteger(fallback.count, 1));
    const basePick = normalizePick(raw.pick, normalizePick(fallback.pick, "first"));
    const types = normalizeTypes(
        Object.prototype.hasOwnProperty.call(raw, "types") ? raw.types : raw.type,
        normalizeTypes(
            Object.prototype.hasOwnProperty.call(fallback, "types") ? fallback.types : fallback.type,
            []
        )
    );
    const label = typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : (typeof fallback.label === "string" && fallback.label.trim() ? fallback.label.trim() : "");

    let normalized = {
        kind: baseKind,
        count: baseCount,
        pick: basePick,
        types: [],
        minVolume: null,
        maxVolume: null,
        exactVolume: null,
        tolerance: DEFAULT_EXACT_TOLERANCE,
        label
    };

    if (baseKind === "any") {
        return normalized;
    }

    if (baseKind === "type") {
        normalized.types = types;
        if (normalized.types.length <= 0) {
            normalized.kind = "any";
        }
        return normalized;
    }

    if (baseKind === "volume_min") {
        const minVolume = toSafeNumber(raw.minVolume, toSafeNumber(raw.value, toSafeNumber(raw.volume, toSafeNumber(fallback.minVolume, 0))));
        normalized.minVolume = minVolume;
        return normalized;
    }

    if (baseKind === "volume_max") {
        const maxVolume = toSafeNumber(raw.maxVolume, toSafeNumber(raw.value, toSafeNumber(raw.volume, toSafeNumber(fallback.maxVolume, 0))));
        normalized.maxVolume = maxVolume;
        return normalized;
    }

    if (baseKind === "volume_range") {
        const rawMin = toSafeNumber(raw.minVolume, toSafeNumber(raw.min, toSafeNumber(fallback.minVolume, Number.NaN)));
        const rawMax = toSafeNumber(raw.maxVolume, toSafeNumber(raw.max, toSafeNumber(fallback.maxVolume, Number.NaN)));
        const normalizedRange = normalizeRange(rawMin, rawMax);
        normalized.minVolume = normalizedRange.minVolume;
        normalized.maxVolume = normalizedRange.maxVolume;

        if (!Number.isFinite(normalized.minVolume) && !Number.isFinite(normalized.maxVolume)) {
            normalized.kind = "any";
        }
        return normalized;
    }

    if (baseKind === "volume_exact") {
        const exactVolume = toSafeNumber(raw.exactVolume, toSafeNumber(raw.targetVolume, toSafeNumber(raw.value, toSafeNumber(raw.volume, toSafeNumber(fallback.exactVolume, 0)))));
        const tolerance = Math.max(
            MIN_EXACT_TOLERANCE,
            toSafeNumber(raw.tolerance, toSafeNumber(fallback.tolerance, DEFAULT_EXACT_TOLERANCE))
        );
        normalized.exactVolume = exactVolume;
        normalized.tolerance = tolerance;
        return normalized;
    }

    if (baseKind === "predicate") {
        const exactVolume = toSafeNumber(raw.exactVolume, toSafeNumber(raw.targetVolume, toSafeNumber(fallback.exactVolume, Number.NaN)));
        const minVolume = toSafeNumber(raw.minVolume, toSafeNumber(raw.min, toSafeNumber(fallback.minVolume, Number.NaN)));
        const maxVolume = toSafeNumber(raw.maxVolume, toSafeNumber(raw.max, toSafeNumber(fallback.maxVolume, Number.NaN)));

        normalized.types = types;

        if (Number.isFinite(exactVolume)) {
            normalized.exactVolume = exactVolume;
            normalized.tolerance = Math.max(
                MIN_EXACT_TOLERANCE,
                toSafeNumber(raw.tolerance, toSafeNumber(fallback.tolerance, DEFAULT_EXACT_TOLERANCE))
            );
            return normalized;
        }

        const normalizedRange = normalizeRange(minVolume, maxVolume);
        normalized.minVolume = normalizedRange.minVolume;
        normalized.maxVolume = normalizedRange.maxVolume;

        const hasTypeConstraint = normalized.types.length > 0;
        const hasVolumeConstraint = Number.isFinite(normalized.minVolume) || Number.isFinite(normalized.maxVolume);

        if (!hasTypeConstraint && !hasVolumeConstraint) {
            normalized.kind = "any";
        }

        return normalized;
    }

    normalized.kind = "any";
    return normalized;
}

export function normalizeOfferSpec(rawOffer, fallbackOffer = null) {
    const raw = rawOffer && typeof rawOffer === "object" ? rawOffer : {};
    const fallback = fallbackOffer && typeof fallbackOffer === "object" ? fallbackOffer : {};
    const fallbackMode = normalizeMode(fallback.mode, "all_of");
    const mode = normalizeMode(raw.mode, fallbackMode);

    const fallbackRules = Array.isArray(fallback.rules) ? fallback.rules : [];
    const rawRules = Array.isArray(raw.rules) ? raw.rules : fallbackRules;
    const normalizedRules = [];

    for (let i = 0; i < rawRules.length; i += 1) {
        normalizedRules.push(normalizeRuleSpec(rawRules[i], fallbackRules[i]));
    }

    if (normalizedRules.length <= 0) {
        normalizedRules.push(normalizeRuleSpec({ kind: "any", count: 1 }));
    }

    return {
        mode,
        rules: normalizedRules
    };
}

export function normalizeOptionalOfferSpec(rawOffer, fallbackOffer = null) {
    const hasRawOffer = rawOffer && typeof rawOffer === "object";
    const hasFallbackOffer = fallbackOffer && typeof fallbackOffer === "object";

    if (!hasRawOffer && !hasFallbackOffer) {
        return null;
    }

    return normalizeOfferSpec(hasRawOffer ? rawOffer : null, hasFallbackOffer ? fallbackOffer : null);
}

export function createOfferFromLegacyRequirements(requirements) {
    const safeRequirements = requirements && typeof requirements === "object" ? requirements : {};
    const count = toSafePositiveInteger(safeRequirements.count, 1);
    const volume = toSafeNumber(safeRequirements.volume, Number.NaN);

    if (Number.isFinite(volume)) {
        return normalizeOfferSpec({
            mode: "all_of",
            rules: [
                {
                    kind: "volume_exact",
                    count,
                    exactVolume: volume,
                    tolerance: DEFAULT_EXACT_TOLERANCE
                }
            ]
        });
    }

    return normalizeOfferSpec({
        mode: "all_of",
        rules: [
            {
                kind: "any",
                count
            }
        ]
    });
}

function buildOfferFromMerchant(currentState, merchant, merchantState, now, reason) {
    if (merchant && typeof merchant.getOfferSpec === "function") {
        const offer = merchant.getOfferSpec(currentState, merchantState, now, reason);
        return normalizeOfferSpec(offer);
    }

    if (merchant && typeof merchant.getRequirements === "function") {
        return createOfferFromLegacyRequirements(merchant.getRequirements(currentState, merchantState));
    }

    return createOfferFromLegacyRequirements(null);
}

export function clearMerchantOfferSpec(merchantState) {
    if (!merchantState || typeof merchantState !== "object") {
        return;
    }

    merchantState.activeOffer = null;
}

export function resolveMerchantOfferSpec(currentState, merchant, merchantState, now) {
    if (!merchantState || typeof merchantState !== "object") {
        return createOfferFromLegacyRequirements(null);
    }

    if (merchantState.activeOffer && typeof merchantState.activeOffer === "object") {
        merchantState.activeOffer = normalizeOfferSpec(merchantState.activeOffer);
        return merchantState.activeOffer;
    }

    const nextOffer = buildOfferFromMerchant(currentState, merchant, merchantState, now, "resolve");
    merchantState.activeOffer = nextOffer;
    return nextOffer;
}

export function refreshMerchantOfferSpec(currentState, merchant, merchantState, now, reason = "refresh") {
    if (!merchantState || typeof merchantState !== "object") {
        return createOfferFromLegacyRequirements(null);
    }

    const nextOffer = buildOfferFromMerchant(currentState, merchant, merchantState, now, reason);
    merchantState.activeOffer = nextOffer;
    return nextOffer;
}

function matchesTypeConstraint(rule, item) {
    if (!Array.isArray(rule.types) || rule.types.length <= 0) {
        return true;
    }

    const itemType = getMarimoType(item);
    return rule.types.includes(itemType);
}

function matchesExactVolume(rule, itemVolume) {
    if (!Number.isFinite(rule.exactVolume)) {
        return true;
    }

    const tolerance = Number.isFinite(rule.tolerance) ? Math.max(MIN_EXACT_TOLERANCE, rule.tolerance) : DEFAULT_EXACT_TOLERANCE;
    return Math.abs(itemVolume - rule.exactVolume) <= tolerance;
}

function matchesRangeVolume(rule, itemVolume) {
    if (Number.isFinite(rule.minVolume) && itemVolume < rule.minVolume) {
        return false;
    }

    if (Number.isFinite(rule.maxVolume) && itemVolume > rule.maxVolume) {
        return false;
    }

    return true;
}

function ruleMatchesItem(rule, item) {
    const itemVolume = getMarimoVolume(item);

    if (rule.kind === "any") {
        return true;
    }

    if (rule.kind === "type") {
        return matchesTypeConstraint(rule, item);
    }

    if (rule.kind === "volume_min") {
        return itemVolume >= toSafeNumber(rule.minVolume, 0);
    }

    if (rule.kind === "volume_max") {
        return itemVolume <= toSafeNumber(rule.maxVolume, 0);
    }

    if (rule.kind === "volume_range") {
        return matchesRangeVolume(rule, itemVolume);
    }

    if (rule.kind === "volume_exact") {
        return matchesExactVolume(rule, itemVolume);
    }

    if (rule.kind === "predicate") {
        if (!matchesTypeConstraint(rule, item)) {
            return false;
        }

        if (Number.isFinite(rule.exactVolume)) {
            return matchesExactVolume(rule, itemVolume);
        }

        return matchesRangeVolume(rule, itemVolume);
    }

    return false;
}

function shuffleCandidates(candidates) {
    const shuffled = [...candidates];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const swapIndex = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i];
        shuffled[i] = shuffled[swapIndex];
        shuffled[swapIndex] = temp;
    }

    return shuffled;
}

function sortCandidatesByVolume(candidates, direction = "asc") {
    const sorted = [...candidates];
    sorted.sort((left, right) => {
        const leftVolume = getMarimoVolume(left.item);
        const rightVolume = getMarimoVolume(right.item);

        if (leftVolume !== rightVolume) {
            return direction === "desc" ? rightVolume - leftVolume : leftVolume - rightVolume;
        }

        return left.index - right.index;
    });

    return sorted;
}

function arrangeCandidatesForPick(candidates, pick) {
    if (pick === "smallest_volume") {
        return sortCandidatesByVolume(candidates, "asc");
    }

    if (pick === "largest_volume") {
        return sortCandidatesByVolume(candidates, "desc");
    }

    if (pick === "random") {
        return shuffleCandidates(candidates);
    }

    return [...candidates].sort((left, right) => left.index - right.index);
}

function collectRuleMatches(warehouse, rule, excludedIndexes) {
    const candidates = [];

    for (let i = 0; i < warehouse.length; i += 1) {
        if (excludedIndexes && excludedIndexes.has(i)) {
            continue;
        }

        const item = warehouse[i];
        if (ruleMatchesItem(rule, item)) {
            candidates.push({ index: i, item });
        }
    }

    const arranged = arrangeCandidatesForPick(candidates, rule.pick);
    const requiredCount = toSafePositiveInteger(rule.count, 1);

    if (arranged.length < requiredCount) {
        return {
            ok: false,
            selectedIndexes: []
        };
    }

    return {
        ok: true,
        selectedIndexes: arranged.slice(0, requiredCount).map((entry) => entry.index)
    };
}

function getRuleSpecificityScore(rule) {
    if (rule.kind === "volume_exact") {
        return 8;
    }

    if (rule.kind === "volume_range") {
        return 7;
    }

    if (rule.kind === "predicate") {
        let score = 1;

        if (Array.isArray(rule.types) && rule.types.length > 0) {
            score += 2;
        }

        if (Number.isFinite(rule.exactVolume)) {
            score += 6;
            return score;
        }

        if (Number.isFinite(rule.minVolume)) {
            score += 3;
        }

        if (Number.isFinite(rule.maxVolume)) {
            score += 3;
        }

        return score;
    }

    if (rule.kind === "volume_min" || rule.kind === "volume_max") {
        return 5;
    }

    if (rule.kind === "type") {
        return 4;
    }

    return 1;
}

function collectAllOfMatches(warehouse, normalizedOffer) {
    const executionOrder = normalizedOffer.rules
        .map((rule, index) => ({ rule, index }))
        .sort((left, right) => {
            const specificityDiff = getRuleSpecificityScore(right.rule) - getRuleSpecificityScore(left.rule);
            if (specificityDiff !== 0) {
                return specificityDiff;
            }

            const countDiff = toSafePositiveInteger(right.rule.count, 1) - toSafePositiveInteger(left.rule.count, 1);
            if (countDiff !== 0) {
                return countDiff;
            }

            return left.index - right.index;
        });

    const excludedIndexes = new Set();
    const selectedIndexes = [];

    for (let i = 0; i < executionOrder.length; i += 1) {
        const { rule } = executionOrder[i];
        const matched = collectRuleMatches(warehouse, rule, excludedIndexes);

        if (!matched.ok) {
            return {
                ok: false,
                selectedIndexes: []
            };
        }

        for (let j = 0; j < matched.selectedIndexes.length; j += 1) {
            const index = matched.selectedIndexes[j];
            excludedIndexes.add(index);
            selectedIndexes.push(index);
        }
    }

    const uniqueSortedIndexes = [...new Set(selectedIndexes)].sort((left, right) => left - right);
    return {
        ok: true,
        selectedIndexes: uniqueSortedIndexes
    };
}

function collectAnyOfMatches(warehouse, normalizedOffer) {
    for (let i = 0; i < normalizedOffer.rules.length; i += 1) {
        const rule = normalizedOffer.rules[i];
        const matched = collectRuleMatches(warehouse, rule, null);

        if (!matched.ok) {
            continue;
        }

        const uniqueSortedIndexes = [...new Set(matched.selectedIndexes)].sort((left, right) => left - right);
        return {
            ok: true,
            selectedIndexes: uniqueSortedIndexes
        };
    }

    return {
        ok: false,
        selectedIndexes: []
    };
}

export function collectWarehouseIndicesForOffer(warehouse, offerSpec) {
    const safeWarehouse = Array.isArray(warehouse) ? warehouse : [];
    const normalizedOffer = normalizeOfferSpec(offerSpec);
    const matched = normalizedOffer.mode === "any_of"
        ? collectAnyOfMatches(safeWarehouse, normalizedOffer)
        : collectAllOfMatches(safeWarehouse, normalizedOffer);

    return {
        ok: matched.ok,
        selectedIndexes: matched.selectedIndexes,
        offerSpec: normalizedOffer
    };
}

export function consumeWarehouseByOffer(currentState, offerSpec) {
    if (!currentState || !Array.isArray(currentState.warehouse)) {
        return {
            ok: false,
            consumedIndexes: [],
            offerSpec: normalizeOfferSpec(offerSpec)
        };
    }

    const matched = collectWarehouseIndicesForOffer(currentState.warehouse, offerSpec);

    if (!matched.ok) {
        return {
            ok: false,
            consumedIndexes: [],
            offerSpec: matched.offerSpec
        };
    }

    const descendingIndexes = [...matched.selectedIndexes].sort((left, right) => right - left);
    for (let i = 0; i < descendingIndexes.length; i += 1) {
        currentState.warehouse.splice(descendingIndexes[i], 1);
    }

    return {
        ok: true,
        consumedIndexes: matched.selectedIndexes,
        offerSpec: matched.offerSpec
    };
}

function formatVolumeValue(value) {
    if (!Number.isFinite(value)) {
        return "0";
    }

    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
}

function describeRuleBody(rule) {
    if (typeof rule.label === "string" && rule.label) {
        return rule.label;
    }

    if (rule.kind === "any") {
        return "any marimo";
    }

    if (rule.kind === "type") {
        return rule.types.length > 0 ? `type ${rule.types.join("/")}` : "any type";
    }

    if (rule.kind === "volume_min") {
        return `volume >= ${formatVolumeValue(rule.minVolume)}`;
    }

    if (rule.kind === "volume_max") {
        return `volume <= ${formatVolumeValue(rule.maxVolume)}`;
    }

    if (rule.kind === "volume_range") {
        return `volume ${formatVolumeValue(rule.minVolume)} ~ ${formatVolumeValue(rule.maxVolume)}`;
    }

    if (rule.kind === "volume_exact") {
        return `volume ${formatVolumeValue(rule.exactVolume)} ± ${formatVolumeValue(rule.tolerance)}`;
    }

    if (rule.kind === "predicate") {
        const parts = [];

        if (rule.types.length > 0) {
            parts.push(`type ${rule.types.join("/")}`);
        }

        if (Number.isFinite(rule.exactVolume)) {
            parts.push(`volume ${formatVolumeValue(rule.exactVolume)} ± ${formatVolumeValue(rule.tolerance)}`);
        } else {
            if (Number.isFinite(rule.minVolume)) {
                parts.push(`volume >= ${formatVolumeValue(rule.minVolume)}`);
            }

            if (Number.isFinite(rule.maxVolume)) {
                parts.push(`volume <= ${formatVolumeValue(rule.maxVolume)}`);
            }
        }

        if (parts.length <= 0) {
            return "any marimo";
        }

        return parts.join(" & ");
    }

    return "any marimo";
}

function describeRule(rule) {
    return `${toSafePositiveInteger(rule.count, 1)} x ${describeRuleBody(rule)}`;
}

export function describeOfferSpec(offerSpec) {
    const normalized = normalizeOfferSpec(offerSpec);
    const separator = normalized.mode === "any_of" ? " OR " : " + ";
    const parts = normalized.rules.map((rule) => describeRule(rule));

    return parts.join(separator);
}
