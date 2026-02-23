// 파일 역할: 요소에 짧은 찌그러짐-복원 바운스 애니메이션을 적용하는 유틸이다.
// 핵심 책임: 지속시간/탄성(stretch)/반복 횟수를 안전한 범위로 보정해 실행한다.
// 연동 범위: 클릭/거래 반응처럼 순간 피드백이 필요한 UI 효과에 사용된다.

const DEFAULT_DURATION_MS = 420;
const DEFAULT_STRETCH = 0.22;
const DEFAULT_ITERATIONS = 1;

function toSafeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

// 이 함수는 엘리먼트에 스쿼시&스트레치 기반 뾰요용 모션을 적용한다.
export function poyoBounce(params = {}) {
    const el = params.el;
    const onDone = typeof params.onDone === "function" ? params.onDone : null;
    const signal = params.signal;

    return new Promise((resolve) => {
        if (!(el instanceof HTMLElement)) {
            if (onDone) {
                onDone();
            }
            resolve();
            return;
        }

        if (signal?.aborted === true) {
            if (onDone) {
                onDone();
            }
            resolve();
            return;
        }

        const duration = Math.max(120, Math.round(toSafeNumber(params.duration, DEFAULT_DURATION_MS)));
        const stretch = clamp(toSafeNumber(params.stretch, DEFAULT_STRETCH), 0.06, 0.45);
        const iterations = Math.max(1, Math.round(toSafeNumber(params.iterations, DEFAULT_ITERATIONS)));

        if (typeof el.animate === "function") {
            const animation = el.animate([
                { transform: "scale3d(1, 1, 1)" },
                { offset: 0.2, transform: `scale3d(${(1 + (stretch * 0.95)).toFixed(4)}, ${(1 - (stretch * 0.75)).toFixed(4)}, 1)` },
                { offset: 0.4, transform: `scale3d(${(1 - (stretch * 0.52)).toFixed(4)}, ${(1 + (stretch * 0.55)).toFixed(4)}, 1)` },
                { offset: 0.62, transform: `scale3d(${(1 + (stretch * 0.24)).toFixed(4)}, ${(1 - (stretch * 0.2)).toFixed(4)}, 1)` },
                { offset: 0.82, transform: `scale3d(${(1 - (stretch * 0.11)).toFixed(4)}, ${(1 + (stretch * 0.1)).toFixed(4)}, 1)` },
                { transform: "scale3d(1, 1, 1)" }
            ], {
                duration,
                iterations,
                easing: "cubic-bezier(0.2, 0.8, 0.25, 1)"
            });

            const onAbort = () => {
                animation.cancel();
            };

            const finish = () => {
                animation.onfinish = null;
                animation.oncancel = null;
                if (signal) {
                    signal.removeEventListener("abort", onAbort);
                }
                if (onDone) {
                    onDone();
                }
                resolve();
            };

            if (signal) {
                signal.addEventListener("abort", onAbort, { once: true });
            }
            animation.onfinish = finish;
            animation.oncancel = finish;
            return;
        }

        // Web Animations API가 없는 환경에서는 간단한 fallback 애니메이션을 사용한다.
        const originalTransform = el.style.transform;
        const fallbackKeyframes = [
            "scale3d(1,1,1)",
            `scale3d(${1 + (stretch * 0.95)},${1 - (stretch * 0.75)},1)`,
            `scale3d(${1 - (stretch * 0.52)},${1 + (stretch * 0.55)},1)`,
            `scale3d(${1 + (stretch * 0.24)},${1 - (stretch * 0.2)},1)`,
            "scale3d(1,1,1)"
        ];

        let step = 0;
        const frameDuration = Math.max(50, Math.round(duration / fallbackKeyframes.length));

        const playStep = () => {
            if (!el.isConnected) {
                if (onDone) {
                    onDone();
                }
                resolve();
                return;
            }

            if (signal?.aborted === true) {
                el.style.transform = originalTransform;
                if (onDone) {
                    onDone();
                }
                resolve();
                return;
            }

            if (step >= fallbackKeyframes.length * iterations) {
                el.style.transform = originalTransform;
                if (onDone) {
                    onDone();
                }
                resolve();
                return;
            }

            const frameIndex = step % fallbackKeyframes.length;
            el.style.transform = fallbackKeyframes[frameIndex];
            step += 1;
            setTimeout(playStep, frameDuration);
        };

        playStep();
    });
}
