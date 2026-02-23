// 파일 역할: 바구니 캔버스 배경과 마리모 스프라이트를 렌더링한다.
// 핵심 책임: 프레임 초기화, 바구니 이미지 렌더, 표정/회전 상태를 반영한 마리모 그리기를 수행한다.
// 연동 범위: index 루프의 마지막 단계에서 physics 결과를 시각적으로 표시한다.

import { drawMarimoOnCanvas, shouldUseMarimoFaceVariant2 } from "../../ui/marimoRender.js";
import { getBasketRenderLayout, getMarimoPhysicsFaceScale, getNowMs } from "./utils.js";

function drawFallbackBasket(ctx, layout) {
    const { basketRect } = layout;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(basketRect.x, basketRect.y, basketRect.width, basketRect.height);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(basketRect.x, basketRect.y, basketRect.width, basketRect.height);
}

export function drawBasket(runtime, spriteCache) {
    const { ctx, width, height, bodies, pixelRatio } = runtime;
    const layout = getBasketRenderLayout(width, height);
    const basketShapeAsset = runtime?.basketShapeAsset || null;
    const faceRenderScale = getMarimoPhysicsFaceScale();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (runtime?.drawBasketShape !== false) {
        if (basketShapeAsset?.isSpriteReady?.() === true && basketShapeAsset.sprite) {
            ctx.drawImage(
                basketShapeAsset.sprite,
                layout.basketRect.x,
                layout.basketRect.y,
                layout.basketRect.width,
                layout.basketRect.height
            );
        } else {
            drawFallbackBasket(ctx, layout);
        }
    }

    const elapsedMs = Math.max(0, getNowMs() - runtime.faceClockStartMs);

    for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i];
        const faceVariant = shouldUseMarimoFaceVariant2(body, elapsedMs) ? 2 : 1;
        drawMarimoOnCanvas({
            ctx,
            x: body.x,
            y: body.y,
            radius: body.radius,
            angle: Number.isFinite(body.angle) ? body.angle : 0,
            marimoType: body.type,
            faceVariant,
            faceScale: faceRenderScale,
            drawOutline: false,
            spriteCache
        });
    }
}
