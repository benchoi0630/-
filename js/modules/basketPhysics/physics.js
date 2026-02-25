// 파일 역할: 바구니 내부 원형 바디의 프레임 단위 물리 계산을 수행한다.
// 핵심 책임: 중력/마찰/감쇠, 벽·바닥 반발, 바디 간 충돌 분리/충격량/스핀 계산을 처리한다.
// 연동 범위: index 프레임 루프에서 호출되어 renderer 직전의 최신 위치·속도 상태를 만든다.
//
// 개선 목표(전력투입):
// - "튐" 감소: 월드 벽/바닥 반발과 마스크 반발의 2연타 제거(마스크 모드에서는 월드 반발을 clamp로만).
// - "파고듦/끼임" 감소: 마스크 depenetration 중 normal을 재계산 + step 작게 + 진행 막히면 fallback.
// - "터널링" 감소: 속도 기반 substep 적분(빠를수록 2~6 substep).
// - 안정성: 과도한 반발/에너지 주입을 제한하고, 접촉 시 tangential damping(마찰)을 조금 강화.
//
// NOTE: 이 파일 내에서만 해결(외부 구조/엔진 추가 없음).

import { clamp, getBasketRenderLayout, randomBetween } from "./utils.js";

const WORLD_PADDING = 8;

// 기본 힘/감쇠
const BASKET_GRAVITY = 0.2;
const BASKET_FRICTION = 0.985;
const BASKET_GROUND_DRAG = 0.9;
const BASKET_AIR_DRAG = 0.996;

// 월드 경계 반발(마스크 미사용 시에만 적극 사용)
const BASKET_BOUNCE_WALL = 0.75;
const BASKET_BOUNCE_FLOOR = 0.45;

// 속도 제한
const MAX_LINEAR_SPEED = 6.8;
const STOP_LINEAR_SPEED = 0.018;
const STOP_VERTICAL_SPEED = 0.03;

// 마스크 충돌 샘플
const BASKET_MASK_SAMPLE_COUNT_MIN = 12;
const BASKET_MASK_SAMPLE_COUNT_MAX = 24;
const BASKET_MASK_INNER_RING_SCALE = 0.58;

// 마스크 depenetration(끼임 방지용으로 step 줄이고, 반복 중 normal 재계산)
const BASKET_MASK_DEPENETRATION_MAX_STEPS = 46;
const BASKET_MASK_DEPENETRATION_STEP = 0.75;          // 기존 1.2 -> 0.75
const BASKET_MASK_NORMAL_RECALC_EVERY = 4;            // depenetration 중 N스텝마다 normal 재계산
const BASKET_MASK_STALL_EPS = 0.12;                   // 겹침 진행이 멈추면 방향 재설정
const BASKET_MASK_RESTITUTION = 0.32;                 // 기존 0.58 -> 0.32 (과튐 감소)
const BASKET_MASK_NORMAL_DRAG = 0.72;                 // 노멀 방향 속도 감쇠(접촉시 튕김 줄임)
const BASKET_MASK_TANGENT_DRAG = 0.88;                // 접선 방향 감쇠(벽 따라 미끄러짐/진동 감소)
const BASKET_MASK_POST_DRAG = 0.992;                  // 전체 속도 후감쇠(약하게)

// substep (터널링 방지)
const SUBSTEP_MIN = 1;
const SUBSTEP_MAX = 6;
const SUBSTEP_SPEED_PER_STEP = 2.2; // (|vx|+|vy|) / 이 값 ≈ substep

function circleIntersectsRect(cx, cy, radius, rect) {
    if (!rect) return false;
    return !(
        cx + radius < rect.left
        || cx - radius > rect.right
        || cy + radius < rect.top
        || cy - radius > rect.bottom
    );
}

function getBasketMaskWorldBounds(basketMask, basketRect) {
    if (!basketMask || !basketRect || basketRect.width <= 0 || basketRect.height <= 0) return null;

    const left = basketRect.x + (basketMask.trimLeft / basketMask.sourceWidth) * basketRect.width;
    const top = basketRect.y + (basketMask.trimTop / basketMask.sourceHeight) * basketRect.height;
    const right = basketRect.x + ((basketMask.trimLeft + basketMask.trimWidth) / basketMask.sourceWidth) * basketRect.width;
    const bottom = basketRect.y + ((basketMask.trimTop + basketMask.trimHeight) / basketMask.sourceHeight) * basketRect.height;

    return { left, top, right, bottom };
}

function getMaskLocalPointFromWorldPoint(basketMask, basketRect, worldX, worldY) {
    if (!basketMask || !basketRect || basketRect.width <= 0 || basketRect.height <= 0) return null;

    const sourceX = ((worldX - basketRect.x) / basketRect.width) * basketMask.sourceWidth;
    const sourceY = ((worldY - basketRect.y) / basketRect.height) * basketMask.sourceHeight;

    return { x: sourceX - basketMask.trimLeft, y: sourceY - basketMask.trimTop };
}

function sampleBasketMaskOccupancy(basketMask, localX, localY) {
    if (!basketMask || !Number.isFinite(localX) || !Number.isFinite(localY)) return 0;

    const x = Math.floor(localX);
    const y = Math.floor(localY);
    if (x < 0 || y < 0 || x >= basketMask.trimWidth || y >= basketMask.trimHeight) return 0;

    const index = (y * basketMask.trimWidth) + x;
    return basketMask.alphaMask[index] ? 1 : 0;
}

function isBasketMaskSolidAtWorldPoint(basketMask, basketRect, worldX, worldY) {
    const localPoint = getMaskLocalPointFromWorldPoint(basketMask, basketRect, worldX, worldY);
    if (!localPoint) return false;
    return sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y) > 0;
}

function getBodyBasketOverlapSampleCount(body) {
    const raw = Math.round(body.radius * 1.2);
    return Math.max(BASKET_MASK_SAMPLE_COUNT_MIN, Math.min(BASKET_MASK_SAMPLE_COUNT_MAX, raw));
}

function doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds) {
    if (!circleIntersectsRect(body.x, body.y, body.radius, basketWorldMaskBounds)) return false;

    if (isBasketMaskSolidAtWorldPoint(basketMask, basketRect, body.x, body.y)) return true;

    const sampleCount = getBodyBasketOverlapSampleCount(body);
    for (let i = 0; i < sampleCount; i += 1) {
        const angle = (i / sampleCount) * Math.PI * 2;
        const sampleX = body.x + Math.cos(angle) * body.radius;
        const sampleY = body.y + Math.sin(angle) * body.radius;
        if (isBasketMaskSolidAtWorldPoint(basketMask, basketRect, sampleX, sampleY)) return true;
    }
    return false;
}

function accumulateBasketMaskNormalFromSample(normalState, basketMask, basketRect, worldX, worldY) {
    const localPoint = getMaskLocalPointFromWorldPoint(basketMask, basketRect, worldX, worldY);
    if (!localPoint) return;

    if (sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y) <= 0) return;

    const gradientX =
        sampleBasketMaskOccupancy(basketMask, localPoint.x + 1, localPoint.y)
        - sampleBasketMaskOccupancy(basketMask, localPoint.x - 1, localPoint.y);

    const gradientY =
        sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y + 1)
        - sampleBasketMaskOccupancy(basketMask, localPoint.x, localPoint.y - 1);

    let pushX = -gradientX;
    let pushY = -gradientY;

    if (Math.abs(pushX) < 0.0001 && Math.abs(pushY) < 0.0001) {
        // 두꺼운 solid 내부는 방향 정보가 없어 오판 → 제외
        return;
    }

    const pushLength = Math.hypot(pushX, pushY);
    if (pushLength <= 0.0001) return;

    normalState.x += pushX / pushLength;
    normalState.y += pushY / pushLength;
    normalState.count += 1;
}

function computeBasketMaskNormal(body, basketMask, basketRect) {
    const normalState = { x: 0, y: 0, count: 0 };
    const sampleCount = getBodyBasketOverlapSampleCount(body);

    // 중심 + 외곽 + 내곽
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

    // fallback: 속도가 있으면 -v 방향, 없으면 위쪽
    if (normalState.count <= 0 || Math.hypot(normalX, normalY) <= 0.0001) {
        const vMag = Math.abs(body.vx) + Math.abs(body.vy);
        if (vMag > 0.0001) {
            normalX = -body.vx;
            normalY = -body.vy;
        } else {
            normalX = 0;
            normalY = -1;
        }
    }

    const len = Math.hypot(normalX, normalY) || 1;
    return { x: normalX / len, y: normalY / len };
}

function applyContactResponseAgainstNormal(body, nx, ny) {
    // 속도를 normal/tangent 성분으로 분해해서,
    // - normal 접근 성분은 restitution + 강한 감쇠로 "튀김" 억제
    // - tangent 성분은 마찰로 진동 억제
    const vn = (body.vx * nx) + (body.vy * ny);
    const tx = -ny;
    const ty = nx;
    const vt = (body.vx * tx) + (body.vy * ty);

    let newVn = vn;
    if (vn < 0) {
        // 벽으로 파고드는 방향(접근)일 때만 반응
        newVn = -vn * BASKET_MASK_RESTITUTION;
        newVn *= BASKET_MASK_NORMAL_DRAG;
    }

    let newVt = vt * BASKET_MASK_TANGENT_DRAG;

    body.vx = (newVn * nx) + (newVt * tx);
    body.vy = (newVn * ny) + (newVt * ty);

    // 전체 후감쇠(미세 튐/지터 억제)
    body.vx *= BASKET_MASK_POST_DRAG;
    body.vy *= BASKET_MASK_POST_DRAG;
}

function resolveBasketMaskCollision(body, basketMask, basketRect, basketWorldMaskBounds) {
    if (!doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds)) return;

    // depenetration 중 "진행 막힘" 감지용
    let lastX = body.x;
    let lastY = body.y;

    // 처음 normal
    let normal = computeBasketMaskNormal(body, basketMask, basketRect);
    let nx = normal.x;
    let ny = normal.y;

    // depenetration: 스텝마다 조금씩 밀고, 일정 주기/정체 시 normal 재계산
    for (let step = 0; step < BASKET_MASK_DEPENETRATION_MAX_STEPS; step += 1) {
        if (!doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds)) break;

        body.x += nx * BASKET_MASK_DEPENETRATION_STEP;
        body.y += ny * BASKET_MASK_DEPENETRATION_STEP;

        const moved = Math.hypot(body.x - lastX, body.y - lastY);
        lastX = body.x;
        lastY = body.y;

        const shouldRecalc = (step % BASKET_MASK_NORMAL_RECALC_EVERY) === (BASKET_MASK_NORMAL_RECALC_EVERY - 1);
        const stalled = moved < BASKET_MASK_STALL_EPS;

        if (shouldRecalc || stalled) {
            normal = computeBasketMaskNormal(body, basketMask, basketRect);
            nx = normal.x;
            ny = normal.y;

            // stalled인데 normal도 애매하면 -v로 강제 탈출 방향 부여
            if (stalled) {
                const vMag = Math.abs(body.vx) + Math.abs(body.vy);
                if (vMag > 0.0001) {
                    const inv = 1 / (Math.hypot(body.vx, body.vy) || 1);
                    nx = -body.vx * inv;
                    ny = -body.vy * inv;
                }
            }
        }
    }

    // 아직 겹치면(매우 깊게 박힘) 최후: 위로 살짝 띄워 탈출
    if (doesBodyOverlapBasketMask(body, basketMask, basketRect, basketWorldMaskBounds)) {
        body.y -= Math.max(1.5, body.radius * 0.12);
    }

    // 접촉 응답(과튐 억제)
    applyContactResponseAgainstNormal(body, nx, ny);
}

function clampBodyToWorld(body, leftWall, rightWall, ceiling, floor) {
    body.x = clamp(body.x, leftWall + body.radius, rightWall - body.radius);
    body.y = clamp(body.y, ceiling + body.radius, floor - body.radius);
}

function resolveWorldBounds(body, leftWall, rightWall, ceiling, floor, useBounce) {
    // useBounce=false일 때는 "튐" 없이 clamp만 (마스크 모드에서 2연타 반발 방지)
    if (body.x - body.radius < leftWall) {
        body.x = leftWall + body.radius;
        if (useBounce) body.vx *= -BASKET_BOUNCE_WALL;
        else body.vx = Math.max(0, body.vx) * 0.5;
    }

    if (body.x + body.radius > rightWall) {
        body.x = rightWall - body.radius;
        if (useBounce) body.vx *= -BASKET_BOUNCE_WALL;
        else body.vx = Math.min(0, body.vx) * 0.5;
    }

    if (body.y - body.radius < ceiling) {
        body.y = ceiling + body.radius;
        if (useBounce) body.vy *= -BASKET_BOUNCE_WALL;
        else body.vy = Math.max(0, body.vy) * 0.5;
    }

    if (body.y + body.radius > floor) {
        body.y = floor - body.radius;
        if (useBounce) body.vy *= -BASKET_BOUNCE_FLOOR;
        else body.vy = Math.min(0, body.vy) * 0.35;
    }
}

function computeSubstepsForBody(body) {
    const speed = Math.abs(body.vx) + Math.abs(body.vy);
    const steps = Math.ceil(speed / SUBSTEP_SPEED_PER_STEP);
    return Math.max(SUBSTEP_MIN, Math.min(SUBSTEP_MAX, steps));
}

function integrateOneSubstep(body, runtime, ctx) {
    // clamp before integrate (안전)
    clampBodyToWorld(body, ctx.leftWall, ctx.rightWall, ctx.ceiling, ctx.floor);

    // 속도 제한
    body.vx = clamp(body.vx, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
    body.vy = clamp(body.vy, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);

    // 힘 적용 (중력)
    body.vy += BASKET_GRAVITY * ctx.dt;

    // 적분
    body.x += body.vx * ctx.dt;
    body.y += body.vy * ctx.dt;

    // 월드 경계 처리
    resolveWorldBounds(body, ctx.leftWall, ctx.rightWall, ctx.ceiling, ctx.floor, ctx.useWorldBounce);

    // 마스크 충돌 처리
    if (ctx.basketMask && ctx.basketWorldMaskBounds) {
        resolveBasketMaskCollision(body, ctx.basketMask, ctx.basketRect, ctx.basketWorldMaskBounds);
        clampBodyToWorld(body, ctx.leftWall, ctx.rightWall, ctx.ceiling, ctx.floor);
    }

    // 지상 판정
    const floorThreshold = ctx.floor - 0.4;
    const isGrounded = body.y + body.radius >= floorThreshold;

    // 마찰/공기저항
    body.vx *= BASKET_FRICTION;
    if (isGrounded) {
        body.vx *= BASKET_GROUND_DRAG;
    } else {
        body.vx *= BASKET_AIR_DRAG;
        body.vy *= BASKET_AIR_DRAG;
    }

    // 속도 제한/스톱 스냅
    body.vx = clamp(body.vx, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
    body.vy = clamp(body.vy, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);

    if (Math.abs(body.vx) < STOP_LINEAR_SPEED) body.vx = 0;
    if (isGrounded && Math.abs(body.vy) < STOP_VERTICAL_SPEED) body.vy = 0;

    // 회전(rolling)
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
    body.angle += body.angularVelocity * ctx.dt;
}

function resolveBodyBodyCollisions(bodies) {
    // NOTE: O(n^2) 유지 (구조 변경 없음). 대신 impulse를 "덜 튀게" 조금 조정.
    // - normal impulse 계수 낮추고
    // - tangent/스핀도 과하면 지터 생겨서 약간 줄임
    const NORMAL_IMPULSE_SCALE = 0.20;   // 기존 0.28 -> 0.20
    const TANGENT_IMPULSE_SCALE = 0.06;  // 기존 0.08 -> 0.06
    const SPIN_IMPULSE_SCALE = 0.0032;   // 기존 0.004 -> 0.0032

    for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
            const a = bodies[i];
            const b = bodies[j];

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const minDist = a.radius + b.radius;
            const distSq = (dx * dx) + (dy * dy);

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

            if (distSq >= minDist * minDist) continue;

            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            const aDragged = a.isPointerDragging === true;
            const bDragged = b.isPointerDragging === true;

            if (aDragged && bDragged) continue;

            // 분리(포인터로 잡힌 쪽은 고정 취급)
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

            // 상대 속도
            const relVx = b.vx - a.vx;
            const relVy = b.vy - a.vy;

            // 노멀 성분
            const sepSpeed = (relVx * nx) + (relVy * ny);
            if (sepSpeed < 0) {
                const impulse = -sepSpeed * NORMAL_IMPULSE_SCALE;
                if (!aDragged) {
                    a.vx -= impulse * nx;
                    a.vy -= impulse * ny;
                }
                if (!bDragged) {
                    b.vx += impulse * nx;
                    b.vy += impulse * ny;
                }
            }

            // 접선 성분(마찰/미끄러짐)
            const tx = -ny;
            const ty = nx;
            const relTanSpeed = (relVx * tx) + (relVy * ty);

            const tangentImpulse = relTanSpeed * TANGENT_IMPULSE_SCALE;
            if (!aDragged) {
                a.vx += tangentImpulse * tx;
                a.vy += tangentImpulse * ty;
            }
            if (!bDragged) {
                b.vx -= tangentImpulse * tx;
                b.vy -= tangentImpulse * ty;
            }

            // 스핀
            const spinImpulse = relTanSpeed * SPIN_IMPULSE_SCALE;
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

export function updateBasketPhysics(runtime) {
    const floor = runtime.height - WORLD_PADDING;
    const ceiling = WORLD_PADDING;
    const leftWall = WORLD_PADDING;
    const rightWall = runtime.width - WORLD_PADDING;

    const bodies = runtime.bodies;

    const shouldUseBasketShapeCollision = runtime?.drawBasketShape !== false;
    const basketMask = shouldUseBasketShapeCollision ? (runtime?.basketShapeAsset?.getCollisionMask?.() || null) : null;

    const basketRect = getBasketRenderLayout(runtime.width, runtime.height).basketRect;
    const basketWorldMaskBounds = getBasketMaskWorldBounds(basketMask, basketRect);

    // 마스크 모드에서는 월드 반발을 clamp-only로 둬서 2연타 튐 방지
    const useWorldBounce = !basketMask;

    for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i];

        // NaN/Inf 방지
        if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.vx) || !Number.isFinite(body.vy)) {
            body.x = clamp(runtime.width * 0.5, WORLD_PADDING + body.radius, runtime.width - WORLD_PADDING - body.radius);
            body.y = clamp(runtime.height * 0.5, WORLD_PADDING + body.radius, runtime.height - WORLD_PADDING - body.radius);
            body.vx = 0;
            body.vy = 0;
        }

        // 드래그 중: 조작성 우선.
        // 개선점: 예전엔 continue로 마스크 충돌을 스킵했는데,
        // 드래그 중에도 "깊게 박힘"이 생기면 풀어주는 게 안정적이라 substep 경로로 통과시킴.
        if (body.isPointerDragging === true) {
            clampBodyToWorld(body, leftWall, rightWall, ceiling, floor);

            // 드래그 중 에너지 감쇠(너무 튀는 입력값 완화)
            body.vx *= 0.76;
            body.vy *= 0.76;
            body.angularVelocity *= 0.65;

            // 드래그 중에도 마스크에 박혔으면 가볍게 풀기
            if (basketMask && basketWorldMaskBounds) {
                resolveBasketMaskCollision(body, basketMask, basketRect, basketWorldMaskBounds);
                clampBodyToWorld(body, leftWall, rightWall, ceiling, floor);
            }
            continue;
        }

        // substep 수 결정
        const substeps = computeSubstepsForBody(body);
        const dt = 1 / substeps;

        const ctx = {
            leftWall,
            rightWall,
            ceiling,
            floor,
            useWorldBounce,
            basketMask,
            basketRect,
            basketWorldMaskBounds,
            dt
        };

        // substep 적분
        for (let s = 0; s < substeps; s += 1) {
            integrateOneSubstep(body, runtime, ctx);
        }
    }

    // 바디-바디 충돌 (프레임당 1회. 필요하면 substep마다도 가능하지만 비용 큼)
    resolveBodyBodyCollisions(bodies);
}