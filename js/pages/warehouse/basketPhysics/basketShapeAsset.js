// 파일 역할: 바구니 이미지와 알파 마스크를 단일 캐시로 관리한다.
// 핵심 책임: basket big 이미지 로드와 불투명 픽셀 충돌 마스크 생성을 공유한다.
// 연동 범위: renderer/physics가 동일한 바구니 스프라이트·충돌 데이터를 사용한다.

import { extractTrimmedOpaqueMaskFromImage } from "../../../ui/iconButtonImageTrim.js";

const BASKET_BIG_IMAGE_SRC = new URL("../../../ui/assets/basket big.PNG", import.meta.url).href;

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

const basketSprite = createSprite(BASKET_BIG_IMAGE_SRC);
let basketCollisionMask = null;
let maskBuildRequested = false;

function buildCollisionMaskFromSprite() {
    if (basketCollisionMask || !isSpriteReady(basketSprite)) {
        return;
    }

    const collisionMask = extractTrimmedOpaqueMaskFromImage(basketSprite);
    if (collisionMask) {
        basketCollisionMask = collisionMask;
    }
}

function ensureCollisionMaskLoad() {
    if (maskBuildRequested || !basketSprite) {
        return;
    }

    maskBuildRequested = true;
    if (isSpriteReady(basketSprite)) {
        buildCollisionMaskFromSprite();
        return;
    }

    basketSprite.addEventListener("load", buildCollisionMaskFromSprite, { once: true });
}

ensureCollisionMaskLoad();

export function getBasketShapeSprite() {
    return basketSprite;
}

export function isBasketShapeSpriteReady() {
    return isSpriteReady(basketSprite);
}

export function getBasketCollisionMask() {
    ensureCollisionMaskLoad();
    buildCollisionMaskFromSprite();
    return basketCollisionMask;
}
