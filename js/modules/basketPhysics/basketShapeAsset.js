// 파일 역할: 바구니 이미지/충돌 마스크 에셋을 소스별 캐시로 관리한다.
// 핵심 책임: 호출자가 지정한 이미지 파일 기준으로 sprite/mask를 지연 생성해 재사용한다.
// 연동 범위: basketPhysics runtime이 바구니 에셋을 옵션으로 주입받아 renderer/physics에서 공통 사용한다.

import { extractTrimmedOpaqueMaskFromImage } from "../../ui/iconButtonImageTrim.js";

export const DEFAULT_BASKET_IMAGE_SRC = new URL("../../ui/assets/basket big.PNG", import.meta.url).href;

const basketAssetCache = new Map();

function normalizeBasketImageSrc(rawSrc) {
    if (typeof rawSrc === "string" && rawSrc.trim().length > 0) {
        return rawSrc.trim();
    }

    return DEFAULT_BASKET_IMAGE_SRC;
}

function createSprite(src) {
    if (typeof Image === "undefined") {
        return null;
    }

    const image = new Image();
    image.decoding = "async";
    image.src = src;
    return image;
}

function isSpriteReady(image) {
    return Boolean(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function createBasketShapeAsset(rawSrc) {
    const src = normalizeBasketImageSrc(rawSrc);
    const sprite = createSprite(src);
    let collisionMask = null;
    let maskBuildRequested = false;

    function buildCollisionMaskFromSprite() {
        if (collisionMask || !isSpriteReady(sprite)) {
            return;
        }

        const nextMask = extractTrimmedOpaqueMaskFromImage(sprite);
        if (nextMask) {
            collisionMask = nextMask;
        }
    }

    function ensureCollisionMaskLoad() {
        if (maskBuildRequested || !sprite) {
            return;
        }

        maskBuildRequested = true;
        if (isSpriteReady(sprite)) {
            buildCollisionMaskFromSprite();
            return;
        }

        sprite.addEventListener("load", buildCollisionMaskFromSprite, { once: true });
    }

    ensureCollisionMaskLoad();

    return {
        src,
        sprite,
        isSpriteReady: () => isSpriteReady(sprite),
        getCollisionMask: () => {
            ensureCollisionMaskLoad();
            buildCollisionMaskFromSprite();
            return collisionMask;
        }
    };
}

export function getOrCreateBasketShapeAsset(rawSrc) {
    const src = normalizeBasketImageSrc(rawSrc);
    const cached = basketAssetCache.get(src);
    if (cached) {
        return cached;
    }

    const nextAsset = createBasketShapeAsset(src);
    basketAssetCache.set(src, nextAsset);
    return nextAsset;
}
