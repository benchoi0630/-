// 파일 역할: 메인 페이지 마리모 PNG 회전 애니메이션과 rolling rate 제한을 함께 담당한다.
// 핵심 책임: 입력/자동 굴림을 회전 임펄스로 변환하고, source 무관 distance/sec 상한을 유지한다.
// 연동 범위: mainpageMainUI가 전달한 각도 적용 콜백과 성장 콜백 사이의 브리지 역할을 수행한다.

const ROLL_ARC_TO_VELOCITY_GAIN = 10;
// 단위: rolling surface distance/sec (성장 계산 기준 상한)
const ROLL_MAX_ABS_VELOCITY = 100;
// 거리 생성량은 유지하고, 시각 회전만 빠르게 보이게 하는 배율
const ROLL_VISUAL_SPEED_MULTIPLIER = 4;

const ROLL_DAMPING_PER_FRAME = 0.94;
// 단위: rolling surface distance/sec
const ROLL_STOP_VELOCITY_EPSILON = 6;
const ROLL_RATE_LIMIT_WINDOW_SECONDS = 1 / 20;
const ROLL_RATE_LIMIT_INITIAL_SECONDS = 1 / 60;
const MIN_ROLL_RADIUS_PX = 12;
const RADIAN_TO_DEGREE = 180 / Math.PI;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getNowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

export function createMainPageRollAnimator(options = {}) {
    const setMarimoRollAngle = typeof options.setMarimoRollAngle === "function"
        ? options.setMarimoRollAngle
        : () => {};
    const getMarimoRadiusPx = typeof options.getMarimoRadiusPx === "function"
        ? options.getMarimoRadiusPx
        : () => 60;
    const onManualRollingDistanceAbs = typeof options.onManualRollingDistanceAbs === "function"
        ? options.onManualRollingDistanceAbs
        : () => {};

    const limiterTokenCapacity = ROLL_MAX_ABS_VELOCITY * ROLL_RATE_LIMIT_WINDOW_SECONDS;
    const limiterInitialTokens = Math.min(
        limiterTokenCapacity,
        ROLL_MAX_ABS_VELOCITY * ROLL_RATE_LIMIT_INITIAL_SECONDS
    );

    let rollAngleDeg = 0;
    let manualRollVelocityDistancePerSec = 0;
    let ambientRollVelocityDistancePerSec = 0;
    let rollAnimationFrameId = null;
    let rollLastFrameTime = 0;
    let manualInputActive = false;
    let limiterAvailableTokens = limiterInitialTokens;
    let limiterLastRefillTimeMs = 0;

    function refillDistanceLimiter(nowMs) {
        if (!Number.isFinite(nowMs)) {
            return;
        }

        if (!Number.isFinite(limiterLastRefillTimeMs) || limiterLastRefillTimeMs <= 0) {
            limiterLastRefillTimeMs = nowMs;
            return;
        }

        const elapsedSeconds = Math.max(0, (nowMs - limiterLastRefillTimeMs) / 1000);
        limiterLastRefillTimeMs = nowMs;
        if (elapsedSeconds <= 0) {
            return;
        }

        const clampedElapsedSeconds = Math.min(elapsedSeconds, ROLL_RATE_LIMIT_WINDOW_SECONDS);
        limiterAvailableTokens = Math.min(
            limiterTokenCapacity,
            limiterAvailableTokens + (clampedElapsedSeconds * ROLL_MAX_ABS_VELOCITY)
        );
    }

    function consumeDistanceBudget(distanceAbs, nowMs = getNowMs()) {
        const safeDistanceAbs = Number.isFinite(distanceAbs) ? Math.max(0, distanceAbs) : 0;
        if (safeDistanceAbs <= 0) {
            return 0;
        }

        refillDistanceLimiter(nowMs);
        const consumedDistance = Math.min(safeDistanceAbs, limiterAvailableTokens);
        limiterAvailableTokens -= consumedDistance;
        return consumedDistance;
    }

    function consumeSignedDistanceBudget(signedDistance, nowMs = getNowMs()) {
        const safeSignedDistance = Number.isFinite(signedDistance) ? signedDistance : 0;
        if (safeSignedDistance === 0) {
            return {
                signedDistance: 0,
                distanceAbs: 0
            };
        }

        const consumedDistanceAbs = consumeDistanceBudget(Math.abs(safeSignedDistance), nowMs);
        return {
            signedDistance: Math.sign(safeSignedDistance) * consumedDistanceAbs,
            distanceAbs: consumedDistanceAbs
        };
    }

    function resetDistanceLimiter(nowMs = getNowMs()) {
        limiterAvailableTokens = limiterInitialTokens;
        limiterLastRefillTimeMs = Number.isFinite(nowMs) ? nowMs : 0;
    }

    function applyAngleDelta(deltaDegree) {
        if (!Number.isFinite(deltaDegree) || deltaDegree === 0) {
            return;
        }

        rollAngleDeg += deltaDegree;
        if (Math.abs(rollAngleDeg) > 10000) {
            rollAngleDeg %= 360;
        }
        setMarimoRollAngle(rollAngleDeg);
    }

    function getSafeRadiusPx() {
        const rawRadiusPx = getMarimoRadiusPx();
        return Math.max(MIN_ROLL_RADIUS_PX, Number.isFinite(rawRadiusPx) ? rawRadiusPx : MIN_ROLL_RADIUS_PX);
    }

    function convertDistanceToVisualDegree(distance, radiusPx) {
        const safeDistance = Number.isFinite(distance) ? distance : 0;
        const safeRadius = Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : MIN_ROLL_RADIUS_PX;
        return (safeDistance / safeRadius) * RADIAN_TO_DEGREE * ROLL_VISUAL_SPEED_MULTIPLIER;
    }

    function addImpulseToVelocity(source, impulse) {
        if (source === "manual") {
            manualRollVelocityDistancePerSec = clamp(
                manualRollVelocityDistancePerSec + impulse,
                -ROLL_MAX_ABS_VELOCITY,
                ROLL_MAX_ABS_VELOCITY
            );
        } else {
            ambientRollVelocityDistancePerSec = clamp(
                ambientRollVelocityDistancePerSec + impulse,
                -ROLL_MAX_ABS_VELOCITY,
                ROLL_MAX_ABS_VELOCITY
            );
        }

        const totalVelocity = manualRollVelocityDistancePerSec + ambientRollVelocityDistancePerSec;
        const clampedTotalVelocity = clamp(totalVelocity, -ROLL_MAX_ABS_VELOCITY, ROLL_MAX_ABS_VELOCITY);
        const overflow = totalVelocity - clampedTotalVelocity;
        if (overflow !== 0) {
            if (source === "manual") {
                manualRollVelocityDistancePerSec -= overflow;
            } else {
                ambientRollVelocityDistancePerSec -= overflow;
            }
        }
    }

    function stopRollAnimation() {
        if (rollAnimationFrameId !== null) {
            cancelAnimationFrame(rollAnimationFrameId);
            rollAnimationFrameId = null;
        }
        rollLastFrameTime = 0;
    }

    function clearRollingVisualState() {
        stopRollAnimation();
        rollAngleDeg = 0;
        manualRollVelocityDistancePerSec = 0;
        ambientRollVelocityDistancePerSec = 0;
        manualInputActive = false;
        resetDistanceLimiter();
        setMarimoRollAngle(0);
    }

    function stepRollAnimation(now) {
        const dt = rollLastFrameTime > 0
            ? clamp((now - rollLastFrameTime) / 1000, 0.001, 0.05)
            : (1 / 60);
        rollLastFrameTime = now;

        const manualDeltaDistance = manualInputActive ? 0 : (manualRollVelocityDistancePerSec * dt);
        const ambientDeltaDistance = ambientRollVelocityDistancePerSec * dt;
        const totalDeltaDistance = manualDeltaDistance + ambientDeltaDistance;
        if (totalDeltaDistance !== 0) {
            const safeRadiusPx = getSafeRadiusPx();
            const totalDeltaDegree = convertDistanceToVisualDegree(totalDeltaDistance, safeRadiusPx);
            applyAngleDelta(totalDeltaDegree);
        }

        if (!manualInputActive && manualDeltaDistance !== 0) {
            const consumedManualDistanceAbs = consumeDistanceBudget(Math.abs(manualDeltaDistance), now);
            if (consumedManualDistanceAbs > 0) {
                onManualRollingDistanceAbs(consumedManualDistanceAbs);
            }
        }

        const damping = Math.pow(ROLL_DAMPING_PER_FRAME, dt * 60);
        manualRollVelocityDistancePerSec *= damping;
        ambientRollVelocityDistancePerSec *= damping;

        if (
            Math.abs(manualRollVelocityDistancePerSec) <= ROLL_STOP_VELOCITY_EPSILON
            && Math.abs(ambientRollVelocityDistancePerSec) <= ROLL_STOP_VELOCITY_EPSILON
        ) {
            manualRollVelocityDistancePerSec = 0;
            ambientRollVelocityDistancePerSec = 0;
            rollAnimationFrameId = null;
            rollLastFrameTime = 0;
            return;
        }

        rollAnimationFrameId = requestAnimationFrame(stepRollAnimation);
    }

    function ensureRollAnimationRunning() {
        if (rollAnimationFrameId !== null) {
            return;
        }

        rollLastFrameTime = 0;
        rollAnimationFrameId = requestAnimationFrame(stepRollAnimation);
    }

    function resetRollingVisual() {
        ensureRollAnimationRunning();
    }

    function startManualRolling() {
        manualInputActive = true;
        ensureRollAnimationRunning();
    }

    function endManualRolling() {
        manualInputActive = false;
        ensureRollAnimationRunning();
    }

    function applyRollingVisual(rollingSurfaceDistance, options = {}) {
        const source = options.source === "manual" ? "manual" : "ambient";
        const limitedRolling = consumeSignedDistanceBudget(
            rollingSurfaceDistance,
            Number.isFinite(options.nowMs) ? options.nowMs : getNowMs()
        );
        if (limitedRolling.distanceAbs <= 0) {
            return limitedRolling;
        }

        const safeRadiusPx = getSafeRadiusPx();
        const deltaDegree = convertDistanceToVisualDegree(limitedRolling.signedDistance, safeRadiusPx);
        const impulse = limitedRolling.signedDistance * ROLL_ARC_TO_VELOCITY_GAIN;
        if (!Number.isFinite(impulse) || impulse === 0) {
            return {
                signedDistance: 0,
                distanceAbs: 0
            };
        }

        if (source === "manual" && manualInputActive) {
            // 포인터가 눌린 동안은 직접 드래그량만 즉시 반영하고 관성 이동은 멈춘다.
            applyAngleDelta(deltaDegree);
        }

        addImpulseToVelocity(source, impulse);
        ensureRollAnimationRunning();

        return limitedRolling;
    }

    return {
        startManualRolling,
        applyRollingVisual,
        endManualRolling,
        resetRollingVisual,
        clearRollingVisualState
    };
}
