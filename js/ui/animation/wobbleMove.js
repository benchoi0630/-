// 파일 역할: 요소를 두 사각형 좌표 사이로 흔들리며 이동시키는 모션 유틸이다.
// 핵심 책임: 경로 보간, 각도 흔들림, duration 산정을 포함해 카드 이동 연출을 처리한다.
// 연동 범위: 상점 입장/퇴장 및 테스트 페이지에서 공통으로 쓰이는 이동 엔진이다.

const MOVE_PIXELS_PER_SECOND = 200;
const WOBBLE_SPEED = 0.9;
const DEFAULT_WOBBLE_ANGLE_DEG = 12;
const MIN_DURATION_MS = 120;

function toFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizeRect(rect) {
    const left = toFiniteNumber(rect?.left, 0);
    const top = toFiniteNumber(rect?.top, 0);
    const width = Math.max(1, toFiniteNumber(rect?.width, 1));
    const height = Math.max(1, toFiniteNumber(rect?.height, 1));
    return { left, top, width, height };
}

function lerp(start, end, t) {
    return start + (end - start) * t;
}

export function wobbleMove(params = {}) {
    const el = params.el;
    const onDone = typeof params.onDone === "function" ? params.onDone : null;

    return new Promise((resolve) => {
        if (!(el instanceof HTMLElement)) {
            if (onDone) {
                onDone();
            }
            resolve();
            return;
        }

        const fromRect = normalizeRect(params.fromRect);
        const toRect = normalizeRect(params.toRect);
        const moveSpeed = Math.max(1, toFiniteNumber(params.moveSpeed, MOVE_PIXELS_PER_SECOND));
        const wobbleAngleDeg = Math.max(0, toFiniteNumber(params.wobbleStrength, DEFAULT_WOBBLE_ANGLE_DEG));

        const dx = toRect.left - fromRect.left;
        const dy = toRect.top - fromRect.top;
        const distance = Math.hypot(dx, dy);
        const requestedDuration = Number.isFinite(params.duration) ? Math.max(MIN_DURATION_MS, Math.round(params.duration)) : null;
        const duration = distance <= 0
            ? 0
            : (requestedDuration !== null ? requestedDuration : Math.max(MIN_DURATION_MS, Math.round((distance / moveSpeed) * 1000)));

        const startTime = performance.now();
        let done = false;

        const finish = () => {
            if (done) {
                return;
            }

            done = true;
            el.style.left = `${toRect.left}px`;
            el.style.top = `${toRect.top}px`;
            el.style.width = `${toRect.width}px`;
            el.style.height = `${toRect.height}px`;
            el.style.willChange = "";
            el.style.transform = "rotate(0deg)";

            if (onDone) {
                onDone();
            }
            resolve();
        };

        el.style.position = "fixed";
        el.style.left = `${fromRect.left}px`;
        el.style.top = `${fromRect.top}px`;
        el.style.width = `${fromRect.width}px`;
        el.style.height = `${fromRect.height}px`;
        el.style.margin = "0";
        el.style.pointerEvents = "none";
        el.style.willChange = "left, top, width, height, transform";
        el.style.transformOrigin = "center center";

        const tick = (now) => {
            if (!el.isConnected) {
                finish();
                return;
            }

            const rawProgress = duration <= 0 ? 1 : Math.min(1, (now - startTime) / duration);
            const elapsedSeconds = (now - startTime) / 1000;
            const wobbleAngle = Math.sin(elapsedSeconds * Math.PI * 2 * WOBBLE_SPEED) * wobbleAngleDeg;

            el.style.left = `${lerp(fromRect.left, fromRect.left + dx, rawProgress)}px`;
            el.style.top = `${lerp(fromRect.top, fromRect.top + dy, rawProgress)}px`;
            el.style.width = `${lerp(fromRect.width, toRect.width, rawProgress)}px`;
            el.style.height = `${lerp(fromRect.height, toRect.height, rawProgress)}px`;
            el.style.transform = `rotate(${wobbleAngle}deg)`;

            if (rawProgress >= 1) {
                finish();
                return;
            }

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    });
}
