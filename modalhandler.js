/* global chse, StackExchange, Awesomplete */
var DOI_BOX_CLASS = "doi-box";

if (!localStorage.getItem(chse.LS_KEY)) localStorage.setItem(chse.LS_KEY, "{}");

(function handleModals() {
	var PLACEHOLDER = "reference (DOI/URL/plain text)";

	function addButton(ul) {
		var li = document.createElement("LI"),
			// different userscripts insert their own elements into the mix
			// so make sure to insert just after the redo button for consistency
			lastChild = ul.querySelector("li[id^=wmd-redo-button]").nextElementSibling;

		ul.insertBefore(li, lastChild);

		li.className = "wmd-button wmd-doi tmAdded";
		// tmAdded required when also running this userscript https://github.com/BrockA/SE-misc
		li.innerHTML = "<span>doi</span>";
		li.title = "insert doi";

		li.onclick = function() {
			toggleModal(ul.parentElement);
		};

		return li;
	}

	function createModal(container) {
		var div = document.createElement("div"),
			input = document.createElement("input"),
			shortBtn = document.createElement("button"),
			longBtn = document.createElement("button");

		div.classList.add(DOI_BOX_CLASS);

		input.type = "text";
		input.className = "awesomplete";
		input.setAttribute("placeholder", PLACEHOLDER);
		input.onkeydown = function(e) {
			if (e.keyCode === 13) {
				e.preventDefault();
				e.stopPropagation();
				console.log("I tried!");
				return false;
			}
		};

		shortBtn.innerHTML = "Short";
		longBtn.innerHTML = "Long";

		function commonInsertCitation(type) {
			var fn = type === 1 ? insertShortCitation : insertLongCitation;

			return function(e) {
				e.preventDefault();
				chse.CITATION_TYPE = type;

				var val = input.value,
					source = chse.getURISource(val);

				switch (source[0]) {
					case "doi":
					case "paperWeb":
						chse.citeDOI(source[1], function(citation) {
							fn(container, citation);
						});
						break;
					case "web":
						chse.citeWebsite(val, function(citation) {
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
		var textarea = container.parentNode.querySelector("textarea"),
			selS = textarea.selectionStart,
			selE = textarea.selectionEnd,
			value = textarea.value,
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

	function getCurrentReferenceCount(value) {
		var match = value.match(/Reference(.|\n)+(\d)\. [a-zA-Z]/);
		// without the ` [a-zA-Z]`, this match also extends to even digits inside DOI URLs

		if (!match) return 0;
		else return +match[2];
	}

	function insertLongCitation(container, citation) {
		var textarea = container.parentNode.querySelector("textarea"),
			selS = textarea.selectionStart,
			selE = textarea.selectionEnd,
			value = textarea.value,
			currRefCount = getCurrentReferenceCount(value),
			superscriptedCite = "<sup>\\[" + (currRefCount + 1) + "\\]</sup>",
			valBefore = value.substring(0, selS),
			valAfter = value.substring(selE);

		value = valBefore + superscriptedCite + valAfter;

		if (currRefCount === 0) {
			value += "\n### References:\n\n1. " + citation;
			textarea.value = value;
		} else {
			var position = value.match(/Reference(.|\n)+\d\..+(\n|$)/),
				startOfReferences = position.index,
				lastReferenceNewline = startOfReferences + position[0].length,
				textBeforeLastRefNewLine = value.substring(0, lastReferenceNewline),
				textAfterLastRefNewLine = value.substring(lastReferenceNewline),
				valToInsert = "\n" + (currRefCount + 1) + ". " + citation + "\n",
				newValue = textBeforeLastRefNewLine + valToInsert + textAfterLastRefNewLine;

			textarea.value = newValue;
		}

		textarea.selectionStart = textarea.selectionEnd = (valBefore + superscriptedCite).length;
		toggleModal(container);
		textarea.focus();
		StackExchange.MarkdownEditor.refreshAllPreviews();
	}

	function toggleModal(container) {
		var div = container.querySelector("." + DOI_BOX_CLASS),
			input = div.querySelector("input");

		if (div.classList.contains("shown")) {
			div.classList.remove("shown");
		} else {
			div.classList.add("shown");
			input.value = "";
			input.focus();
		}

		console.trace();
	}

	var cachedKeys = Object.keys(JSON.parse(localStorage.getItem(chse.LS_KEY)));

	setInterval(function() {
		var cont = document.querySelector(".wmd-container:not(.doi-processed)"),
			ul,
			div,
			buttonBar,
			input;

		if (cont && (ul = cont.querySelector(".wmd-button-bar ul"))) {
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

			new Awesomplete(input, {
				list: cachedKeys
			});
		}
	}, 500);

	// there's no way to automatically read a clipboard content
	// think of some other UI
	// https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript
})();

var styleEl = document.createElement("style"),
	cssToUse = `
.awesomplete{
    position: inherit !important;
    /* required to keep the input element hidden while modal is collapsed*/
}

.${DOI_BOX_CLASS}{
    transition: 0.25s ease;
    height: 0px;
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

var newCSS = GM_getResourceText("awesompleteCSS");
GM_addStyle(newCSS);

chse.debugLog("Modal handler loaded");
