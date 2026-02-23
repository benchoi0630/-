// 파일 역할: 중복 바인딩을 막는 이벤트 등록 유틸(`bindEventOnce`)을 제공한다.
// 핵심 책임: 요소 dataset 키를 이용해 동일 핸들러의 반복 등록을 방지한다.
// 연동 범위: 페이지 재렌더 구조에서 리스너 누적 버그를 줄이기 위한 공통 도구다.

// 이 유틸은 같은 요소와 키 조합에 이벤트 리스너를 한 번만 바인딩한다.
export function bindEventOnce(element, eventName, key, handler) {
    if (!element || typeof handler !== "function") {
        return;
    }

    if (element.dataset[key] === "true") {
        return;
    }

    element.addEventListener(eventName, handler);
    element.dataset[key] = "true";
}
