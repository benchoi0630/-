// 파일 역할: 모달 요소에 대한 공통 오픈/클로즈/이벤트 바인딩 래퍼를 생성한다.
// 핵심 책임: 선택자 기반 클릭 핸들러와 상태 클래스 토글을 일관된 API로 제공한다.
// 연동 범위: globalController 및 상세 모달 로직의 중복 모달 코드를 줄인다.

// 이 함수는 모달 공통 동작을 생성하고 열기와 닫기 API를 반환한다.
export function createModalBase(options = {}) {
    const hiddenClassName = options.hiddenClassName || "hidden";
    const closeOnOverlayClick = options.closeOnOverlayClick !== false;
    const closeOnEscape = options.closeOnEscape !== false;
    const rootEl = resolveRootElement(options);
    const contentEl = resolveContentElement(rootEl, options);
    const closeButtonSelectors = toSelectorList(options.closeButtonSelector);
    const backButtonSelectors = toSelectorList(options.backButtonSelector);
    const modalId = typeof options.modalId === "string" && options.modalId ? options.modalId : rootEl.id || "";
    let parentModalId = typeof options.parentModalId === "string" && options.parentModalId ? options.parentModalId : null;
    let childModalIds = Array.isArray(options.childModalIds) ? options.childModalIds.filter((id) => typeof id === "string" && id) : [];
    const removeFns = [];

    if (closeOnOverlayClick) {
        const overlayHandler = (event) => {
            if (event.target === rootEl) {
                if (typeof options.onOverlayCloseAll === "function") {
                    options.onOverlayCloseAll({ modalId, parentModalId });
                    return;
                }
                close("overlay");
            }
        };
        rootEl.addEventListener("click", overlayHandler);
        removeFns.push(() => rootEl.removeEventListener("click", overlayHandler));
    }

    if (closeOnEscape) {
        const keydownHandler = (event) => {
            if (event.key === "Escape" && isOpen()) {
                close("escape");
            }
        };
        document.addEventListener("keydown", keydownHandler);
        removeFns.push(() => document.removeEventListener("keydown", keydownHandler));
    }

    for (let i = 0; i < closeButtonSelectors.length; i += 1) {
        bindSelectorClick(rootEl, closeButtonSelectors[i], () => close("button"), removeFns);
    }

    for (let i = 0; i < backButtonSelectors.length; i += 1) {
        bindSelectorClick(rootEl, backButtonSelectors[i], () => goBack("back-button"), removeFns);
    }

    function isOpen() {
        return !rootEl.classList.contains(hiddenClassName);
    }

    function open() {
        rootEl.classList.remove(hiddenClassName);
    }

    function close(reason = "manual") {
        rootEl.classList.add(hiddenClassName);
        if (typeof options.onClose === "function") {
            options.onClose(reason);
        }
    }

    function goBack(reason = "back") {
        if (typeof options.onBack === "function") {
            options.onBack({ modalId, parentModalId, reason });
            return;
        }
        close(reason);
    }

    function getModalId() {
        return modalId;
    }

    function getParentModalId() {
        return parentModalId;
    }

    function setParentModalId(nextParentModalId) {
        parentModalId = typeof nextParentModalId === "string" && nextParentModalId ? nextParentModalId : null;
    }

    function getChildModalIds() {
        return [...childModalIds];
    }

    function setChildModalIds(nextChildModalIds) {
        childModalIds = Array.isArray(nextChildModalIds) ? nextChildModalIds.filter((id) => typeof id === "string" && id) : [];
    }

    function setContent(contentNode) {
        if (!contentEl || !contentNode) {
            return;
        }
        contentEl.textContent = "";
        contentEl.appendChild(contentNode);
    }

    function destroy() {
        for (let i = 0; i < removeFns.length; i += 1) {
            removeFns[i]();
        }
        if (options.createIfMissing && rootEl.parentNode) {
            rootEl.parentNode.removeChild(rootEl);
        }
    }

    return {
        rootEl,
        contentEl,
        open,
        close,
        goBack,
        isOpen,
        getModalId,
        getParentModalId,
        setParentModalId,
        getChildModalIds,
        setChildModalIds,
        setContent,
        destroy
    };
}

// 이 함수는 문자열 또는 배열 셀렉터 입력을 배열 셀렉터로 변환한다.
function toSelectorList(selectorInput) {
    if (typeof selectorInput === "string" && selectorInput) {
        return [selectorInput];
    }
    if (Array.isArray(selectorInput)) {
        return selectorInput.filter((selector) => typeof selector === "string" && selector);
    }
    return [];
}

// 이 함수는 셀렉터로 찾은 모든 버튼에 동일한 클릭 핸들러를 바인딩한다.
function bindSelectorClick(rootEl, selector, handler, removeFns) {
    const nodes = rootEl.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        node.addEventListener("click", handler);
        removeFns.push(() => node.removeEventListener("click", handler));
    }
}

// 이 함수는 옵션에 따라 기존 모달 루트를 찾거나 새로 생성해서 반환한다.
function resolveRootElement(options) {
    if (options.rootEl instanceof HTMLElement) {
        return options.rootEl;
    }

    if (!options.createIfMissing) {
        throw new Error("Modal root element is required.");
    }

    const rootEl = document.createElement("div");
    if (options.id) {
        rootEl.id = options.id;
    }
    rootEl.className = options.overlayClassName || "modal hidden";
    const mountTarget = options.mountTarget instanceof HTMLElement ? options.mountTarget : document.body;
    mountTarget.appendChild(rootEl);
    return rootEl;
}

// 이 함수는 모달 콘텐츠 요소를 찾아서 반환하고 없으면 생성한다.
function resolveContentElement(rootEl, options) {
    if (options.contentEl instanceof HTMLElement) {
        return options.contentEl;
    }

    if (typeof options.contentSelector === "string" && options.contentSelector) {
        const selected = rootEl.querySelector(options.contentSelector);
        if (selected instanceof HTMLElement) {
            return selected;
        }
    }

    const firstChild = rootEl.firstElementChild;
    if (firstChild instanceof HTMLElement) {
        return firstChild;
    }

    const contentEl = document.createElement("div");
    contentEl.className = options.contentClassName || "modal-content";
    rootEl.appendChild(contentEl);
    return contentEl;
}
