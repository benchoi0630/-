// 파일 역할: 메인 페이지 마리모 PNG 회전 애니메이션 계산을 전담하는 모듈이다.
// 핵심 책임: 드래그 입력을 회전 임펄스로 변환하고 감쇠 프레임 루프로 각도를 갱신한다.
// 연동 범위: mainpageMainUI가 전달한 각도 적용 콜백으로 렌더 레이어 회전을 제어한다.

const ROLL_ARC_TO_VELOCITY_GAIN = 18;
const ROLL_MAX_ABS_VELOCITY = 800;
const ROLL_DAMPING_PER_FRAME = 0.94;
const ROLL_STOP_VELOCITY_EPSILON = 6;
const MIN_ROLL_RADIUS_PX = 12;
const RADIAN_TO_DEGREE = 180 / Math.PI;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function createMainPageRollAnimator(options = {}) {
    const setMarimoRollAngle = typeof options.setMarimoRollAngle === "function"
        ? options.setMarimoRollAngle
        : () => {};
    const getMarimoRadiusPx = typeof options.getMarimoRadiusPx === "function"
        ? options.getMarimoRadiusPx
        : () => 60;

    let rollAngleDeg = 0;
    let rollVelocityDegPerSec = 0;
    let rollAnimationFrameId = null;
    let rollLastFrameTime = 0;

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
        rollVelocityDegPerSec = 0;
        setMarimoRollAngle(0);
    }

    function stepRollAnimation(now) {
        const dt = rollLastFrameTime > 0
            ? clamp((now - rollLastFrameTime) / 1000, 0.001, 0.05)
            : (1 / 60);
        rollLastFrameTime = now;

        rollAngleDeg += rollVelocityDegPerSec * dt;
        if (Math.abs(rollAngleDeg) > 10000) {
            rollAngleDeg %= 360;
        }
        setMarimoRollAngle(rollAngleDeg);

        const damping = Math.pow(ROLL_DAMPING_PER_FRAME, dt * 60);
        rollVelocityDegPerSec *= damping;

        if (Math.abs(rollVelocityDegPerSec) <= ROLL_STOP_VELOCITY_EPSILON) {
            rollVelocityDegPerSec = 0;
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

    function applyRollingVisual(rollingSurfaceDistance) {
        const safeRollingSurfaceDistance = Number.isFinite(rollingSurfaceDistance) ? rollingSurfaceDistance : 0;
        if (safeRollingSurfaceDistance === 0) {
            return;
        }

        const rawRadiusPx = getMarimoRadiusPx();
        const safeRadiusPx = Math.max(MIN_ROLL_RADIUS_PX, Number.isFinite(rawRadiusPx) ? rawRadiusPx : MIN_ROLL_RADIUS_PX);
        const deltaDegree = (safeRollingSurfaceDistance / safeRadiusPx) * RADIAN_TO_DEGREE;
        const impulse = deltaDegree * ROLL_ARC_TO_VELOCITY_GAIN;

        if (!Number.isFinite(impulse) || impulse === 0) {
            return;
        }

        rollVelocityDegPerSec = clamp(rollVelocityDegPerSec + impulse, -ROLL_MAX_ABS_VELOCITY, ROLL_MAX_ABS_VELOCITY);
        ensureRollAnimationRunning();
    }

    return {
        applyRollingVisual,
        resetRollingVisual,
        clearRollingVisualState
    };
}
