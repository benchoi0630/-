// 파일 역할: 진행도 트랙 상태를 갱신하고 레벨 전이 효과를 적용하는 핵심 로직이다.
// 핵심 책임: forward/rollback 처리, 알림 메시지 누적, 상태 정규화를 단일 흐름으로 관리한다.
// 연동 범위: 게임 기능 해금/비활성의 기준이 되는 progression 엔진을 제공한다.

import { progressionTrackDefs } from "./progrssionTracks.js";

// 이 파일은 트랙별 단계 정의를 기준으로 진행과 회귀를 관리한다.
const DEFAULT_LEVEL = 0;

function getTrackIds() {
    return Object.keys(progressionTrackDefs);
}

// 이 함수는 자동 조건을 평가해 진행도를 전진시키고 메시지를 반환한다.
// 실제 게임에서 progression 자동 해금은 이 함수만 사용한다.
export function applyProgression(currentState, reason) {
    void reason;

    normalizeProgressionState(currentState);
    const messages = applyAutomaticForward(currentState);
    appendNotifications(currentState, messages);

    return messages;
}

//한단계 전진
function applyAutomaticForward(currentState) {
    const messages = [];
    let changed = true;

    while (changed) {
        changed = false;
        const trackIds = getTrackIds();

        for (let i = 0; i < trackIds.length; i += 1) {
            const track = trackIds[i];
            const levels = getSortedLevels(track);
            const currentLevel = currentState.progression[track];
            const nextLevel = levels.find((levelDef) => levelDef.level === currentLevel + 1);

            if (!nextLevel || !nextLevel.condition(currentState)) {
                continue;
            }

            nextLevel.goForward(currentState);
            currentState.progression[track] = nextLevel.level;
            pushMessage(messages, nextLevel);
            changed = true;
        }
    }

    return messages;
}

// 이 함수는 개발자 툴에서 진행도를 수동 조정(증가/감소)할 때만 사용한다.
export function setProgression(currentState, track, nextValue, reason) {
    void reason;

    normalizeProgressionState(currentState);

    if (!progressionTrackDefs[track]) {
        return [];
    }

    const fromLevel = currentState.progression[track];
    const toLevel = Math.max(0, Math.round(nextValue));
    const messages = [];

    if (toLevel > fromLevel) {
        applyForwardTransition(currentState, track, fromLevel, toLevel, messages);
    } else if (toLevel < fromLevel) {
        applyRollbackTransition(currentState, track, fromLevel, toLevel);
    }

    currentState.progression[track] = toLevel;
    appendNotifications(currentState, messages);

    return messages;
}

//한단계 이상 전진
function applyForwardTransition(currentState, track, fromLevel, toLevel, messages) {
    const levels = getSortedLevels(track);

    for (let i = 0; i < levels.length; i += 1) {
        const levelDef = levels[i];
        if (levelDef.level <= fromLevel || levelDef.level > toLevel) {
            continue;
        }

        levelDef.goForward(currentState);
        pushMessage(messages, levelDef);
    }
}

//한단계 롤백
function applyRollbackTransition(currentState, track, fromLevel, toLevel) {
    const levels = getSortedLevels(track);

    for (let i = levels.length - 1; i >= 0; i -= 1) {
        const levelDef = levels[i];
        if (levelDef.level > fromLevel || levelDef.level <= toLevel) {
            continue;
        }

        levelDef.rollback(currentState);
    }
}

function assertLevelShape(track, levelDef, index) {
    const requiredKeys = ["level", "condition", "goForward", "rollback", "message"];
    const missingKey = requiredKeys.find((key) => Object.prototype.hasOwnProperty.call(levelDef, key) === false);

    if (missingKey) {
        throw new Error(`[progression] ${track}.levels[${index}] is missing key: ${missingKey}`);
    }

    if (!Number.isFinite(levelDef.level)) {
        throw new Error(`[progression] ${track}.levels[${index}].level must be a number`);
    }

    if (typeof levelDef.condition !== "function") {
        throw new Error(`[progression] ${track}.levels[${index}].condition must be a function`);
    }

    if (typeof levelDef.goForward !== "function") {
        throw new Error(`[progression] ${track}.levels[${index}].goForward must be a function`);
    }

    if (typeof levelDef.rollback !== "function") {
        throw new Error(`[progression] ${track}.levels[${index}].rollback must be a function`);
    }

    if (typeof levelDef.message !== "string") {
        throw new Error(`[progression] ${track}.levels[${index}].message must be a string`);
    }
}

function normalizeProgressionState(currentState) {
    if (!currentState.progression || typeof currentState.progression !== "object") {
        currentState.progression = {};
    }

    const trackIds = getTrackIds();
    for (let i = 0; i < trackIds.length; i += 1) {
        const track = trackIds[i];
        const rawLevel = currentState.progression[track];
        const normalized = Number.isFinite(rawLevel) ? Math.max(0, Math.round(rawLevel)) : DEFAULT_LEVEL;
        currentState.progression[track] = normalized;
    }

    if (!Array.isArray(currentState.notifications)) {
        currentState.notifications = [];
    }
}

function getSortedLevels(track) {
    const levels = Array.isArray(progressionTrackDefs[track]?.levels) ? progressionTrackDefs[track].levels : [];

    for (let i = 0; i < levels.length; i += 1) {
        assertLevelShape(track, levels[i], i);
    }

    return [...levels].sort((a, b) => a.level - b.level);
}

function appendNotifications(currentState, messages) {
    if (messages.length <= 0) {
        return;
    }

    currentState.notifications.push(...messages);
    currentState.notifications = currentState.notifications.slice(-20);
}

function pushMessage(messages, levelDef) {
    if (levelDef.message) {
        messages.push(levelDef.message);
    }
}