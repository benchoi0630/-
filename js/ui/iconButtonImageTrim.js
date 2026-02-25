// 파일 역할: 문서 내 PNG 이미지의 투명 여백을 자동으로 제거해 시각 정렬을 맞춘다.
// 핵심 책임: 알파 채널 기준으로 경계 박스를 계산해 data URL로 치환한다.
// 연동 범위: 초기 마크업과 런타임에서 추가/변경되는 모든 PNG <img> 요소에 적용된다.

const ALPHA_THRESHOLD = 32;
const SPRITE_REGION_HINTS = {
    "back button icon.png": {
        x: 0.22,
        y: 0.06,
        width: 0.18,
        height: 0.18
    },
    "environment upgrade icon.png": {
        x: 0.26,
        y: 0.31,
        width: 0.24,
        height: 0.24
    }
};

const trimResultCache = new Map();
const processedSrcByImage = new WeakMap();
const pendingTrimLoadByImage = new WeakMap();
let trimMutationObserver = null;

function isImageNode(node) {
    return node instanceof HTMLImageElement;
}

function normalizeSourceKey(rawSource) {
    if (typeof rawSource !== "string" || rawSource.length <= 0) {
        return "";
    }

    try {
        return new URL(rawSource, window.location.href).href;
    } catch {
        return rawSource;
    }
}

function decodeFileNameSafe(rawName) {
    if (typeof rawName !== "string" || rawName.length <= 0) {
        return "";
    }

    try {
        return decodeURIComponent(rawName);
    } catch {
        return rawName;
    }
}

function getFileNameFromSource(rawSource) {
    const sourceKey = normalizeSourceKey(rawSource);
    if (!sourceKey) {
        return "";
    }

    try {
        const parsed = new URL(sourceKey, window.location.href);
        const segments = parsed.pathname.split("/");
        return decodeFileNameSafe(segments[segments.length - 1] || "");
    } catch {
        const clean = sourceKey.split("?")[0].split("#")[0];
        const segments = clean.split("/");
        return decodeFileNameSafe(segments[segments.length - 1] || "");
    }
}

function isPngSource(rawSource) {
    const sourceKey = normalizeSourceKey(rawSource);
    if (!sourceKey || sourceKey.startsWith("data:")) {
        return false;
    }

    try {
        const parsed = new URL(sourceKey, window.location.href);
        return parsed.pathname.toLowerCase().endsWith(".png");
    } catch {
        const withoutQuery = sourceKey.split("?")[0].split("#")[0];
        return withoutQuery.toLowerCase().endsWith(".png");
    }
}

function getRawImageSource(image) {
    if (!(image instanceof HTMLImageElement)) {
        return "";
    }

    return image.currentSrc || image.getAttribute("src") || image.src || "";
}

function getImageSourceKey(image) {
    return normalizeSourceKey(getRawImageSource(image));
}

function isTrimmableImageNode(node) {
    return isImageNode(node) && isPngSource(getRawImageSource(node));
}

function getCanvasContext(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return { canvas, context };
}

function readSourceImageData(sourceImage, width, height) {
    const source = getCanvasContext(width, height);
    if (!source.context) {
        return null;
    }

    try {
        source.context.drawImage(sourceImage, 0, 0, width, height);
        const sourceImageData = source.context.getImageData(0, 0, width, height);
        return { source, sourceImageData };
    } catch {
        return null;
    }
}

function getTrimBounds(imageData, width, height) {
    return getTrimBoundsInRegion(imageData, width, height, {
        startX: 0,
        endX: width - 1,
        startY: 0,
        endY: height - 1
    });
}

function getTrimBoundsInRegion(imageData, width, height, region) {
    const pixels = imageData.data;
    const startX = Math.max(0, Math.min(width - 1, Math.floor(region.startX)));
    const endX = Math.max(0, Math.min(width - 1, Math.floor(region.endX)));
    const startY = Math.max(0, Math.min(height - 1, Math.floor(region.startY)));
    const endY = Math.max(0, Math.min(height - 1, Math.floor(region.endY)));

    if (endX < startX || endY < startY) {
        return null;
    }

    let minX = endX + 1;
    let minY = endY + 1;
    let maxX = -1;
    let maxY = -1;

    for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
            const alphaIndex = ((y * width) + x) * 4 + 3;
            if (pixels[alphaIndex] <= ALPHA_THRESHOLD) {
                continue;
            }

            if (x < minX) {
                minX = x;
            }
            if (y < minY) {
                minY = y;
            }
            if (x > maxX) {
                maxX = x;
            }
            if (y > maxY) {
                maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        return null;
    }

    return {
        left: minX,
        top: minY,
        width: (maxX - minX) + 1,
        height: (maxY - minY) + 1
    };
}

function getHintedRegionBounds(imageData, width, height, sourceKey) {
    const fileName = getFileNameFromSource(sourceKey);
    if (!fileName) {
        return null;
    }

    const hint = SPRITE_REGION_HINTS[fileName.toLowerCase()];
    if (!hint) {
        return null;
    }

    const startX = Math.floor(width * hint.x);
    const startY = Math.floor(height * hint.y);
    const endX = Math.floor((width * (hint.x + hint.width)) - 1);
    const endY = Math.floor((height * (hint.y + hint.height)) - 1);

    return getTrimBoundsInRegion(imageData, width, height, {
        startX,
        endX,
        startY,
        endY
    });
}

function clearLowAlphaPixels(imageData) {
    const pixels = imageData.data;
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] <= ALPHA_THRESHOLD) {
            pixels[i] = 0;
        }
    }
}

function trimImageSourceToDataUrl(sourceImage, sourceKey = "") {
    const width = sourceImage.naturalWidth;
    const height = sourceImage.naturalHeight;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }

    const sourceData = readSourceImageData(sourceImage, width, height);
    if (!sourceData) {
        return null;
    }
    const { source, sourceImageData } = sourceData;

    clearLowAlphaPixels(sourceImageData);
    source.context.putImageData(sourceImageData, 0, 0);
    const hintedBounds = getHintedRegionBounds(sourceImageData, width, height, sourceKey);
    const bounds = hintedBounds || getTrimBounds(sourceImageData, width, height);

    if (!bounds) {
        return null;
    }

    const isAlreadyTight = bounds.left === 0
        && bounds.top === 0
        && bounds.width === width
        && bounds.height === height;
    if (isAlreadyTight) {
        return null;
    }

    const target = getCanvasContext(bounds.width, bounds.height);
    if (!target.context) {
        return null;
    }

    target.context.drawImage(
        source.canvas,
        bounds.left,
        bounds.top,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height
    );

    return target.canvas.toDataURL("image/png");
}

export function extractTrimmedOpaqueMaskFromImage(sourceImage) {
    const width = sourceImage?.naturalWidth;
    const height = sourceImage?.naturalHeight;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }

    const sourceData = readSourceImageData(sourceImage, width, height);
    if (!sourceData) {
        return null;
    }
    const { sourceImageData } = sourceData;

    clearLowAlphaPixels(sourceImageData);
    const bounds = getTrimBounds(sourceImageData, width, height);
    if (!bounds) {
        return null;
    }

    const maskWidth = bounds.width;
    const maskHeight = bounds.height;
    const alphaMask = new Uint8Array(maskWidth * maskHeight);
    const pixels = sourceImageData.data;

    for (let y = 0; y < maskHeight; y += 1) {
        for (let x = 0; x < maskWidth; x += 1) {
            const sourceX = bounds.left + x;
            const sourceY = bounds.top + y;
            const alphaIndex = ((sourceY * width) + sourceX) * 4 + 3;
            alphaMask[(y * maskWidth) + x] = pixels[alphaIndex] > ALPHA_THRESHOLD ? 1 : 0;
        }
    }

    return {
        sourceWidth: width,
        sourceHeight: height,
        trimLeft: bounds.left,
        trimTop: bounds.top,
        trimWidth: maskWidth,
        trimHeight: maskHeight,
        alphaMask
    };
}

function cacheTrimmedDataUrl(src, dataUrl) {
    if (typeof src !== "string" || src.length <= 0) {
        return;
    }
    trimResultCache.set(src, dataUrl || "");
}

function readTrimmedDataUrl(src) {
    if (typeof src !== "string" || src.length <= 0) {
        return undefined;
    }
    if (!trimResultCache.has(src)) {
        return undefined;
    }
    const cached = trimResultCache.get(src);
    return cached || null;
}

function clearPendingTrimLoadListener(image) {
    const pending = pendingTrimLoadByImage.get(image);
    if (!pending) {
        return;
    }

    image.removeEventListener("load", pending.listener);
    pendingTrimLoadByImage.delete(image);
}

function queueTrimAfterLoad(image, sourceKey, callback) {
    const pending = pendingTrimLoadByImage.get(image);
    if (pending && pending.sourceKey === sourceKey) {
        return;
    }

    clearPendingTrimLoadListener(image);

    const listener = () => {
        pendingTrimLoadByImage.delete(image);
        callback();
    };

    pendingTrimLoadByImage.set(image, { sourceKey, listener });
    image.addEventListener("load", listener, { once: true });
}

function applyTrimToImage(image) {
    if (!isTrimmableImageNode(image)) {
        return;
    }

    const trimAndSwap = () => {
        const originalSrcKey = getImageSourceKey(image);
        if (!originalSrcKey || !isPngSource(originalSrcKey)) {
            return;
        }

        const lastProcessedSrcKey = processedSrcByImage.get(image);
        if (lastProcessedSrcKey === originalSrcKey) {
            return;
        }

        const cached = readTrimmedDataUrl(originalSrcKey);
        if (cached !== undefined) {
            processedSrcByImage.set(image, originalSrcKey);
            if (cached) {
                image.src = cached;
            }
            return;
        }

        let trimmedDataUrl = null;
        try {
            trimmedDataUrl = trimImageSourceToDataUrl(image, originalSrcKey);
        } catch {
            trimmedDataUrl = null;
        }

        cacheTrimmedDataUrl(originalSrcKey, trimmedDataUrl);
        processedSrcByImage.set(image, originalSrcKey);
        if (trimmedDataUrl) {
            image.src = trimmedDataUrl;
        }
    };

    if (image.complete && image.naturalWidth > 0) {
        clearPendingTrimLoadListener(image);
        trimAndSwap();
        return;
    }

    const sourceKey = getImageSourceKey(image);
    if (!sourceKey) {
        return;
    }

    queueTrimAfterLoad(image, sourceKey, trimAndSwap);
}

function trimExistingImages(rootNode = document) {
    const root = rootNode instanceof Element || rootNode instanceof Document ? rootNode : document;
    if (isTrimmableImageNode(root)) {
        applyTrimToImage(root);
    }

    const images = root.querySelectorAll("img");
    for (let i = 0; i < images.length; i += 1) {
        applyTrimToImage(images[i]);
    }
}

function observeNewImages() {
    if (trimMutationObserver) {
        return;
    }

    if (!(document.body instanceof HTMLElement)) {
        return;
    }

    trimMutationObserver = new MutationObserver((records) => {
        for (let i = 0; i < records.length; i += 1) {
            const record = records[i];

            if (record.type === "attributes" && record.target instanceof HTMLImageElement) {
                applyTrimToImage(record.target);
                continue;
            }

            for (let j = 0; j < record.addedNodes.length; j += 1) {
                const node = record.addedNodes[j];
                if (!(node instanceof Element)) {
                    continue;
                }

                if (isTrimmableImageNode(node)) {
                    applyTrimToImage(node);
                }

                const descendants = node.querySelectorAll?.("img");
                if (!descendants || descendants.length <= 0) {
                    continue;
                }

                for (let k = 0; k < descendants.length; k += 1) {
                    applyTrimToImage(descendants[k]);
                }
            }
        }
    });

    trimMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src"]
    });
}

export function initIconButtonImageTrim() {
    trimExistingImages(document);
    observeNewImages();
}
