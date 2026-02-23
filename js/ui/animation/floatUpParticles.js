// 파일 역할: 원점 요소에서 파티클 이미지를 생성해 위로 흩어지는 애니메이션을 실행한다.
// 핵심 책임: 레이어 생성/정리, 개별 파티클 수명, abort signal 취소를 관리한다.
// 연동 범위: 거래 완료 등 이벤트성 연출에서 재사용되는 파티클 유틸이다.

const PARTICLE_LAYER_ID = "floatUpParticleLayer";
const DEFAULT_AMOUNT = 10;

function toSafeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function pickRandom(list) {
    if (!Array.isArray(list) || list.length <= 0) {
        return null;
    }

    const index = Math.floor(Math.random() * list.length);
    return list[index];
}

function ensureLayer() {
    let layer = document.getElementById(PARTICLE_LAYER_ID);
    if (layer) {
        return layer;
    }

    layer = document.createElement("div");
    layer.id = PARTICLE_LAYER_ID;
    layer.style.position = "fixed";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.width = "100vw";
    layer.style.height = "100vh";
    layer.style.pointerEvents = "none";
    layer.style.overflow = "visible";
    layer.style.zIndex = "9998";
    document.body.appendChild(layer);
    return layer;
}

function removeLayerIfEmpty(layer) {
    if (!layer || layer.childElementCount > 0) {
        return;
    }

    if (layer.parentNode) {
        layer.parentNode.removeChild(layer);
    }
}

function getOriginPoint(params) {
    const originEl = params.originEl instanceof HTMLElement ? params.originEl : null;
    if (originEl) {
        const rect = originEl.getBoundingClientRect();
        return {
            x: rect.left + (rect.width / 2),
            y: rect.top + (rect.height / 2)
        };
    }

    const origin = params.origin;
    if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
        return {
            x: origin.x,
            y: origin.y
        };
    }

    return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
}

function createParticleNode(imageSrc) {
    const node = document.createElement("img");
    node.src = imageSrc;
    node.alt = "";
    node.decoding = "async";
    node.draggable = false;
    node.style.position = "fixed";
    node.style.left = "0";
    node.style.top = "0";
    node.style.pointerEvents = "none";
    node.style.userSelect = "none";
    node.style.transformOrigin = "center center";
    node.style.willChange = "transform, opacity, left, top";
    return node;
}

function animateSingleParticle(node, config, signal) {
    return new Promise((resolve) => {
        const startTime = performance.now();

        const tick = (now) => {
            if (!node.isConnected) {
                resolve();
                return;
            }

            if (signal?.aborted === true) {
                resolve();
                return;
            }

            const progress = Math.min(1, (now - startTime) / config.durationMs);
            const ease = 1 - ((1 - progress) ** 3);
            const wobble = Math.sin((progress * Math.PI * 2) + config.wobblePhase) * config.wobbleAmplitude * (1 - progress);

            const x = config.startX + ((config.endX - config.startX) * ease) + wobble;
            const y = config.startY + ((config.endY - config.startY) * ease);
            const alpha = 1 - progress;
            const scale = config.startScale + ((config.endScale - config.startScale) * ease);
            const rotateDeg = config.startRotateDeg + ((config.endRotateDeg - config.startRotateDeg) * ease);

            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            node.style.opacity = alpha.toFixed(3);
            node.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)}) rotate(${rotateDeg.toFixed(2)}deg)`;

            if (progress >= 1) {
                resolve();
                return;
            }

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    });
}

// 이 함수는 하나 이상의 이미지 파티클을 생성해 위로 떠오르며 사라지게 한다.
export function floatUpParticles(params = {}) {
    const imageSrcListRaw = Array.isArray(params.imageSrcList) ? params.imageSrcList : [];
    const singleImageSrc = typeof params.imageSrc === "string" ? params.imageSrc : "";
    const imageSrcList = imageSrcListRaw
        .filter((src) => typeof src === "string" && src.length > 0);

    if (singleImageSrc.length > 0) {
        imageSrcList.push(singleImageSrc);
    }

    const onDone = typeof params.onDone === "function" ? params.onDone : null;
    const signal = params.signal;
    if (imageSrcList.length <= 0) {
        if (onDone) {
            onDone();
        }
        return Promise.resolve();
    }

    if (signal?.aborted === true) {
        if (onDone) {
            onDone();
        }
        return Promise.resolve();
    }

    const amount = Math.max(1, Math.round(toSafeNumber(params.amount, DEFAULT_AMOUNT)));
    const origin = getOriginPoint(params);
    const spreadRadius = Math.max(0, toSafeNumber(params.spreadRadius, 22));
    const sizeMin = Math.max(4, toSafeNumber(params.sizeMin, 12));
    const sizeMax = Math.max(sizeMin, toSafeNumber(params.sizeMax, 22));
    const riseMin = Math.max(10, toSafeNumber(params.riseMin, 36));
    const riseMax = Math.max(riseMin, toSafeNumber(params.riseMax, 88));
    const driftX = Math.abs(toSafeNumber(params.driftX, 34));
    const durationMin = Math.max(120, toSafeNumber(params.durationMinMs, 460));
    const durationMax = Math.max(durationMin, toSafeNumber(params.durationMaxMs, 920));
    const layer = ensureLayer();
    const jobs = [];

    for (let i = 0; i < amount; i += 1) {
        const imageSrc = pickRandom(imageSrcList);
        if (!imageSrc) {
            continue;
        }

        const node = createParticleNode(imageSrc);
        node.style.width = `${randomBetween(sizeMin, sizeMax)}px`;
        node.style.height = "auto";
        layer.appendChild(node);

        const startX = origin.x + randomBetween(-spreadRadius, spreadRadius);
        const startY = origin.y + randomBetween(-spreadRadius * 0.4, spreadRadius * 0.4);
        const endX = startX + randomBetween(-driftX, driftX);
        const endY = startY - randomBetween(riseMin, riseMax);

        const config = {
            startX,
            startY,
            endX,
            endY,
            durationMs: randomBetween(durationMin, durationMax),
            startScale: randomBetween(0.75, 1.05),
            endScale: randomBetween(0.5, 0.95),
            startRotateDeg: randomBetween(-18, 18),
            endRotateDeg: randomBetween(-96, 96),
            wobblePhase: randomBetween(0, Math.PI * 2),
            wobbleAmplitude: randomBetween(2, 7)
        };

        const job = animateSingleParticle(node, config, signal).finally(() => {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        });
        jobs.push(job);
    }

    return Promise.all(jobs).then(() => {
        removeLayerIfEmpty(layer);
        if (onDone) {
            onDone();
        }
    });
}
