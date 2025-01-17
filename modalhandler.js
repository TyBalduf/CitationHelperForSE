/* global chse, StackExchange, Awesomplete */
const DOI_BOX_CLASS = "doi-box";

if (!localStorage.getItem(chse.LS_KEY)) { localStorage.setItem(chse.LS_KEY, "{}"); }

GM_addStyle(GM_getResourceText("modalCSS"));

(function handleModals() {
    const PLACEHOLDER = "reference (DOI/URL/plain text)";

    function addButton(ul) {
        const li = document.createElement("LI"),
            // different userscripts insert their own elements into the mix
            // so make sure to insert just after the redo button for consistency
            lastChild = ul.querySelector("li[id^=wmd-redo-button]").nextElementSibling;

        ul.insertBefore(li, lastChild);

        // class wmd-button does not play nicely, adds an overlay
        // of the bold button by default
        li.className = "wmd-my-button wmd-doi tmAdded";
        // tmAdded required when also running this userscript https://github.com/BrockA/SE-misc
        li.innerHTML = "<span>doi</span>";
        li.title = "insert doi";

        li.onclick = function () {
            toggleModal(ul.parentElement);
        };

        return li;
    }

    function createModal(container) {
        const div = document.createElement("div"),
            input = document.createElement("input"),
            shortBtn = document.createElement("button"),
            longBtn = document.createElement("button");

        div.classList.add(DOI_BOX_CLASS);

        input.type = "text";
        input.className = "awesomplete";
        input.setAttribute("placeholder", PLACEHOLDER);
        input.onkeydown = function (e) {
            if (e.keyCode === 13) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            return true;
        };

        shortBtn.innerHTML = "Short";
        longBtn.innerHTML = "Long";

        function commonInsertCitation(type) {
            const fn = type === 1 ? insertShortCitation : insertLongCitation;

            return function (e) {
                e.preventDefault();
                chse.CITATION_TYPE = type;

                const val = input.value,
                    source = chse.getURISource(val);

                switch (source[0]) {
                case "doi":
                case "paperWeb":
                    chse.citeDOI(source[1], (citation) => {
                        fn(container, citation);
                    });
                    break;
                case "web":
                    chse.citeWebsite(val, (citation) => {
                        fn(container, citation);
                    });
                    // it is not a DOI and there is no need to cache it (because it isn't fetched via an XHR)
                    // but adding it to the localStorage list helps autocomplete it later
                    // (think of a person referencing Vogel multiple times)
                    chse.cacheDOI(val, val);
                    break;
                    // alternate of Manual citation
                default:
                    chse.cacheDOI(val, val);
                    fn(container, val);
                }
            };
        }

        shortBtn.onclick = commonInsertCitation(1);
        longBtn.onclick = commonInsertCitation(2);

        div.appendChild(input);
        div.appendChild(shortBtn);
        div.appendChild(longBtn);

        return div;
    }

    function insertShortCitation(container, citation) {
        const textarea = container.parentNode.querySelector("textarea"),
            selS = textarea.selectionStart,
            selE = textarea.selectionEnd,
            { value } = textarea,
            valBefore = value.substring(0, selS),
            valAfter = value.substring(selE);

        textarea.value = valBefore + citation + valAfter;
        textarea.selectionStart = textarea.selectionEnd = (valBefore + citation).length;
        toggleModal(container);
        textarea.focus();

        // couldn't find the documentation for this, but it works ---v
        // (widely used https://github.com/search?q=refreshAllPreviews&type=Code)
        StackExchange.MarkdownEditor.refreshAllPreviews();
    }

    function getCitationIndicatorText(position) {
        return `<sup>\\[${position}\\]</sup>`;
    }

    /**
	 * returns the reference superscript count (say 2) - for example -
	 * by checking for all the superscripts that were ahead and behind the caret
	 * at the time this gets executed.
	 * So, something like: `[1]|[2][3]` returns `[2]` and changes the textarea
	 * value to `[1]|[3][4]`. This has to also update the reference list at the bottom
	 * of the textarea
	 * @param {Element} textarea the textarea in which citation is to be inserted
	 */
    function setCurrentReferenceCount(textarea) {
        let { value } = textarea,
            caretPos = textarea.selectionStart,
            valBefore = value.substring(0, caretPos),
            valAfter = value.substring(caretPos),
            // newlines return only the first match, see https://regex101.com/r/BFNUEI/1
            lastIndexBeforeMatch = valBefore.replace(/[\r\n]/g, "").match(/\\\[(\d+)\\\]<\/sup>(?!.*?<sup>\\\[)/),
            currRefCount = lastIndexBeforeMatch ? +lastIndexBeforeMatch[1] : 0,
            nextIndices = currRefCount + 1;

        valAfter = valAfter.replace(/\\\[\d+\\\]/g, () => `\\[${++nextIndices}\\]`);

        textarea.value = valBefore + valAfter;
        textarea.selectionEnd = textarea.selectionStart = caretPos;
        textarea.focus();
        return currRefCount;
    }

    function incrementRefBulletPoints(textAfterInsertionPoint, currPosition) {
        return textAfterInsertionPoint.replace(/^\d+\s*\./gm, () => `${++currPosition}.`);
    }

    function insertLongCitation(container, citation) {
        let textarea = container.parentNode.querySelector("textarea"),
            selS = textarea.selectionStart,
            selE = textarea.selectionEnd,
            currRefCount = setCurrentReferenceCount(textarea),
            refCountToInsert = currRefCount + 1,
            superscriptedCite = getCitationIndicatorText(refCountToInsert),
            { value } = textarea,
            valBefore = value.substring(0, selS),
            valAfter = value.substring(selE),
            position;

        value = valBefore + superscriptedCite + valAfter;
        position = value.match(/Reference(.|\n)+\d\..+(\n|$)/);

        if (!position) {
            value = value.replace(/\n*$/, "");
            value += `\n\n **References**:\n\n1. ${citation}`;
            textarea.value = value;
        } else {
            let refCountAlreadyExists = value.match(new RegExp(`${refCountToInsert}\\..+(\\n|$)`)),
                positionToInsertReference = refCountAlreadyExists ? refCountAlreadyExists.index : null,
                startOfReferences = position.index,
                lastReferenceNewline = startOfReferences + position[0].length;

            if (!positionToInsertReference) { positionToInsertReference = lastReferenceNewline; }

            const textBeforeInsertionPoint = value.substring(0, positionToInsertReference),
                textAfterInsertionPoint = value.substring(positionToInsertReference),
                valToInsert = `${(textBeforeInsertionPoint.endsWith("\n") ? "" : "\n")
					+ refCountToInsert
                }. ${
                    citation
                }${textAfterInsertionPoint.startsWith("\n") ? "" : "\n"}`,
                newValue = textBeforeInsertionPoint
					+ valToInsert
					+ incrementRefBulletPoints(textAfterInsertionPoint, refCountToInsert);

            textarea.value = newValue;
        }

        textarea.selectionStart = textarea.selectionEnd = (valBefore + superscriptedCite).length;
        toggleModal(container);
        textarea.focus();
        StackExchange.MarkdownEditor.refreshAllPreviews();
    }

    function toggleModal(container) {
        const div = container.querySelector(`.${DOI_BOX_CLASS}`),
            buttonBar = div.parentElement,
            input = div.querySelector("input");

        if (div.classList.contains("shown")) {
            div.classList.remove("shown");
            buttonBar.style.height = "0px";
            buttonBar.style.overflow = "hidden";
        } else {
            div.classList.add("shown");
            // original height is 90px, 100px required to accommodate
            // margin top 10px
            buttonBar.style.height = "100px";
            buttonBar.style.overflow = "visible";
            input.value = "";
            input.focus();
        }

        console.trace();
    }

    const cachedKeys = Object.keys(JSON.parse(localStorage.getItem(chse.LS_KEY)));

    setInterval(() => {
        let cont = document.querySelector(".wmd-container:not(.doi-processed)"),
            ul = cont ? cont.querySelector(".wmd-button-bar ul") : undefined,
            div,
            buttonBar,
            input;

        if (ul) {
            addButton(ul);
            cont.classList.add("doi-processed");

            buttonBar = cont.querySelector("div[id^=wmd-button-bar]");

            div = createModal(buttonBar);
            buttonBar.appendChild(div);

            // only call the constructor after the input element
            // is inside the DOM
            input = div.querySelector("input");
            input.dataset.minchars = 1;
            input.dataset.maxitems = 5;
            input.dataset.autofirst = true;

            // eslint-disable-next-line no-unused-vars
            const awesomepleteObject = new Awesomplete(input, {
                list: cachedKeys,
            });
        }
    }, 500);

    // there's no way to automatically read a clipboard content
    // think of some other UI
    // https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript
}());

const styleEl = document.createElement("style"),
    cssToUse = `
.awesomplete{
    position: inherit !important;
    /* required to keep the input element hidden while modal is collapsed*/
}

.wmd-my-button {
    max-width: 28px;
    height: 44px;
    flex: 10 0 23px;
    padding: 0;
    padding: 12px 0 0 0;
    text-align: center;
    cursor: pointer;
}

.${DOI_BOX_CLASS}{
    transition: 0.25s ease;
    height: 0px;
	padding-left: 10px;
}

.${DOI_BOX_CLASS} input{
    display: inline-block;
    width: 500px;
    font-size: 14px;
    padding: 8px;
    position: inherit;
}

.${DOI_BOX_CLASS}.shown {
	 height: 45px;
}

.${DOI_BOX_CLASS} button{
    position: inherit; /*allows buttons to flow in and out*/
    margin: 5px;
}
`;
styleEl.setAttribute("type", "text/css");
styleEl.textContent = cssToUse;
document.head.appendChild(styleEl);

const newCSS = GM_getResourceText("awesompleteCSS");
GM_addStyle(newCSS);

chse.debugLog("Modal handler loaded");
