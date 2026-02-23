// 파일 역할: 메인 페이지 배경 씬(지면/해초 레이어) 생성과 애니메이션을 전담한다.
// 핵심 책임: 해초 필드 생성, 프레임 스텝, 리사이즈 대응, 배경 레이어 보장을 처리한다.
// 연동 범위: mainpageMainUI가 렌더 시 호출해 배경 시각 상태를 유지한다.

const GROUND_IMAGE_SOURCES = [
    new URL("../../../ui/assets/background elemets/ground 1.png", import.meta.url).href,
    new URL("../../../ui/assets/background elemets/ground 2.png", import.meta.url).href,
    new URL("../../../ui/assets/background elemets/ground 3.png", import.meta.url).href
];

const SEAWEED_IMAGE_SOURCES_BY_TYPE = {
    1: [
        new URL("../../../ui/assets/background elemets/seaweed 1.1.png", import.meta.url).href,
        new URL("../../../ui/assets/background elemets/seaweed 1.2.png", import.meta.url).href
    ],
    2: [
        new URL("../../../ui/assets/background elemets/seaweed 2.1.png", import.meta.url).href,
        new URL("../../../ui/assets/background elemets/seaweed 2.2.png", import.meta.url).href
    ],
    3: [
        new URL("../../../ui/assets/background elemets/seaweed 3.1.png", import.meta.url).href,
        new URL("../../../ui/assets/background elemets/seaweed 3.2.png", import.meta.url).href
    ]
};

const SEAWEED_FRAME_DURATION_MS = 700;
const SEAWEED_STEP_TICK_MS = 120;
const SEAWEED_FIELD_REFRESH_INTERVAL_MS = 14000;
const SEAWEED_MIN_COUNT = 8;
const SEAWEED_MAX_COUNT = 14;
const SEAWEED_MIN_WIDTH = 58;
const SEAWEED_MAX_WIDTH = 110;
const MAIN_BACKGROUND_HOST_ID = "globalMainBackground";
const MAIN_BACKGROUND_INACTIVE_CLASS = "global-main-background-inactive";
const DISPLAY_CONFIG_CHANGED_EVENT = "marimo:dev-display-config-changed";

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function ensureSceneImageLayer(area, className, imageSrc) {
    let layer = area.querySelector(`.${className}`);
    if (!layer) {
        layer = document.createElement("img");
        layer.className = className;
        layer.alt = "";
        layer.draggable = false;
        layer.loading = "lazy";
        layer.decoding = "async";
        area.appendChild(layer);
    }

    if (layer.getAttribute("src") !== imageSrc) {
        layer.src = imageSrc;
    }

    return layer;
}

function ensureSeaweedLayer(area) {
    let seaweedLayer = area.querySelector(".main-seaweed-layer");
    if (!seaweedLayer) {
        seaweedLayer = document.createElement("div");
        seaweedLayer.className = "main-seaweed-layer";
        area.appendChild(seaweedLayer);
    }

    return seaweedLayer;
}

export function createMainPageBackgroundUI() {
    let backgroundSceneStarted = false;
    let seaweedAnimationTimerId = null;
    let seaweedLastTickAt = 0;
    let seaweedLastRefreshAt = 0;
    let seaweedResizeListenerBound = false;
    let sceneVisibilityListenerBound = false;
    let sceneHostRef = null;
    let pageContainerRef = null;
    let mainPageRef = null;
    let seaweedLayerRef = null;
    const seaweedField = [];

    function ensureMainBackgroundHost() {
        let host = document.getElementById(MAIN_BACKGROUND_HOST_ID);
        if (host) {
            return host;
        }

        host = document.createElement("div");
        host.id = MAIN_BACKGROUND_HOST_ID;
        host.className = `global-main-background ${MAIN_BACKGROUND_INACTIVE_CLASS}`;
        host.setAttribute("aria-hidden", "true");

        if (document.body.firstChild) {
            document.body.insertBefore(host, document.body.firstChild);
        } else {
            document.body.appendChild(host);
        }

        return host;
    }

    function createSeaweedField(area, seaweedLayer) {
        const width = Math.max(240, area.clientWidth || 360);
        const height = Math.max(220, area.clientHeight || 320);
        const seaweedCount = clamp(Math.round(width / 92), SEAWEED_MIN_COUNT, SEAWEED_MAX_COUNT);

        seaweedLayer.textContent = "";
        seaweedField.length = 0;

        for (let i = 0; i < seaweedCount; i += 1) {
            const seaweedNode = document.createElement("img");
            seaweedNode.className = "main-seaweed";
            seaweedNode.alt = "";
            seaweedNode.draggable = false;
            seaweedNode.decoding = "async";
            seaweedNode.loading = "lazy";

            const type = (Math.floor(randomBetween(0, 3)) % 3) + 1;
            const frames = SEAWEED_IMAGE_SOURCES_BY_TYPE[type] || SEAWEED_IMAGE_SOURCES_BY_TYPE[1];
            const frameIndex = Math.random() < 0.5 ? 0 : 1;
            const x = randomBetween(-20, Math.max(24, width - 38));
            const y = randomBetween(-12, Math.max(24, height * 0.25));
            const widthPx = randomBetween(SEAWEED_MIN_WIDTH, SEAWEED_MAX_WIDTH);

            seaweedNode.src = frames[frameIndex];
            seaweedNode.style.left = `${x.toFixed(1)}px`;
            seaweedNode.style.bottom = `${y.toFixed(1)}px`;
            seaweedNode.style.width = `${widthPx.toFixed(1)}px`;
            seaweedNode.style.opacity = randomBetween(0.72, 0.97).toFixed(2);
            seaweedNode.style.setProperty("--seaweed-scale", randomBetween(0.75, 1.18).toFixed(3));
            seaweedNode.style.setProperty("--seaweed-drift", `${randomBetween(4, 14).toFixed(2)}px`);
            seaweedNode.style.setProperty("--seaweed-sway-duration", `${randomBetween(3.3, 5.8).toFixed(2)}s`);
            seaweedNode.style.setProperty("--seaweed-sway-delay", `${(-randomBetween(0, 6)).toFixed(2)}s`);
            seaweedLayer.appendChild(seaweedNode);

            seaweedField.push({
                node: seaweedNode,
                frames,
                frameIndex,
                elapsedMs: randomBetween(0, SEAWEED_FRAME_DURATION_MS)
            });
        }
    }

    function stepSeaweedAnimation() {
        if (!seaweedLayerRef || !sceneHostRef || !seaweedLayerRef.isConnected || !sceneHostRef.isConnected) {
            return;
        }

        const now = performance.now();
        const deltaMs = seaweedLastTickAt > 0 ? now - seaweedLastTickAt : SEAWEED_STEP_TICK_MS;
        seaweedLastTickAt = now;

        for (let i = 0; i < seaweedField.length; i += 1) {
            const seaweed = seaweedField[i];
            if (!seaweed?.node?.isConnected) {
                continue;
            }

            seaweed.elapsedMs += deltaMs;
            if (seaweed.elapsedMs < SEAWEED_FRAME_DURATION_MS) {
                continue;
            }

            while (seaweed.elapsedMs >= SEAWEED_FRAME_DURATION_MS) {
                seaweed.elapsedMs -= SEAWEED_FRAME_DURATION_MS;
                seaweed.frameIndex = seaweed.frameIndex === 0 ? 1 : 0;
            }

            seaweed.node.src = seaweed.frames[seaweed.frameIndex];
        }
    }

    function refreshSeaweedField(force = false) {
        if (!sceneHostRef || !seaweedLayerRef || !sceneHostRef.isConnected || !seaweedLayerRef.isConnected) {
            return;
        }

        const now = performance.now();
        if (!force && now - seaweedLastRefreshAt < SEAWEED_FIELD_REFRESH_INTERVAL_MS) {
            return;
        }

        createSeaweedField(sceneHostRef, seaweedLayerRef);
        seaweedLastRefreshAt = now;
    }

    function startSeaweedAnimation() {
        if (seaweedAnimationTimerId) {
            return;
        }

        seaweedLastTickAt = performance.now();
        seaweedAnimationTimerId = window.setInterval(stepSeaweedAnimation, SEAWEED_STEP_TICK_MS);
    }

    function bindSeaweedResizeIfNeeded() {
        if (seaweedResizeListenerBound) {
            return;
        }

        const handleLayoutChange = () => {
            if (!sceneHostRef || !seaweedLayerRef || !sceneHostRef.isConnected || !seaweedLayerRef.isConnected) {
                return;
            }

            createSeaweedField(sceneHostRef, seaweedLayerRef);
            seaweedLastRefreshAt = performance.now();
            syncSceneVisibility();
        };

        window.addEventListener("resize", handleLayoutChange);
        window.addEventListener(DISPLAY_CONFIG_CHANGED_EVENT, handleLayoutChange);

        seaweedResizeListenerBound = true;
    }

    function isMainPageCentered() {
        if (!pageContainerRef || !mainPageRef || !pageContainerRef.isConnected || !mainPageRef.isConnected) {
            return true;
        }

        const pageWidth = Math.max(1, mainPageRef.clientWidth || pageContainerRef.clientWidth || 1);
        const containerWidth = Math.max(1, pageContainerRef.clientWidth || pageWidth);
        const mainCenterX = mainPageRef.offsetLeft + (pageWidth / 2);
        const viewportCenterX = pageContainerRef.scrollLeft + (containerWidth / 2);
        const threshold = pageWidth * 0.52;

        return Math.abs(viewportCenterX - mainCenterX) <= threshold;
    }

    function syncSceneVisibility() {
        if (!sceneHostRef) {
            return;
        }

        sceneHostRef.classList.toggle(MAIN_BACKGROUND_INACTIVE_CLASS, !isMainPageCentered());
    }

    function bindSceneVisibilityIfNeeded() {
        if (sceneVisibilityListenerBound) {
            syncSceneVisibility();
            return;
        }

        pageContainerRef = document.getElementById("pageContainer");
        mainPageRef = document.getElementById("mainPage");

        const handleVisibilitySync = () => {
            syncSceneVisibility();
        };

        if (pageContainerRef) {
            pageContainerRef.addEventListener("scroll", handleVisibilitySync, { passive: true });
        }
        window.addEventListener("resize", handleVisibilitySync);
        window.addEventListener(DISPLAY_CONFIG_CHANGED_EVENT, handleVisibilitySync);

        sceneVisibilityListenerBound = true;
        syncSceneVisibility();
    }

    function ensureMainBackgroundScene(elements) {
        if (!elements?.marimoArea) {
            return;
        }

        sceneHostRef = ensureMainBackgroundHost();
        sceneHostRef.classList.add("main-scene-enabled");

        ensureSceneImageLayer(sceneHostRef, "main-ground-layer-back", GROUND_IMAGE_SOURCES[0]);
        seaweedLayerRef = ensureSeaweedLayer(sceneHostRef);
        ensureSceneImageLayer(sceneHostRef, "main-ground-layer-middle", GROUND_IMAGE_SOURCES[1]);
        ensureSceneImageLayer(sceneHostRef, "main-ground-layer-front", GROUND_IMAGE_SOURCES[2]);

        if (!backgroundSceneStarted) {
            bindSceneVisibilityIfNeeded();
            refreshSeaweedField(true);
            bindSeaweedResizeIfNeeded();
            startSeaweedAnimation();
            backgroundSceneStarted = true;
            return;
        }

        bindSceneVisibilityIfNeeded();
        refreshSeaweedField();
        syncSceneVisibility();
    }

    return {
        ensureMainBackgroundScene
    };
}
