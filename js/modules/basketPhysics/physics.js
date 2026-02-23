// 파일 역할: 바구니 내부 원형 바디의 프레임 단위 물리 계산을 수행한다.
// 핵심 책임: 중력/마찰/감쇠, 벽·바닥 반발, 바디 간 충돌 분리/충격량/스핀 계산을 처리한다.
// 연동 범위: index 프레임 루프에서 호출되어 renderer 직전의 최신 위치·속도 상태를 만든다.

import { clamp, getBasketRenderLayout, randomBetween } from "./utils.js";

const WORLD_PADDING = 8;
const BASKET_GRAVITY = 0.2;
const BASKET_FRICTION = 0.985;
const BASKET_GROUND_DRAG = 0.9;
const BASKET_AIR_DRAG = 0.996;
const BASKET_BOUNCE_WALL = 0.75;
const BASKET_BOUNCE_FLOOR = 0.45;
const MAX_LINEAR_SPEED = 6.8;
const STOP_LINEAR_SPEED = 0.018;
const STOP_VERTICAL_SPEED = 0.03;
const BASKET_MASK_SAMPLE_COUNT_MIN = 12;
const BASKET_MASK_SAMPLE_COUNT_MAX = 24;
const BASKET_MASK_INNER_RING_SCALE = 0.58;
const BASKET_MASK_DEPENETRATION_MAX_STEPS = 28;
const BASKET_MASK_DEPENETRATION_STEP = 1.2;
const BASKET_MASK_BOUNCE = 0.58;
const BASKET_MASK_DRAG = 0.985;

function circleIntersectsRect(cx, cy, radius, rect) {
    if (!rect) {
        return false;
    }

    return !(
        cx + radius < rect.left
        || cx - radius > rect.right
        || cy + radius < rect.top
        || cy - radius > rect.bottom
    );
}

function getBasketMaskWorldBounds(basketMask, basketRect) {
    if (!basketMask || !basketRect || basketRect.width <= 0 || basketRect.height <= 0) {
        return null;
    }

    const left = basketRect.x + (basketMask.trimLeft / basketMask.sourceWidth) * basketRect.width;
    const top = basketRect.y + (basketMask.trimTop / basketMask.sourceHeight) * basketRect.height;
    const right = basketRect.x + ((basketMask.trimLeft + basketMask.trimWidth) / basketMask.sourceWidth) * basketRect.width;
    const bottom = basketRect.y + ((basketMask.trimTop + basketMask.trimHeight) / basketMask.sourceHeight) * basketRect.height;

    return {
        left,
        top,
        right,
        bottom
    };
}

function getMaskLocalPointFromWorldPoint(basketMask, basketRect, worldX, worldY) {
    if (!basketMask || !basketRect || basketRect.width <= 0 || basketRect.height <= 0) {
        return null;
    }

    const sourceX = ((worldX - basketRect.x) / basketRect.width) * basketMask.sourceWidth;
    const sourceY = ((worldY - basketRect.y) / basketRect.height) * basketMask.sourceHeight;
    return {
        x: sourceX - basketMask.trimLeft,
        y: sourceY - basketMask.trimTop
    };
}

function sampleBasketMaskOccupancy(basketMask, localX, localY) {
    if (!basketMask || !Number.isFinite(localX) || !Number.isFinite(localY)) {
        return 0;
    }

    const x = Math.floor(localX);
    const y = Math.floor(localY);
    if (x < 0 || y < 0 || x >= basketMask.trimWidth || y >= basketMask.trimHeight) {
        return 0;
    }

    const index = (y * basketMask.trimWidth) + x;
    return basketMask.alphaMask[index] ? 1 : 0;
}

function isBasketMaskSolidAtWorldPoint(basketMask, basketRect, worldX, worldY) {
    const localPoint = getMaskLocalPointFromWorldPoint(basketMask, basketRect, worldX, worldY);
    if (!localPoint) {
        return false;
    }

    return sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y) > 0;
}

function getBodyBasketOverlapSampleCount(body) {
    const raw = Math.round(body.radius * 1.2);
    return Math.max(BASKET_MASK_SAMPLE_COUNT_MIN, Math.min(BASKET_MASK_SAMPLE_COUNT_MAX, raw));
}

function doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds) {
    if (!circleIntersectsRect(body.x, body.y, body.radius, basketWorldMaskBounds)) {
        return false;
    }

    if (isBasketMaskSolidAtWorldPoint(basketMask, basketRect, body.x, body.y)) {
        return true;
    }

    const sampleCount = getBodyBasketOverlapSampleCount(body);
    for (let i = 0; i < sampleCount; i += 1) {
        const angle = (i / sampleCount) * Math.PI * 2;
        const sampleX = body.x + Math.cos(angle) * body.radius;
        const sampleY = body.y + Math.sin(angle) * body.radius;
        if (isBasketMaskSolidAtWorldPoint(basketMask, basketRect, sampleX, sampleY)) {
            return true;
        }
    }

    return false;
}

function accumulateBasketMaskNormalFromSample(normalState, basketMask, basketRect, worldX, worldY) {
    const localPoint = getMaskLocalPointFromWorldPoint(basketMask, basketRect, worldX, worldY);
    if (!localPoint) {
        return;
    }

    if (sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y) <= 0) {
        return;
    }

    const gradientX = sampleBasketMaskOccupancy(basketMask, localPoint.x + 1, localPoint.y)
        - sampleBasketMaskOccupancy(basketMask, localPoint.x - 1, localPoint.y);
    const gradientY = sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y + 1)
        - sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y - 1);

    let pushX = -gradientX;
    let pushY = -gradientY;
    if (Math.abs(pushX) < 0.0001 && Math.abs(pushY) < 0.0001) {
        // Gradient가 없는 두꺼운 고형 픽셀 내부는 벽 안/밖 구분이 불가해 방향 오판이 잦다.
        // 이런 샘플은 normal 집계에서 제외하고, 경계 샘플만으로 분리 방향을 계산한다.
        return;
    }

    const pushLength = Math.hypot(pushX, pushY);
    if (pushLength <= 0.0001) {
        return;
    }

    normalState.x += pushX / pushLength;
    normalState.y += pushY / pushLength;
    normalState.count += 1;
}

function resolveBasketMaskCollision(body, basketMask, basketRect, basketWorldMaskBounds) {
    if (!doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds)) {
        return;
    }

    const normalState = { x: 0, y: 0, count: 0 };
    const sampleCount = getBodyBasketOverlapSampleCount(body);

    accumulateBasketMaskNormalFromSample(normalState, basketMask, basketRect, body.x, body.y);
    for (let i = 0; i < sampleCount; i += 1) {
        const angle = (i / sampleCount) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const outerX = body.x + cos * body.radius;
        const outerY = body.y + sin * body.radius;
        accumulateBasketMaskNormalFromSample(normalState, basketMask, basketRect, outerX, outerY);
        const innerX = body.x + cos * body.radius * BASKET_MASK_INNER_RING_SCALE;
        const innerY = body.y + sin * body.radius * BASKET_MASK_INNER_RING_SCALE;
        accumulateBasketMaskNormalFromSample(normalState, basketMask, basketRect, innerX, innerY);
    }

    let normalX = normalState.x;
    let normalY = normalState.y;
    if (normalState.count <= 0 || Math.hypot(normalX, normalY) <= 0.0001) {
        if (Math.abs(body.vx) + Math.abs(body.vy) > 0.0001) {
            normalX = -body.vx;
            normalY = -body.vy;
        } else {
            normalX = 0;
            normalY = -1;
        }
    }

    const normalLength = Math.hypot(normalX, normalY) || 1;
    normalX /= normalLength;
    normalY /= normalLength;

    for (let step = 0; step < BASKET_MASK_DEPENETRATION_MAX_STEPS; step += 1) {
        if (!doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds)) {
            break;
        }

        body.x += normalX * BASKET_MASK_DEPENETRATION_STEP;
        body.y += normalY * BASKET_MASK_DEPENETRATION_STEP;
    }

    const approachSpeed = body.vx * normalX + body.vy * normalY;
    if (approachSpeed < 0) {
        body.vx -= (1 + BASKET_MASK_BOUNCE) * approachSpeed * normalX;
        body.vy -= (1 + BASKET_MASK_BOUNCE) * approachSpeed * normalY;
    }
    body.vx *= BASKET_MASK_DRAG;
    body.vy *= BASKET_MASK_DRAG;
}

export function updateBasketPhysics(runtime) {
    const floor = runtime.height - WORLD_PADDING;
    const ceiling = WORLD_PADDING;
    const leftWall = WORLD_PADDING;
    const rightWall = runtime.width - WORLD_PADDING;
    const bodies = runtime.bodies;
    const basketMask = runtime?.basketShapeAsset?.getCollisionMask?.() || null;
    const basketRect = getBasketRenderLayout(runtime.width, runtime.height).basketRect;
    const basketWorldMaskBounds = getBasketMaskWorldBounds(basketMask, basketRect);

    for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i];

        if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.vx) || !Number.isFinite(body.vy)) {
            body.x = clamp(runtime.width * 0.5, WORLD_PADDING + body.radius, runtime.width - WORLD_PADDING - body.radius);
            body.y = clamp(runtime.height * 0.5, WORLD_PADDING + body.radius, runtime.height - WORLD_PADDING - body.radius);
            body.vx = 0;
            body.vy = 0;
        }

        if (body.isPointerDragging === true) {
            body.x = clamp(body.x, leftWall + body.radius, rightWall - body.radius);
            body.y = clamp(body.y, ceiling + body.radius, floor - body.radius);
            body.vx *= 0.82;
            body.vy *= 0.82;
            body.angularVelocity *= 0.7;
            continue;
        }

        body.vx = clamp(body.vx, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
        body.vy = clamp(body.vy, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);

        body.vy += BASKET_GRAVITY;
        body.x += body.vx;
        body.y += body.vy;

        if (body.x - body.radius < leftWall) {
            body.x = leftWall + body.radius;
            body.vx *= -BASKET_BOUNCE_WALL;
        }

        if (body.x + body.radius > rightWall) {
            body.x = rightWall - body.radius;
            body.vx *= -BASKET_BOUNCE_WALL;
        }

        if (body.y - body.radius < ceiling) {
            body.y = ceiling + body.radius;
            body.vy *= -BASKET_BOUNCE_WALL;
        }

        if (body.y + body.radius > floor) {
            body.y = floor - body.radius;
            body.vy *= -BASKET_BOUNCE_FLOOR;
        }

        if (basketMask && basketWorldMaskBounds) {
            resolveBasketMaskCollision(body, basketMask, basketRect, basketWorldMaskBounds);
            body.x = clamp(body.x, leftWall + body.radius, rightWall - body.radius);
            body.y = clamp(body.y, ceiling + body.radius, floor - body.radius);
        }

        const floorThreshold = floor - 0.4;
        const isGrounded = body.y + body.radius >= floorThreshold;

        body.vx *= BASKET_FRICTION;
        if (isGrounded) {
            body.vx *= BASKET_GROUND_DRAG;
        } else {
            body.vx *= BASKET_AIR_DRAG;
            body.vy *= BASKET_AIR_DRAG;
        }

        body.vx = clamp(body.vx, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
        body.vy = clamp(body.vy, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);

        if (Math.abs(body.vx) < STOP_LINEAR_SPEED) {
            body.vx = 0;
        }

        if (isGrounded && Math.abs(body.vy) < STOP_VERTICAL_SPEED) {
            body.vy = 0;
        }

        const rollingTarget = body.vx / Math.max(10, body.radius * 1.7);
        if (isGrounded) {
            body.angularVelocity = (body.angularVelocity * 0.8) + (rollingTarget * 0.2);
        } else {
            body.angularVelocity *= 0.986;
        }

        if (isGrounded && body.vx === 0 && Math.abs(body.angularVelocity) < 0.001) {
            body.angularVelocity = 0;
        }

        body.angularVelocity = clamp(body.angularVelocity, -0.28, 0.28);
        body.angle += body.angularVelocity;
    }

    for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
            const a = bodies[i];
            const b = bodies[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const minDist = a.radius + b.radius;
            const distSq = dx * dx + dy * dy;

            if (distSq <= 0.0001) {
                const randomAngle = randomBetween(0, Math.PI * 2);
                const nx = Math.cos(randomAngle);
                const ny = Math.sin(randomAngle);
                a.x -= nx * 0.6;
                a.y -= ny * 0.6;
                b.x += nx * 0.6;
                b.y += ny * 0.6;
                continue;
            }

            if (distSq >= minDist * minDist) {
                continue;
            }

            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            const aDragged = a.isPointerDragging === true;
            const bDragged = b.isPointerDragging === true;

            if (aDragged && bDragged) {
                continue;
            }

            if (aDragged) {
                b.x += nx * overlap;
                b.y += ny * overlap;
            } else if (bDragged) {
                a.x -= nx * overlap;
                a.y -= ny * overlap;
            } else {
                a.x -= nx * overlap * 0.5;
                a.y -= ny * overlap * 0.5;
                b.x += nx * overlap * 0.5;
                b.y += ny * overlap * 0.5;
            }

            const relVx = b.vx - a.vx;
            const relVy = b.vy - a.vy;
            const sepSpeed = relVx * nx + relVy * ny;

            if (sepSpeed < 0) {
                const impulse = -sepSpeed * 0.28;
                if (!aDragged) {
                    a.vx -= impulse * nx;
                    a.vy -= impulse * ny;
                }
                if (!bDragged) {
                    b.vx += impulse * nx;
                    b.vy += impulse * ny;
                }
            }

            const tx = -ny;
            const ty = nx;
            const relTanSpeed = relVx * tx + relVy * ty;
            const tangentImpulse = relTanSpeed * 0.08;
            if (!aDragged) {
                a.vx += tangentImpulse * tx;
                a.vy += tangentImpulse * ty;
            }
            if (!bDragged) {
                b.vx -= tangentImpulse * tx;
                b.vy -= tangentImpulse * ty;
            }

            const spinImpulse = relTanSpeed * 0.004;
            if (!aDragged) {
                a.angularVelocity -= spinImpulse;
                a.vx = clamp(a.vx, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
                a.vy = clamp(a.vy, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
            }
            if (!bDragged) {
                b.angularVelocity += spinImpulse;
                b.vx = clamp(b.vx, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
                b.vy = clamp(b.vy, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
            }
        }
    }
}
