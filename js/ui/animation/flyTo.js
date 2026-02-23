// 파일 역할: 다수 아이콘을 출발 요소에서 목표 요소로 비행시키는 애니메이션 유틸이다.
// 핵심 책임: 아이콘 생성/이징 이동/팝 효과/오버플로 배지 표시를 포함해 연출을 완성한다.
// 연동 범위: 쉘 획득 HUD 이동 같은 보상 시각화에 공통으로 사용된다.

const DEFAULT_MAX_ICONS = 12;
const LAYER_ID = "shellFlyLayer";
const BASE_DURATION_MS = 300;
const DURATION_SPREAD_MS = 100;

function toSafeAmount(amount) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
        return 0;
    }

    return Math.max(0, Math.round(numericAmount));
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function easeOutCubic(t) {
    return 1 - ((1 - t) ** 3);
}

function ensureLayer() {
    let layer = document.getElementById(LAYER_ID);
    if (layer) {
        return layer;
    }

    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.style.position = "fixed";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.width = "100vw";
    layer.style.height = "100vh";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "9999";
    layer.style.overflow = "visible";
    document.body.appendChild(layer);
    return layer;
}

function getElementCenter(element) {
    if (!(element instanceof HTMLElement)) {
        return null;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) {
        return null;
    }

    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function createIconNode(imageSrc) {
    const node = document.createElement("img");
    node.src = imageSrc;
    node.alt = "";
    node.decoding = "async";
    node.draggable = false;
    node.style.position = "fixed";
    node.style.left = "0";
    node.style.top = "0";
    node.style.objectFit = "contain";
    node.style.userSelect = "none";
    node.style.pointerEvents = "none";
    node.style.filter = "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))";
    node.style.opacity = "1";
    node.style.transformOrigin = "center center";
    return node;
}

function createOverflowLabelNode(overflowCount) {
    const node = document.createElement("div");
    node.textContent = `+${overflowCount}`;
    node.style.position = "fixed";
    node.style.left = "0";
    node.style.top = "0";
    node.style.color = "#ffffff";
    node.style.fontWeight = "700";
    node.style.fontSize = "15px";
    node.style.textShadow = "0 2px 8px rgba(0, 0, 0, 0.45)";
    node.style.pointerEvents = "none";
    node.style.transformOrigin = "center center";
    return node;
}

function cleanupNode(node) {
    if (node && node.parentNode) {
        node.parentNode.removeChild(node);
    }
}

function removeLayerIfEmpty(layer) {
    if (!layer || layer.childElementCount > 0) {
        return;
    }

    if (layer.parentNode) {
        layer.parentNode.removeChild(layer);
    }
}

function runPopEffect(node) {
    if (!(node instanceof HTMLElement) || typeof node.animate !== "function") {
        return;
    }

    node.animate([
        { transform: "scale(0.35)", opacity: 0.75 },
        { offset: 0.58, transform: "scale(1.15)", opacity: 1 },
        { transform: "scale(1)", opacity: 1 }
    ], {
        duration: 220,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards"
    });
}

function createSpawnState(centerX, centerY, size) {
    return {
        x: centerX + randomBetween(-18, 18) - size / 2,
        y: centerY + randomBetween(-18, 18) - size / 2,
        size
    };
}

function createTargetState(centerX, centerY, size) {
    return {
        x: centerX + randomBetween(-10, 10) - size / 2,
        y: centerY + randomBetween(-10, 10) - size / 2,
        size
    };
}

function animateNode(node, fromState, toState, durationMs, wobbleStrength, wobbleSpeed) {
    return new Promise((resolve) => {
        const startTime = performance.now();

        node.style.left = `${fromState.x}px`;
        node.style.top = `${fromState.y}px`;
        node.style.width = `${fromState.size}px`;
        node.style.height = `${fromState.size}px`;

        const tick = (now) => {
            if (!node.isConnected) {
                resolve();
                return;
            }

            const rawProgress = Math.min(1, (now - startTime) / durationMs);
            const eased = easeOutCubic(rawProgress);
            const elapsedSeconds = (now - startTime) / 1000;
            const wobble = Math.sin(elapsedSeconds * Math.PI * 2 * wobbleSpeed) * wobbleStrength * (1 - eased);

            const x = fromState.x + ((toState.x - fromState.x) * eased) + wobble;
            const y = fromState.y + ((toState.y - fromState.y) * eased);
            const size = fromState.size + ((toState.size - fromState.size) * eased);

            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            node.style.width = `${size}px`;
            node.style.height = `${size}px`;

            if (rawProgress >= 1) {
                cleanupNode(node);
                resolve();
                return;
            }

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    });
}

export function flyTo(params = {}) {
    const imageSrc = typeof params.imageSrc === "string" ? params.imageSrc : "";
    const fromEl = params.fromEl;
    const toEl = params.toEl;
    const onArrive = typeof params.onArrive === "function" ? params.onArrive : null;
    const safeAmount = toSafeAmount(params.amount);
    const safeMaxIcons = Number.isFinite(params.maxIcons) ? Math.max(1, Math.round(params.maxIcons)) : DEFAULT_MAX_ICONS;

    let didArrive = false;
    const callOnArrive = () => {
      if (didArrive) {
        return;
      }

      didArrive = true;
      if (onArrive) {
        onArrive();
      }
    };

    if (!imageSrc || safeAmount <= 0) {
        callOnArrive();
        return;
    }

    const fromCenter = getElementCenter(fromEl);
    const toCenter = getElementCenter(toEl);
    if (!fromCenter || !toCenter) {
        callOnArrive();
        return;
    }

    const layer = ensureLayer();
    const flyCount = Math.min(safeAmount, safeMaxIcons);
    const overflowCount = Math.max(0, safeAmount - flyCount);
    const animationJobs = [];

    for (let i = 0; i < flyCount; i += 1) {
        const size = randomBetween(56, 88);
        const iconNode = createIconNode(imageSrc);
        layer.appendChild(iconNode);

        const fromState = createSpawnState(fromCenter.x, fromCenter.y, size);
        const toState = createTargetState(toCenter.x, toCenter.y, size);
        const duration = BASE_DURATION_MS + randomBetween(0, DURATION_SPREAD_MS);
        const wobbleStrength = randomBetween(10, 22);
        const wobbleSpeed = randomBetween(1.8, 3.4);

        runPopEffect(iconNode);
        animationJobs.push(animateNode(iconNode, fromState, toState, duration, wobbleStrength, wobbleSpeed));
    }

    if (overflowCount > 0) {
        const labelNode = createOverflowLabelNode(overflowCount);
        layer.appendChild(labelNode);

        const labelSize = randomBetween(26, 34);
        const fromState = createSpawnState(fromCenter.x, fromCenter.y, labelSize);
        const toState = createTargetState(toCenter.x, toCenter.y, labelSize);
        const duration = BASE_DURATION_MS + randomBetween(20, DURATION_SPREAD_MS + 40);
        const wobbleStrength = randomBetween(8, 16);
        const wobbleSpeed = randomBetween(1.6, 3);

        runPopEffect(labelNode);
        animationJobs.push(animateNode(labelNode, fromState, toState, duration, wobbleStrength, wobbleSpeed));
    }

    Promise.allSettled(animationJobs).then(() => {
        removeLayerIfEmpty(layer);
        callOnArrive();
    });
}
