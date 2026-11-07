let programLines = [];
let currentLine = 0;

let variables = {};
let waitingForInput = false;
let inputVariable = null;

let executionFinished = false;
let executionPaused = false;
let stepByStepMode = false;
let stepNumber = 0;
let pendingElseIfLines = new Set();
let loopFrames = [];
let pendingInlineCaseStatement = null;
let executingLineNumber = null;
let executionDelayTimer = null;
let selectedIdentifierName = null;

function syncExecutionControls() {
    const button = document.getElementById("pauseRunButton");
    const active = programLines.length > 0 && !executionFinished;
    if (button) {
        button.disabled = !active;
        button.textContent = executionPaused ? "▶ Resume" : "⏸ Pause Run";
        button.setAttribute("aria-pressed", String(executionPaused));
    }
    const stopButton = document.getElementById("stopRunButton");
    if (stopButton) stopButton.disabled = !active;
}

function toggleExecutionPause() {
    if (!programLines.length || executionFinished) return;
    executionPaused = !executionPaused;
    if (executionPaused) {
        if (executionDelayTimer) clearTimeout(executionDelayTimer);
        executionDelayTimer = null;
        setEditorStatus("Paused");
    } else {
        setEditorStatus(waitingForInput ? "Waiting for Input" : "Running");
        if (!waitingForInput) executeNextLine();
    }
    syncExecutionControls();
}

function stopProgram() {
    if (!programLines.length || executionFinished) return;
    if (executionDelayTimer) clearTimeout(executionDelayTimer);
    executionDelayTimer = null;
    executionPaused = false;
    executionFinished = true;
    clearExecutionTracker();
    hideInput();
    setEditorStatus("Stopped");
    printOutput("\nProgram stopped.");
    syncExecutionControls();
}


/* =========================================================
   OUTPUT
========================================================= */

function printOutput(text) {

    const output =
        document.getElementById("output");

    output.textContent += text + "\n";

    output.scrollTop =
        output.scrollHeight;
}


function clearOutput() {

    document.getElementById(
        "output"
    ).textContent = "";
}


/* =========================================================
   CLEAR PROGRAM
========================================================= */

function clearProgram() {

    if (executionDelayTimer) clearTimeout(executionDelayTimer);
    executionDelayTimer = null;
    executingLineNumber = null;

    const editor =
        document.getElementById(
            "pseudocode"
        );

    editor.value = "";
    window.recordPseudocodeChange?.("command");

    variables = {};
    programLines = [];
    currentLine = 0;
    stepNumber = 0;
    loopFrames = [];
    pendingInlineCaseStatement = null;

    executionFinished = false;
    executionPaused = false;
    stepByStepMode = false;

    updateEditorVisuals();

    clearOutput();

    hideInput();

    setEditorStatus("Ready");
    syncExecutionControls();
}


/* =========================================================
   EDITOR STATUS
========================================================= */

function setEditorStatus(status) {

    const statusElement =
        document.querySelector(
            ".editor-status"
        );

    if (!statusElement) {
        return;
    }

    statusElement.innerHTML =
        '<span class="status-dot"></span>' +
        status;
}


/* =========================================================
   LINE NUMBERS
========================================================= */

const indentGuideMeasureCanvas = document.createElement("canvas");
const indentGuideMeasureContext = indentGuideMeasureCanvas.getContext("2d");

let indentGuideFrame = 0;

function renderIndentGuides() {
    if (indentGuideFrame) return;
    indentGuideFrame = requestAnimationFrame(() => {
        indentGuideFrame = 0;
        drawIndentGuidesNow();
    });
}

function drawIndentGuidesNow() {
    const svg = document.getElementById("indentGuides");
    const editor = document.getElementById("pseudocode");
    if (!svg || !editor) return;

    const styles = getComputedStyle(editor);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
    const fontSize = Number.parseFloat(styles.fontSize) || 14;
    const fontFamily = styles.fontFamily || "monospace";
    const metrics = indentGuideMeasureContext;
    if (!metrics) return;
    metrics.font = `${styles.fontWeight || "400"} ${fontSize}px ${fontFamily}`;
    const charWidth = metrics.measureText("0").width || fontSize * 0.6;
    const indentWidth = Math.max(1, Math.min(8, Number(window.dpfPreferences?.indentSize) || 4));
    const lines = editor.value.split("\n");
    const offsets = [];
    let documentOffset = 0;
    lines.forEach(line => { offsets.push(documentOffset); documentOffset += line.length + 1; });
    const caret = editor.selectionStart;
    let caretLine = 0;
    for (let index = 0; index < caret; index += 1) if (editor.value[index] === "\n") caretLine += 1;
    const indentSegments = [];
    const indentStack = [];
    let previousIndent = 0;
    let previousLine = -1;

    function visualIndent(line) {
        let columns = 0;
        for (const char of line) {
            if (char === " ") columns += 1;
            else if (char === "\t") columns += indentWidth - (columns % indentWidth);
            else break;
        }
        return columns;
    }

    function visualColumn(line, stop) {
        let columns = 0;
        for (let index = 0; index < stop; index += 1) {
            columns += line[index] === "\t" ? indentWidth - (columns % indentWidth) : 1;
        }
        return columns;
    }

    lines.forEach((line, index) => {
        if (!line.trim()) return;
        const indent = visualIndent(line);
        while (indentStack.length && indent < indentStack[indentStack.length - 1].level) {
            const block = indentStack.pop();
            indentSegments.push({ column: block.level, startLine: block.startLine, endLine: index, active: caretLine >= block.startLine && caretLine <= index });
        }
        const knownLevel = indentStack.length ? indentStack[indentStack.length - 1].level : previousIndent;
        if (indent > knownLevel) {
            for (let level = knownLevel + indentWidth; level <= indent; level += indentWidth) {
                indentStack.push({ level, startLine: index });
            }
        }
        previousIndent = indent;
        previousLine = index;
    });
    while (indentStack.length) {
        const block = indentStack.pop();
        indentSegments.push({ column: block.level, startLine: block.startLine, endLine: Math.max(block.startLine + 1, previousLine + 1), active: caretLine >= block.startLine && caretLine <= previousLine + 1 });
    }

    const bracketSegments = [];
    const bracketStack = [];
    const openToClose = { "{": "}", "[": "]", "(": ")" };
    const closeToOpen = { "}": "{", "]": "[", ")": "(" };
    lines.forEach((line, lineIndex) => {
        let quote = "";
        let escaped = false;
        for (let column = 0; column < line.length; column += 1) {
            const char = line[column];
            const next = line[column + 1];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === "\\") escaped = true;
                else if (char === quote) quote = "";
                continue;
            }
            if (char === "'" || char === '"') { quote = char; continue; }
            if ((char === "/" && next === "/") || char === "#") break;
            if (openToClose[char]) {
                bracketStack.push({ char, line: lineIndex, column, offset: offsets[lineIndex] + column });
            } else if (closeToOpen[char] && bracketStack.length && bracketStack[bracketStack.length - 1].char === closeToOpen[char]) {
                const open = bracketStack.pop();
                if (lineIndex > open.line) {
                    const endOffset = offsets[lineIndex] + column;
                    bracketSegments.push({ column: visualColumn(lines[open.line], open.column) + 1, startLine: open.line, endLine: lineIndex, active: caret >= open.offset && caret <= endOffset });
                }
            }
        }
    });

    const width = Math.max(1, svg.clientWidth || editor.clientWidth);
    const height = Math.max(1, svg.clientHeight || editor.clientHeight);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.replaceChildren();
    const isLight = document.body.dataset.theme === "light";
    const inactive = isLight ? "#64748b" : "#94a3b8";
    const active = getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim() || (isLight ? "#4f46e5" : "#a5b4fc");
    const seen = new Set();
    [...indentSegments, ...bracketSegments].forEach(segment => {
        if (segment.endLine <= segment.startLine) return;
        const x = 18 + segment.column * charWidth - editor.scrollLeft;
        const y1 = 16 + segment.startLine * lineHeight - editor.scrollTop;
        const y2 = 16 + (segment.endLine + 1) * lineHeight - editor.scrollTop;
        if (x < -2 || x > width + 2 || y2 < 0 || y1 > height) return;
        const key = `${Math.round(x * 10)}:${Math.round(y1)}:${Math.round(y2)}`;
        const isActive = segment.active;
        const existing = seen.get(key);
        if (existing) {
            if (isActive) { existing.setAttribute("stroke", active); existing.setAttribute("stroke-width", "1.8"); existing.setAttribute("stroke-opacity", "0.9"); }
            return;
        }
        const guide = document.createElementNS("http://www.w3.org/2000/svg", "line");
        guide.setAttribute("x1", x); guide.setAttribute("x2", x);
        guide.setAttribute("y1", y1); guide.setAttribute("y2", y2);
        guide.setAttribute("stroke", isActive ? active : inactive);
        guide.setAttribute("stroke-width", isActive ? "1.8" : "0.8");
        guide.setAttribute("stroke-opacity", isActive ? "0.9" : "0.24");
        guide.setAttribute("vector-effect", "non-scaling-stroke");
        svg.appendChild(guide);
        seen.set(key, guide);
    });
}

function updateLineNumbers() {

    const editor =
        document.getElementById(
            "pseudocode"
        );

    const lineNumbers =
        document.getElementById(
            "lineNumbers"
        );

    const lines =
        editor.value.split("\n");

    lineNumbers.innerHTML = lines.map((_, index) => {
        const number = index + 1;
        return number === executingLineNumber
            ? `<span class="execution-current-gutter">${number}</span>`
            : String(number);
    }).join("\n");

    updateLineStatus();
}


function updateLineStatus() {

    const editor =
        document.getElementById(
            "pseudocode"
        );

    const lines =
        editor.value.split("\n");

    document.getElementById(
        "lineStatus"
    ).textContent =
        "Lines: " +
        lines.length;
}


/* =========================================================
   SYNTAX HIGHLIGHTING
========================================================= */

function escapeHtml(text) {

    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


const highlightKeywords = new Set([
    "start",
    "stop",
    "declare",
    "print",
    "output",
    "read",
    "if",
    "then",
    "else",
    "endif",
    "end",
    "and",
    "or",
    "not",
    "case",
    "of",
    "otherwise",
    "endcase",
    "for",
    "to",
    "step",
    "endfor",
    "while",
    "do",
    "endwhile",
    "repeat",
    "until"
]);


const highlightTypes = new Set([
    "boolean",
    "character",
    "float",
    "integer",
    "real",
    "string",
    "constant"
]);


function highlightCodeLine(line, activeIdentifier = null) {

    let result = "";

    let i = 0;


    while (
        i < line.length
    ) {

        const char =
            line[i];


        /*
           COMMENTS
        */

        if (
            char === "/" &&
            line[i + 1] === "/"
        ) {

            result +=
                '<span class="hl-comment">' +
                escapeHtml(
                    line.substring(i)
                ) +
                "</span>";

            break;
        }


        /*
           QUOTED STRINGS
        */

        if (
            char === '"' ||
            char === "'" ||
            char === "“" ||
            char === "”" ||
            char === "‘" ||
            char === "’"
        ) {

            const quote =
                char;


            let end =
                i + 1;


            while (
                end < line.length
            ) {

                if (
                    line[end] === quote
                ) {

                    end++;
                    break;
                }

                end++;
            }


            result +=
                '<span class="hl-string">' +
                escapeHtml(
                    line.substring(
                        i,
                        end
                    )
                ) +
                "</span>";

            i = end;

            continue;
        }


        /*
           NUMBERS
        */

        if (
            /[0-9]/.test(char)
        ) {

            let end =
                i + 1;


            while (
                end < line.length &&
                /[0-9.]/.test(
                    line[end]
                )
            ) {

                end++;
            }


            result +=
                '<span class="hl-number">' +
                escapeHtml(
                    line.substring(
                        i,
                        end
                    )
                ) +
                "</span>";

            i = end;

            continue;
        }


        /*
           WORDS
        */

        if (
            /[A-Za-z_]/.test(char)
        ) {

            let end =
                i + 1;


            while (
                end < line.length &&
                /[A-Za-z0-9_]/.test(
                    line[end]
                )
            ) {

                end++;
            }


            const word =
                line.substring(
                    i,
                    end
                );


            const lowerWord =
                word.toLowerCase();


            const tokenClass = highlightKeywords.has(lowerWord)
                ? "hl-keyword"
                : highlightTypes.has(lowerWord)
                    ? "hl-type"
                    : "hl-identifier";
            const tokenMarkup = `<span class="${tokenClass}">${escapeHtml(word)}</span>`;
            result += activeIdentifier && word.toLowerCase() === activeIdentifier.toLowerCase()
                ? `<span class="hl-variable-match">${tokenMarkup}</span>`
                : tokenMarkup;


            i = end;

            continue;
        }


        /*
           OPERATORS
        */

        if (
            "+-*/%=<>".includes(
                char
            )
        ) {

            let operator =
                char;


            if (
                (
                    char === ">" ||
                    char === "<" ||
                    char === "!" ||
                    char === "="
                ) &&
                line[i + 1] === "="
            ) {

                operator += "=";

                i++;
            }


            result +=
                '<span class="hl-operator">' +
                escapeHtml(operator) +
                "</span>";

            i++;

            continue;
        }


        /*
           NORMAL CHARACTER
        */

        result +=
            escapeHtml(char);

        i++;
    }


    return result;
}

function getDeclaredVariableNames(source) {
    const names = new Set();
    const declarationPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s+as\s+(?:boolean|character|float|integer|real|string|constant)\b/gim;
    let match;
    while ((match = declarationPattern.exec(source))) {
        match[1].split(",").forEach(name => names.add(name.trim()));
    }
    return Array.from(names);
}

function getTokenRangeAtCaret(text, caret, selectionEnd = caret) {
    if (selectionEnd > caret) {
        const selected = text.slice(caret, selectionEnd);
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(selected)) return { word: selected, start: caret, end: selectionEnd };
    }
    let position = caret;
    if (position < text.length && /[A-Za-z0-9_]/.test(text[position])) {
        // Caret is at the start or middle of an identifier.
    } else if (position > 0 && /[A-Za-z0-9_]/.test(text[position - 1])) {
        position--;
    } else return null;
    let start = position;
    let end = position + 1;
    while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--;
    while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
    const word = text.slice(start, end);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) return null;
    return { word, start, end };
}

function getIdentifierAtCaret(editorElement) {
    let range = getTokenRangeAtCaret(editorElement.value, editorElement.selectionStart, editorElement.selectionEnd);
    if (range && editorElement.selectionEnd > editorElement.selectionStart && editorElement.selectionEnd - editorElement.selectionStart !== range.word.length) {
        range = getTokenRangeAtCaret(editorElement.value, editorElement.selectionStart, editorElement.selectionStart);
    }
    if (!range) return null;
    const lower = range.word.toLowerCase();
    if (highlightKeywords.has(lower) || highlightTypes.has(lower)) return null;
    return range;
}

function updateHighlight() {

    const editor =
        document.getElementById(
            "pseudocode"
        );

    const highlight =
        document.getElementById(
            "highlightLayer"
        );


    const lines =
        editor.value.split("\n");

    selectedIdentifierName = getIdentifierAtCaret(editor)?.word || null;


    highlight.innerHTML = lines.map((line, index) => {
        const content = highlightCodeLine(line, selectedIdentifierName) || " ";
        return index + 1 === executingLineNumber
            ? `<span class="execution-current-line">${content}</span>`
            : content;
    }).join("\n");


    syncEditorScroll();
}


function syncEditorScroll() {

    const editor =
        document.getElementById(
            "pseudocode"
        );

    const highlight =
        document.getElementById(
            "highlightLayer"
        );

    const lineNumbers =
        document.getElementById(
            "lineNumbers"
        );


    highlight.scrollTop =
        editor.scrollTop;

    highlight.scrollLeft =
        editor.scrollLeft;

    lineNumbers.scrollTop =
        editor.scrollTop;
}


function updateEditorVisuals() {

    updateLineNumbers();

    updateHighlight();

    syncEditorScroll();
    renderIndentGuides();
    const prefs = window.dpfPreferences || {};
    const lineNumbers = document.getElementById("lineNumbers");
    const highlight = document.getElementById("highlightLayer");
    if (lineNumbers) lineNumbers.hidden = prefs.showLineNumbers === false;
    if (highlight) {
        const traceOnly = prefs.syntaxHighlighting === false && prefs.traceExecution !== false && executingLineNumber !== null;
        highlight.hidden = prefs.syntaxHighlighting === false && !traceOnly;
        highlight.classList.toggle("trace-only", traceOnly);
    }
}

function clearExecutionTracker() {
    executingLineNumber = null;
    updateEditorVisuals();
}

function showExecutionTracker(lineNumber, sourceLine) {
    if (window.dpfPreferences?.traceExecution === false) return;
    executingLineNumber = lineNumber;
    const editor = document.getElementById("pseudocode");
    if (editor) {
        const style = window.getComputedStyle(editor);
        const lineHeight = Number.parseFloat(style.lineHeight) || (Number.parseFloat(style.fontSize) || 14) * 1.6;
        const paddingTop = Number.parseFloat(style.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
        const lineTop = (lineNumber - 1) * lineHeight + paddingTop;
        const visibleTop = editor.scrollTop + paddingTop;
        const visibleBottom = editor.scrollTop + editor.clientHeight - paddingBottom;
        if (lineTop < visibleTop) editor.scrollTop = Math.max(0, lineTop - paddingTop);
        else if (lineTop + lineHeight > visibleBottom) editor.scrollTop = lineTop + lineHeight - editor.clientHeight + paddingBottom;
    }
    updateEditorVisuals();
}


/* =========================================================
   QUOTES
========================================================= */

function normalizeQuotes(text) {

    if (window.dpfPreferences?.normalizeQuotes === false) return text;
    return text
        .replace(
            /[“”]/g,
            '"'
        )
        .replace(
            /[‘’]/g,
            "'"
        );
}


function removeComment(line) {

    let insideDoubleQuotes = false;
    let insideSingleQuotes = false;


    for (
        let i = 0;
        i < line.length;
        i++
    ) {

        const char =
            line[i];


        if (
            char === '"' &&
            !insideSingleQuotes
        ) {

            insideDoubleQuotes =
                !insideDoubleQuotes;

            continue;
        }


        if (
            char === "'" &&
            !insideDoubleQuotes
        ) {

            insideSingleQuotes =
                !insideSingleQuotes;

            continue;
        }


        if (
            char === "/" &&
            line[i + 1] === "/" &&
            !insideDoubleQuotes &&
            !insideSingleQuotes
        ) {

            return line.substring(
                0,
                i
            );
        }
    }


    return line;
}


function checkQuotationMarks(line) {

    let insideDoubleQuotes = false;
    let insideSingleQuotes = false;


    for (
        let i = 0;
        i < line.length;
        i++
    ) {

        const char =
            line[i];


        if (
            char === '"' &&
            !insideSingleQuotes
        ) {

            insideDoubleQuotes =
                !insideDoubleQuotes;

            continue;
        }


        if (
            char === "'" &&
            !insideDoubleQuotes
        ) {

            insideSingleQuotes =
                !insideSingleQuotes;
        }
    }


    if (
        insideDoubleQuotes
    ) {

        return 'Missing closing quotation mark (").';
    }


    if (
        insideSingleQuotes
    ) {

        return "Missing closing quotation mark (').";
    }


    return null;
}


/* =========================================================
   VARIABLE NAME RULES
========================================================= */

function isValidIdentifier(name) {

    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(
        name
    );
}


function validateVariableName(name) {

    const trimmedName =
        name.trim();


    if (
        trimmedName === ""
    ) {

        return "Variable name cannot be empty.";
    }


    if (
        /\s/.test(
            trimmedName
        )
    ) {

        return (
            "Variable names cannot contain spaces. " +
            "For two or more words, use camelCase or underscores, " +
            "such as newItem or new_Item."
        );
    }


    if (
        !isValidIdentifier(
            trimmedName
        )
    ) {

        return (
            "Invalid variable name. Use letters, numbers and underscores only. " +
            "For two or more words, use camelCase or underscores, " +
            "such as newItem or new_Item."
        );
    }


    if (
        /^[0-9]/.test(
            trimmedName
        )
    ) {

        return "Variable names cannot begin with a number.";
    }


    return null;
}


/* =========================================================
   DATA TYPES
========================================================= */

const allowedDataTypes = [
    "boolean",
    "character",
    "float",
    "integer",
    "real",
    "string",
    "constant"
];


function isValidDataType(type) {

    return allowedDataTypes.includes(
        type.toLowerCase()
    );
}


function validateValueForType(
    value,
    type
) {

    type =
        type.toLowerCase();


    if (
        type === "boolean"
    ) {

        if (
            typeof value !== "boolean"
        ) {

            throw new Error(
                "Boolean variables can only contain true or false."
            );
        }

        return;
    }


    if (
        type === "character"
    ) {

        if (
            typeof value !== "string" ||
            value.length !== 1
        ) {

            throw new Error(
                "Character variables must contain exactly one character."
            );
        }

        return;
    }


    if (
        type === "string"
    ) {

        if (
            typeof value !== "string"
        ) {

            throw new Error(
                "String variables must contain text."
            );
        }

        return;
    }


    if (
        type === "integer"
    ) {

        if (
            typeof value !== "number" ||
            !Number.isInteger(value)
        ) {

            throw new Error(
                "Integer variables can only contain whole numbers."
            );
        }

        return;
    }


    if (
        type === "float"
    ) {

        if (
            typeof value !== "number" ||
            !Number.isFinite(value)
        ) {

            throw new Error(
                "Float variables must contain a valid number."
            );
        }

        return;
    }


    if (
        type === "real"
    ) {

        if (
            typeof value !== "number" ||
            !Number.isFinite(value)
        ) {

            throw new Error(
                "Real variables can only contain numbers."
            );
        }

        return;
    }


    if (
        type === "constant"
    ) {

        if (
            value === undefined ||
            value === null
        ) {

            throw new Error(
                "A constant must have a value."
            );
        }
    }
}


/* =========================================================
   PRINT TOKENIZER
========================================================= */

function tokenizePrint(text) {

    const tokens = [];

    let current = "";

    let insideQuotes = false;
    let quoteType = null;


    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        const char =
            text[i];


        if (
            char === '"' ||
            char === "'"
        ) {

            if (!insideQuotes) {

                insideQuotes = true;

                quoteType =
                    char;

                current += char;

            } else if (
                char === quoteType
            ) {

                insideQuotes = false;

                current += char;


                tokens.push({
                    type: "quoted",
                    value:
                        current.trim()
                });


                current = "";

                quoteType = null;

            } else {

                current += char;
            }

            continue;
        }


        if (
            !insideQuotes &&
            char === ","
        ) {

            if (
                current.trim() !== ""
            ) {

                tokens.push({
                    type: "expression",
                    value:
                        current.trim()
                });

                current = "";
            }


            tokens.push({
                type: "comma",
                value: ","
            });

            continue;
        }


        current += char;
    }


    if (
        current.trim() !== ""
    ) {

        tokens.push({
            type: "expression",
            value:
                current.trim()
        });
    }


    return tokens;
}


/* =========================================================
   PRINT SYNTAX
========================================================= */

function checkPrintSyntax(line) {

    const printText =
        line.trim()
            .substring(5)
            .trim();


    if (
        printText === ""
    ) {

        return "PRINT requires a value or message.";
    }


    const tokens =
        tokenizePrint(
            printText
        );


    if (
        tokens.length > 0 &&
        tokens[0].type === "comma"
    ) {

        return (
            "Comma cannot appear at the beginning " +
            "of a PRINT statement."
        );
    }


    if (
        tokens.length > 0 &&
        tokens[
            tokens.length - 1
        ].type === "comma"
    ) {

        return (
            "Comma must be followed by another " +
            "value or variable."
        );
    }


    for (
        let i = 0;
        i < tokens.length - 1;
        i++
    ) {

        if (
            tokens[i].type === "comma" &&
            tokens[i + 1].type === "comma"
        ) {

            return (
                "Unexpected comma. " +
                "Two commas cannot appear together."
            );
        }
    }


    for (
        let i = 0;
        i < tokens.length - 1;
        i++
    ) {

        if (
            tokens[i].type === "quoted" &&
            tokens[i + 1].type === "expression"
        ) {

            return (
                "Missing comma between " +
                "PRINT output items."
            );
        }
    }


    return null;
}


/* =========================================================
   DECLARATION CHECK
========================================================= */

function checkDeclarationSyntax(line) {

    const declaration =
        line.trim();


    const match =
        declaration.match(
            /^(.+?)\s+as\s+(boolean|character|float|integer|real|string|constant)(?:\s*=\s*(.+))?$/i
        );


    if (!match) {

        return (
            "Invalid declaration. Expected: " +
            "variable as boolean, character, float, integer, real, string or constant."
        );
    }


    const variableName =
        match[1].trim();


    const type =
        match[2].toLowerCase();


    const initialValue =
        match[3];


    const names =
        variableName.split(",");


    for (
        const name of names
    ) {

        const nameError =
            validateVariableName(
                name.trim()
            );


        if (
            nameError
        ) {

            return nameError;
        }
    }


    if (
        !isValidDataType(type)
    ) {

        return "Invalid data type.";
    }


    if (
        type === "constant" &&
        initialValue === undefined
    ) {

        return "A constant must have an assigned value.";
    }


    if (
        names.length > 1 &&
        initialValue !== undefined
    ) {

        return (
            "Only one variable can be assigned " +
            "an initial value in a declaration."
        );
    }


    return null;
}


/* =========================================================
   IF SEARCH
========================================================= */

function parseIfHeader(line) {
    const match = line.trim().match(/^(else\s+)?if\s+([\s\S]+?)\s+then$/i);
    return match ? { isElseIf: Boolean(match[1]), condition: match[2].trim() } : null;
}

function isEndIfLine(line) {
    const normalized = line.trim().toLowerCase();
    return normalized === "endif" || normalized === "end if";
}

function findElseOrEndIf(startIndex) {

    let depth = 0;


    for (
        let i = startIndex + 1;
        i < programLines.length;
        i++
    ) {

        const line =
            removeComment(
                programLines[i]
            )
            .trim()
            .toLowerCase();


        const header = parseIfHeader(line);
        if (header?.isElseIf && depth === 0) return { type: "elseif", index: i };
        if (header && !header.isElseIf) depth++;


        if (isEndIfLine(line)) {

            if (
                depth === 0
            ) {

                return {
                    type: "endif",
                    index: i
                };
            }


            depth--;
        }


        if (line === "else" && depth === 0) {

            return {
                type: "else",
                index: i
            };
        }
    }


    return null;
}


function findEndIf(startIndex) {

    let depth = 0;


    for (
        let i = startIndex + 1;
        i < programLines.length;
        i++
    ) {

        const line =
            removeComment(
                programLines[i]
            )
            .trim()
            .toLowerCase();


        const header = parseIfHeader(line);
        if (header && !header.isElseIf) depth++;


        if (isEndIfLine(line)) {

            if (
                depth === 0
            ) {

                return i;
            }


            depth--;
        }
    }


    return -1;
}


/* =========================================================
   VARIABLE DISPLAY
========================================================= */

function replaceVariablesForDisplay(
    expression
) {

    let result =
        normalizeQuotes(
            expression
        ).trim();


    result =
        result.replace(
            /[–—−]/g,
            "-"
        );


    result =
        result.replace(
            /\bmod\b/gi,
            "%"
        );


    const variableNames =
        Object.keys(variables)
            .sort(
                (a, b) =>
                    b.length - a.length
            );


    for (
        const variableName of variableNames
    ) {

        const variable =
            variables[
                variableName
            ];


        if (
            variable.value === undefined ||
            variable.value === null
        ) {

            continue;
        }


        const escapedName =
            variableName.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );


        const regex =
            new RegExp(
                "\\b" +
                escapedName +
                "\\b",
                "g"
            );


        let displayValue =
            variable.value;


        if (
            variable.type === "string"
        ) {

            displayValue =
                '"' +
                variable.value +
                '"';

        } else if (
            variable.type === "character"
        ) {

            displayValue =
                "'" +
                variable.value +
                "'";

        } else if (
            variable.type === "boolean"
        ) {

            displayValue =
                variable.value
                    ? "true"
                    : "false";
        }


        result =
            result.replace(
                regex,
                displayValue
            );
    }


    return result;
}


/* =========================================================
   EXPRESSION EVALUATION
========================================================= */

function evaluateExpression(
    expression,
    excludeVariable = null
) {

    expression =
        normalizeQuotes(
            expression
        ).trim();


    if (
        expression === ""
    ) {

        throw new Error(
            "Expression cannot be empty."
        );
    }


    expression =
        expression.replace(
            /[–—−]/g,
            "-"
        );


    if (
        /^true$/i.test(
            expression
        )
    ) {

        return true;
    }


    if (
        /^false$/i.test(
            expression
        )
    ) {

        return false;
    }


    if (
        /^'.{1}'$/.test(
            expression
        )
    ) {

        return expression.substring(
            1,
            expression.length - 1
        );
    }


    if (
        (
            expression.startsWith('"') &&
            expression.endsWith('"')
        ) ||
        (
            expression.startsWith("'") &&
            expression.endsWith("'")
        )
    ) {

        return expression.substring(
            1,
            expression.length - 1
        );
    }


    expression =
        expression.replace(
            /\bmod\b/gi,
            "%"
        );


    const variableNames =
        Object.keys(variables)
            .sort(
                (a, b) =>
                    b.length - a.length
            );


    for (
        const variableName of variableNames
    ) {

        if (
            variableName === excludeVariable
        ) {

            continue;
        }


        const variable =
            variables[
                variableName
            ];


        const escapedName =
            variableName.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );


        const regex =
            new RegExp(
                "\\b" +
                escapedName +
                "\\b",
                "g"
            );


        if (
            !regex.test(
                expression
            )
        ) {

            continue;
        }


        if (
            variable.value === undefined ||
            variable.value === null
        ) {

            throw new Error(
                "Variable '" +
                variableName +
                "' has not been assigned a value."
            );
        }


        let replacement;


        if (
            variable.type === "string" ||
            variable.type === "character"
        ) {

            const escapedValue =
                String(
                    variable.value
                )
                .replace(
                    /\\/g,
                    "\\\\"
                )
                .replace(
                    /"/g,
                    '\\"'
                );


            replacement =
                '"' +
                escapedValue +
                '"';

        } else if (
            variable.type === "boolean"
        ) {

            replacement =
                variable.value
                    ? "true"
                    : "false";

        } else {

            replacement =
                "(" +
                variable.value +
                ")";
        }


        expression =
            expression.replace(
                regex,
                replacement
            );
    }


    // Ignore words inside quoted strings while checking for undeclared names.
    const expressionWithoutStrings = expression.replace(
        /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        " "
    );

    const unknown = expressionWithoutStrings.match(
        /\b(?!true\b|false\b)[A-Za-z_][A-Za-z0-9_]*\b/i
    );


    if (
        unknown
    ) {

        throw new Error(
            "Variable '" +
            unknown[0] +
            "' has not been declared."
        );
    }


    if (
        !/^[0-9+\-*/%().\s"'A-Za-z_]+$/.test(
            expression
        )
    ) {

        throw new Error(
            "Invalid expression."
        );
    }


    // Parse arithmetic directly instead of using Function/eval. Electron's
    // Content Security Policy intentionally blocks dynamic code execution.
    const tokenPattern = /^\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:([eE][+-]?\d+))?|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(true|false)\b|([()+\-*/%]))/i;
    const tokens = [];
    let remaining = expression;

    while (remaining.trim() !== "") {
        const match = remaining.match(tokenPattern);
        if (!match) throw new Error("Invalid expression.");

        if (match[1] !== undefined) {
            tokens.push({ type: "number", value: Number(match[1] + (match[2] || "")) });
        } else if (match[3] !== undefined) {
            const raw = match[3];
            let value;
            if (raw[0] === '"') {
                try { value = JSON.parse(raw); } catch (_) { throw new Error("Invalid expression."); }
            } else {
                value = raw.slice(1, -1).replace(/\\([\\'])/g, "$1");
            }
            tokens.push({ type: "string", value });
        } else if (match[4] !== undefined) {
            tokens.push({ type: "boolean", value: match[4].toLowerCase() === "true" });
        } else {
            tokens.push({ type: "operator", value: match[5] });
        }
        remaining = remaining.slice(match[0].length);
    }

    let position = 0;
    function parsePrimary() {
        const token = tokens[position++];
        if (!token) throw new Error("Invalid expression.");
        if (token.type === "number" || token.type === "string" || token.type === "boolean") return token.value;
        if (token.value === "+") return +parsePrimary();
        if (token.value === "-") return -parsePrimary();
        if (token.value === "(") {
            const value = parseAddition();
            if (tokens[position++]?.value !== ")") throw new Error("Invalid expression.");
            return value;
        }
        throw new Error("Invalid expression.");
    }
    function parseMultiplication() {
        let value = parsePrimary();
        while (["*", "/", "%"].includes(tokens[position]?.value)) {
            const operator = tokens[position++].value;
            const right = parsePrimary();
            if (typeof value === "string" || typeof right === "string") throw new Error("Invalid expression.");
            if (operator === "*") value *= right;
            else if (operator === "/") value /= right;
            else value %= right;
        }
        return value;
    }
    function parseAddition() {
        let value = parseMultiplication();
        while (["+", "-"].includes(tokens[position]?.value)) {
            const operator = tokens[position++].value;
            const right = parseMultiplication();
            if (operator === "+" && (typeof value === "string" || typeof right === "string")) value = String(value) + String(right);
            else if (operator === "+") value += right;
            else value -= right;
        }
        return value;
    }

    try {
        const result = parseAddition();
        if (position !== tokens.length) throw new Error("Invalid expression.");
        return result;
    } catch (_) {
        throw new Error("Invalid expression.");
    }
}


/* =========================================================
   SHOW CALCULATION
========================================================= */

function showCalculation(
    variableName,
    expression,
    result
) {

    stepNumber++;


    const normalizedExpression =
        expression.replace(
            /[–—−]/g,
            "-"
        );


    const substituted =
        replaceVariablesForDisplay(
            normalizedExpression
        );


    printOutput(
        "Step " +
        stepNumber +
        ":\n" +

        variableName +
        " = " +
        normalizedExpression +

        "\n     = " +
        substituted +

        "\n     = " +
        result +

        "\n"
    );
}


/* =========================================================
   CONDITION
========================================================= */

function evaluateCondition(condition) {

    condition =
        normalizeQuotes(
            condition
        ).trim();


    condition =
        condition.replace(
            /[–—−]/g,
            "-"
        );


    function stripOuterParens(text) {
        let result = text.trim();
        while (result.startsWith("(") && result.endsWith(")")) {
            let depth = 0, quote = null, escaped = false, wrapsAll = true;
            for (let i = 0; i < result.length; i++) {
                const char = result[i];
                if (quote) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === quote) quote = null;
                    continue;
                }
                if (char === '"' || char === "'") { quote = char; continue; }
                if (char === "(") depth++;
                else if (char === ")") {
                    depth--;
                    if (depth === 0 && i !== result.length - 1) { wrapsAll = false; break; }
                }
            }
            if (!wrapsAll || depth !== 0) break;
            result = result.slice(1, -1).trim();
        }
        return result;
    }

    function splitTopLevel(text, keyword) {
        const parts = [];
        let start = 0, depth = 0, quote = null, escaped = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === "\\") escaped = true;
                else if (char === quote) quote = null;
                continue;
            }
            if (char === '"' || char === "'") { quote = char; continue; }
            if (char === "(") { depth++; continue; }
            if (char === ")") { depth--; continue; }
            if (depth !== 0) continue;
            if (text.slice(i, i + keyword.length).toLowerCase() !== keyword) continue;
            const before = text[i - 1] || " ", after = text[i + keyword.length] || " ";
            if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) continue;
            parts.push(text.slice(start, i).trim());
            i += keyword.length - 1;
            start = i + 1;
        }
        if (!parts.length) return null;
        parts.push(text.slice(start).trim());
        return parts;
    }

    function findComparison(text) {
        let depth = 0, quote = null, escaped = false;
        const operators = [">=", "<=", "!=", "<>", "==", ">", "<", "="];
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === "\\") escaped = true;
                else if (char === quote) quote = null;
                continue;
            }
            if (char === '"' || char === "'") { quote = char; continue; }
            if (char === "(") { depth++; continue; }
            if (char === ")") { depth--; continue; }
            if (depth !== 0) continue;
            const operator = operators.find(candidate => text.startsWith(candidate, i));
            if (operator) return { index: i, operator };
        }
        return null;
    }

    function evaluatePart(raw) {
        const text = stripOuterParens(raw);
        if (!text) throw new Error("Invalid condition.");

        const orParts = splitTopLevel(text, "or");
        if (orParts) return orParts.some(part => evaluatePart(part));

        const andParts = splitTopLevel(text, "and");
        if (andParts) return andParts.every(part => evaluatePart(part));

        if (/^not\b/i.test(text)) return !evaluatePart(text.replace(/^not\b/i, "").trim());

        const comparison = findComparison(text);
        if (comparison) {
            const left = text.slice(0, comparison.index).trim();
            const right = text.slice(comparison.index + comparison.operator.length).trim();
            if (!left || !right) throw new Error("Invalid condition.");
            const leftValue = evaluateExpression(left);
            const rightValue = evaluateExpression(right);
            switch (comparison.operator) {
                case ">": return leftValue > rightValue;
                case "<": return leftValue < rightValue;
                case ">=": return leftValue >= rightValue;
                case "<=": return leftValue <= rightValue;
                case "=": case "==": return leftValue == rightValue;
                case "!=": case "<>": return leftValue != rightValue;
            }
        }

        const value = evaluateExpression(text);
        if (typeof value !== "boolean") throw new Error("Invalid condition. Use a comparison or a boolean variable.");
        return value;
    }

    return evaluatePart(condition);
}


/* =========================================================
   SHOW CONDITION
========================================================= */

function showConditionStep(
    condition,
    result
) {

    stepNumber++;


    const substituted =
        replaceVariablesForDisplay(
            condition
        );


    printOutput(
        "Step " +
        stepNumber +
        ":\n" +

        "Checking condition:\n" +

        condition +

        "\n" +

        substituted +

        "\n" +

        "Result: " +

        (
            result
                ? "TRUE"
                : "FALSE"
        ) +

        "\n"
    );
}


/* =========================================================
   PRINT EVALUATION
========================================================= */

function evaluatePrint(text) {

    const tokens =
        tokenizePrint(text);

    let result = "";


    for (
        let i = 0;
        i < tokens.length;
        i++
    ) {

        const token =
            tokens[i];


        if (
            token.type === "comma"
        ) {

            continue;
        }


        if (
            token.type === "quoted"
        ) {

            let textValue =
                token.value.substring(
                    1,
                    token.value.length - 1
                );


            if (
                /:\s*$/.test(
                    textValue
                )
            ) {

                textValue =
                    textValue.replace(
                        /:\s*$/,
                        ""
                    );


                let nextIndex =
                    i + 1;


                while (
                    nextIndex <
                    tokens.length &&
                    tokens[
                        nextIndex
                    ].type === "comma"
                ) {

                    nextIndex++;
                }


                if (
                    nextIndex <
                    tokens.length
                ) {

                    const nextToken =
                        tokens[
                            nextIndex
                        ];


                    let value;


                    if (
                        nextToken.type ===
                        "quoted"
                    ) {

                        value =
                            nextToken.value.substring(
                                1,
                                nextToken.value.length - 1
                            );

                    } else {

                        const expression =
                            nextToken.value.trim();


                        if (
                            variables[
                                expression
                            ] &&
                            variables[
                                expression
                            ].value !== undefined &&
                            variables[
                                expression
                            ].value !== null
                        ) {

                            value =
                                variables[
                                    expression
                                ].value;

                        } else {

                            value =
                                evaluateExpression(
                                    expression
                                );
                        }
                    }


                    result +=
                        textValue +
                        " " +
                        value;


                    i =
                        nextIndex;

                    continue;
                }
            }


            result += textValue;

            continue;
        }


        const expression =
            token.value.trim();


        if (
            variables[
                expression
            ] &&
            variables[
                expression
            ].value !== undefined &&
            variables[
                expression
            ].value !== null
        ) {

            result +=
                variables[
                    expression
                ].value;

        } else {

            result +=
                evaluateExpression(
                    expression
                );
        }


        if (
            i < tokens.length - 1 &&
            tokens[
                i + 1
            ].type === "comma"
        ) {

            result += " ";
        }
    }


    return result;
}


/* =========================================================
   ERROR DISPLAY
========================================================= */

function showError(
    message,
    lineNumber = currentLine + 1
) {

    executionFinished = true;
    executionPaused = false;
    syncExecutionControls();

    const sourceLine =
        programLines[
            lineNumber - 1
        ] || "";


    printOutput(
        "ERROR on line " +
        lineNumber +
        ": " +
        message +

        "\n\n" +

        lineNumber +
        " | " +
        sourceLine.trim()
    );


    hideInput();

    setEditorStatus(
        "Error"
    );
}


/* =========================================================
   SYNTAX CHECKER
========================================================= */

function performSyntaxCheck() {

    const editor =
        document.getElementById(
            "pseudocode"
        );


    const rawLines =
        editor.value.split("\n");


    let errors = [];


    let startFound = false;
    let stopFound = false;


    let ifStack = [];
    let caseStack = [];
    let loopStack = [];


    for (
        let i = 0;
        i < rawLines.length;
        i++
    ) {

        const originalLine =
            rawLines[i];


        const lineWithoutComment =
            removeComment(
                originalLine
            );


        const line =
            normalizeQuotes(
                lineWithoutComment
            ).trim();


        if (
            line === ""
        ) {

            continue;
        }


        const quoteError =
            checkQuotationMarks(
                line
            );


        if (
            quoteError
        ) {

            errors.push({
                line: i + 1,
                message:
                    quoteError
            });

            continue;
        }


        const lower =
            line.toLowerCase();

        if (parseCaseHeader(line)) {
            caseStack.push({ line: i + 1, otherwiseSeen: false });
            continue;
        }
        if (parseCaseArm(line)) {
            const activeCase = caseStack[caseStack.length - 1];
            const arm = parseCaseArm(line);
            if (!activeCase) errors.push({ line: i + 1, message: "CASE arm does not have a matching CASE statement." });
            else if (/^otherwise$/i.test(arm.label)) {
                if (activeCase.otherwiseSeen) errors.push({ line: i + 1, message: "A CASE statement can only have one OTHERWISE arm." });
                activeCase.otherwiseSeen = true;
            } else if (activeCase.otherwiseSeen) errors.push({ line: i + 1, message: "CASE arms cannot appear after OTHERWISE." });
            continue;
        }
        if (lower === "endcase") {
            if (!caseStack.length) errors.push({ line: i + 1, message: "ENDCASE does not have a matching CASE statement." });
            else {
                const closedCase = caseStack.pop();
                if (!closedCase.otherwiseSeen) errors.push({ line: closedCase.line, message: "Add an OTHERWISE arm so unmatched values are handled." });
            }
            continue;
        }

        if (/^for\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:=|←)\s*.+\s+to\s+.+(?:\s+step\s+.+)?$/i.test(line)) {
            loopStack.push({ type: "for", line: i + 1 });
            continue;
        }
        if (/^while\s+.+(?:\s+do)?$/i.test(line)) {
            loopStack.push({ type: "while", line: i + 1 });
            continue;
        }
        if (/^repeat$/i.test(line)) { loopStack.push({ type: "repeat", line: i + 1 }); continue; }
        if (/^endfor$/i.test(line) || /^endwhile$/i.test(line)) {
            const expected = /^endfor$/i.test(line) ? "for" : "while";
            const active = loopStack[loopStack.length - 1];
            if (!active || active.type !== expected) errors.push({ line: i + 1, message: `${line.toUpperCase()} does not match an open ${expected.toUpperCase()} loop.` });
            else loopStack.pop();
            continue;
        }
        if (/^until\s+.+$/i.test(line)) {
            const active = loopStack[loopStack.length - 1];
            if (!active || active.type !== "repeat") errors.push({ line: i + 1, message: "UNTIL does not have a matching REPEAT statement." });
            else loopStack.pop();
            continue;
        }


        if (lower === "start" || /^begin(?:\s+.+)?$/i.test(line)) {

            if (
                startFound
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "START appears more than once."
                });
            }


            startFound = true;

            continue;
        }


        if (lower === "stop" || lower === "end") {

            if (
                stopFound
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "STOP appears more than once."
                });
            }


            stopFound = true;

            continue;
        }


        if (
            lower === "declare"
        ) {

            continue;
        }


        if (lower.startsWith("print") || lower.startsWith("output")) {
            const keywordLength = lower.startsWith("output") ? 6 : 5;
            const afterPrint = line.substring(keywordLength);


            if (
                afterPrint.length > 0 &&
                !/^\s/.test(
                    afterPrint
                )
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "PRINT must be followed by a space."
                });

                continue;
            }


            const printError = checkPrintSyntax("print " + afterPrint.trim());


            if (
                printError
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        printError
                });
            }


            continue;
        }


        if (/^(read|input)\s+/i.test(line)) {

            const variableName =
                line.substring(line.search(/\s/) + 1)
                    .trim();


            const variableNameError =
                validateVariableName(
                    variableName
                );


            if (
                variableNameError
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        variableNameError
                });
            }


            continue;
        }


        const ifHeader = parseIfHeader(line);
        if (ifHeader) {
            if (ifHeader.isElseIf) {
                const activeIf = ifStack[ifStack.length - 1];
                if (!activeIf) {
                    errors.push({ line: i + 1, message: "ELSE IF does not have a matching IF statement." });
                } else if (activeIf.elseSeen) {
                    errors.push({ line: i + 1, message: "ELSE IF cannot appear after ELSE." });
                }
            } else {
                ifStack.push({ line: i + 1, elseSeen: false });
            }
            continue;
        }

        if (/^(if|else\s+if)\b/i.test(line)) {
            errors.push({ line: i + 1, message: "Invalid IF statement. Use IF condition THEN or ELSE IF condition THEN." });
            continue;
        }


        if (lower === "else") {
            const activeIf = ifStack[ifStack.length - 1];
            if (!activeIf) errors.push({ line: i + 1, message: "ELSE does not have a matching IF statement." });
            else if (activeIf.elseSeen) errors.push({ line: i + 1, message: "An IF statement can only have one ELSE block." });
            else activeIf.elseSeen = true;
            continue;
        }


        if (isEndIfLine(lower)) {
            if (ifStack.length === 0) errors.push({ line: i + 1, message: "ENDIF does not have a matching IF statement." });
            else ifStack.pop();
            continue;
        }


        if (
            /\bas\s+(boolean|character|float|integer|real|string|constant)\b/i.test(
                line
            )
        ) {

            const declarationError =
                checkDeclarationSyntax(
                    line
                );


            if (
                declarationError
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        declarationError
                });
            }


            continue;
        }


        if (line.includes("=") || line.includes("←")) {

            const assignmentMatch =
                line.match(
                    /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|←)\s*(.+)$/
                );


            if (
                !assignmentMatch
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "Invalid assignment statement."
                });
            }


            continue;
        }


        errors.push({
            line: i + 1,
            message:
                "Unrecognized statement."
        });
    }


    while (
        ifStack.length > 0
    ) {

        const openIf = ifStack.pop();


        errors.push({
            line: openIf.line,
            message:
                "IF statement is missing ENDIF."
        });
    }

    while (caseStack.length > 0) {
        const openCase = caseStack.pop();
        errors.push({ line: openCase.line, message: "CASE statement is missing ENDCASE." });
    }
    while (loopStack.length > 0) {
        const openLoop = loopStack.pop();
        errors.push({ line: openLoop.line, message: `${openLoop.type.toUpperCase()} loop is missing its closing statement.` });
    }


    if (
        !startFound
    ) {

        errors.push({
            line: 1,
            message:
                "START statement is missing."
        });
    }


    if (
        !stopFound
    ) {

        errors.push({
            line: rawLines.length,
            message:
                "STOP statement is missing."
        });
    }


    errors.sort(
        (a, b) =>
            a.line - b.line
    );


    return errors;
}


/* =========================================================
   CHECK SYNTAX
========================================================= */

function checkSyntax(options = {}) {

    clearOutput();


    const errors =
        performSyntaxCheck();


    if (
        errors.length === 0
    ) {

        if (options.quiet) return true;

        printOutput(
            "✓ Syntax check passed.\n\n" +
            "No syntax errors were found."
        );

        setEditorStatus(
            "Syntax OK"
        );

        return true;
    }


    printOutput(
        "✗ Syntax errors found:\n"
    );


    for (
        const error of errors
    ) {

        const source =
            document
                .getElementById(
                    "pseudocode"
                )
                .value
                .split("\n")[
                    error.line - 1
                ] || "";


        printOutput(
            "Line " +
            error.line +
            ": " +
            error.message +

            "\n" +

            error.line +
            " | " +
            source.trim() +

            "\n"
        );
    }


    setEditorStatus(
        "Syntax Error"
    );


    return false;
}


/* =========================================================
   RUN PROGRAM
========================================================= */

function runProgram() {

    if (executionDelayTimer) clearTimeout(executionDelayTimer);
    executionDelayTimer = null;
    executionPaused = false;
    executionFinished = false;
    clearExecutionTracker();

    if (window.dpfPreferences?.stepByStepMode) { runStepByStep(); return; }
    if (window.dpfPreferences?.clearOutputBeforeRun !== false) clearOutput();

    hideInput();


    variables = {};
    programLines = [];
    currentLine = 0;
    pendingElseIfLines = new Set();
    loopFrames = [];
    pendingInlineCaseStatement = null;
    syncExecutionControls();


    stepByStepMode = false;
    stepNumber = 0;


    setEditorStatus(
        "Checking..."
    );


    const syntaxValid =
        checkSyntax({ quiet: true });


    if (
        !syntaxValid
    ) {

        return;
    }

    programLines =
        document
            .getElementById(
                "pseudocode"
            )
            .value
            .split("\n");


    currentLine = 0;

    executionFinished = false;
    syncExecutionControls();


    setEditorStatus(
        "Running"
    );


    executeNextLine();
}


/* =========================================================
   RUN STEP-BY-STEP
========================================================= */

function runStepByStep() {

    if (executionDelayTimer) clearTimeout(executionDelayTimer);
    executionDelayTimer = null;
    executionPaused = false;
    executionFinished = false;
    clearExecutionTracker();

    if (window.dpfPreferences?.clearOutputBeforeRun !== false) clearOutput();

    hideInput();


    variables = {};
    programLines = [];
    currentLine = 0;
    pendingElseIfLines = new Set();
    loopFrames = [];
    pendingInlineCaseStatement = null;
    syncExecutionControls();


    stepByStepMode = true;
    stepNumber = 0;


    const syntaxValid =
        checkSyntax({ quiet: true });


    if (
        !syntaxValid
    ) {

        return;
    }

    programLines =
        document
            .getElementById(
                "pseudocode"
            )
            .value
            .split("\n");


    currentLine = 0;

    executionFinished = false;
    syncExecutionControls();


    printOutput(
        "===== STEP-BY-STEP EXECUTION =====\n"
    );


    setEditorStatus(
        "Step Mode"
    );


    executeNextLine();
}


/* =========================================================
   SEQUENTIAL EXECUTION
========================================================= */

function caseLineText(index) {
    if (index < 0 || index >= programLines.length) return "";
    return normalizeQuotes(removeComment(programLines[index])).trim();
}

function parseCaseHeader(text) {
    const match = text.match(/^case\s+(?:of\s+(.+)|(.+)\s+of)$/i);
    return match ? (match[1] || match[2]).trim() : null;
}

function parseCaseArm(text) {
    let quote = "";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if ((ch === '"' || ch === "'") && (!quote || quote === ch)) quote = quote ? "" : ch;
        else if (ch === ":" && !quote) return { label: text.slice(0, i).trim(), statement: text.slice(i + 1).trim() };
    }
    return null;
}

function splitCaseValues(text) {
    const values = [];
    let quote = "", start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if ((ch === '"' || ch === "'") && (!quote || quote === ch)) quote = quote ? "" : ch;
        else if (ch === "," && !quote) { values.push(text.slice(start, i).trim()); start = i + 1; }
    }
    values.push(text.slice(start).trim());
    return values;
}

function findMatchingEndCase(startIndex) {
    let depth = 0;
    for (let i = startIndex; i < programLines.length; i++) {
        const text = caseLineText(i);
        if (parseCaseHeader(text)) depth++;
        else if (/^endcase$/i.test(text) && --depth === 0) return i;
    }
    return -1;
}

function findMatchingLoopEnd(startIndex, type) {
    const endPattern = type === "for" ? /^endfor$/i : type === "while" ? /^endwhile$/i : /^until\s+.+$/i;
    const startPattern = type === "for" ? /^for\s+/i : type === "while" ? /^while\s+/i : /^repeat$/i;
    let depth = 0;
    for (let i = startIndex; i < programLines.length; i++) {
        const text = caseLineText(i);
        if (startPattern.test(text)) depth++;
        else if (endPattern.test(text) && --depth === 0) return i;
    }
    return -1;
}

function findLoopFrame(type, startIndex) {
    for (let i = loopFrames.length - 1; i >= 0; i--) {
        if (loopFrames[i].type === type && (startIndex === undefined || loopFrames[i].startIndex === startIndex)) return loopFrames[i];
    }
    return null;
}

function findEnclosingCaseStart(targetIndex) {
    const openCases = [];
    for (let i = 0; i <= targetIndex; i++) {
        const text = caseLineText(i);
        if (parseCaseHeader(text)) openCases.push(i);
        else if (/^endcase$/i.test(text)) openCases.pop();
    }
    return openCases.length ? openCases[openCases.length - 1] : -1;
}

function selectCaseArm(caseIndex, selectorValue) {
    const endIndex = findMatchingEndCase(caseIndex);
    if (endIndex < 0) throw new Error("CASE statement has no matching ENDCASE.");
    let depth = 0;
    let otherwiseIndex = -1;
    for (let i = caseIndex + 1; i < endIndex; i++) {
        const text = caseLineText(i);
        if (parseCaseHeader(text)) { depth++; continue; }
        if (/^endcase$/i.test(text)) { depth--; continue; }
        if (depth !== 0) continue;
        const arm = parseCaseArm(text);
        if (!arm) continue;
        if (/^otherwise$/i.test(arm.label)) { otherwiseIndex = i; continue; }
        const values = splitCaseValues(arm.label);
        const matches = values.some(value => {
            try { return evaluateExpression(value) == selectorValue; }
            catch (_) { return value.replace(/^['"]|['"]$/g, "") == selectorValue; }
        });
        if (matches) return { armIndex: i, endIndex, statement: arm.statement };
    }
    return { armIndex: otherwiseIndex, endIndex, statement: otherwiseIndex < 0 ? "" : parseCaseArm(caseLineText(otherwiseIndex))?.statement || "" };
}

function executeNextLine() {

    if (executionPaused || executionFinished) return;

    if (
        waitingForInput
    ) {

        return;
    }

    let processedAnyLine = false;

    while (
        currentLine <
        programLines.length
    ) {

        const lineNumber =
            currentLine + 1;


        const hasPendingInline = pendingInlineCaseStatement !== null;
        const originalLine =
            programLines[
                currentLine
            ];


        const cleanLine = hasPendingInline
            ? pendingInlineCaseStatement
            : normalizeQuotes(
                removeComment(
                    originalLine
                )
            ).trim();


        if (
            cleanLine === ""
        ) {

            currentLine++;

            continue;
        }

        if (processedAnyLine) {
            const delay = Math.max(0, Number(window.dpfPreferences?.outputWriteSpeed) || 0);
            executionDelayTimer = setTimeout(() => {
                executionDelayTimer = null;
                executeNextLine();
            }, delay || 16);
            return;
        }
        if (hasPendingInline) pendingInlineCaseStatement = null;
        processedAnyLine = true;
        showExecutionTracker(lineNumber, cleanLine);


        const lower =
            cleanLine.toLowerCase();


        try {

            if (lower === "start" || /^begin(?:\s+.+)?$/i.test(cleanLine)) {

                currentLine++;

                continue;
            }


            if (lower === "stop" || lower === "end") {

                if (
                    stepByStepMode
                ) {

                    printOutput(
                        "Program finished."
                    );

                } else {

                    printOutput(
                        "\nProgram finished."
                    );
                }


                executionFinished = true;
                executionPaused = false;
                syncExecutionControls();

                hideInput();

                setEditorStatus(
                    "Finished"
                );

                return;
            }


            if (
                lower === "declare"
            ) {

                currentLine++;

                continue;
            }

            const caseSelector = parseCaseHeader(cleanLine);
            if (caseSelector) {
                const selectorValue = evaluateExpression(caseSelector);
                const selected = selectCaseArm(currentLine, selectorValue);
                if (selected.armIndex < 0) currentLine = selected.endIndex + 1;
                else if (selected.statement) { pendingInlineCaseStatement = selected.statement; currentLine = selected.armIndex; }
                else currentLine = selected.armIndex + 1;
                continue;
            }

            if (!hasPendingInline && parseCaseArm(cleanLine)) {
                const caseStart = findEnclosingCaseStart(currentLine);
                const endCase = caseStart < 0 ? -1 : findMatchingEndCase(caseStart);
                if (endCase < 0) throw new Error("CASE arm has no matching ENDCASE.");
                currentLine = endCase + 1;
                continue;
            }

            if (/^endcase$/i.test(cleanLine)) {
                currentLine++;
                continue;
            }


            const declarationMatch =
                cleanLine.match(
                    /^(.+?)\s+as\s+(boolean|character|float|integer|real|string|constant)(?:\s*=\s*(.+))?$/i
                );


            if (
                declarationMatch
            ) {

                const namesText =
                    declarationMatch[1]
                        .trim();


                const type =
                    declarationMatch[2]
                        .toLowerCase();


                const initialValue =
                    declarationMatch[3];


                const names =
                    namesText.split(",");


                for (
                    const rawName of names
                ) {

                    const name =
                        rawName.trim();


                    const variableNameError =
                        validateVariableName(
                            name
                        );


                    if (
                        variableNameError
                    ) {

                        throw new Error(
                            variableNameError
                        );
                    }


                    if (
                        variables[name]
                    ) {

                        throw new Error(
                            "Variable '" +
                            name +
                            "' has already been declared."
                        );
                    }
                }


                if (
                    !isValidDataType(
                        type
                    )
                ) {

                    throw new Error(
                        "Invalid data type '" +
                        type +
                        "'."
                    );
                }


                if (
                    names.length > 1 &&
                    initialValue !== undefined
                ) {

                    throw new Error(
                        "Only one variable can be assigned an initial value in a declaration."
                    );
                }


                let value = null;


                if (
                    initialValue !== undefined
                ) {

                    value =
                        evaluateExpression(
                            initialValue
                        );


                    validateValueForType(
                        value,
                        type
                    );
                }


                if (
                    type === "constant" &&
                    value === null
                ) {

                    throw new Error(
                        "A constant must have an assigned value."
                    );
                }


                for (
                    let i = 0;
                    i < names.length;
                    i++
                ) {

                    const name =
                        names[i].trim();


                    variables[name] = {

                        type: type,

                        value:
                            names.length === 1
                                ? value
                                : null
                    };
                }


                currentLine++;

                continue;
            }


            const forHeader = cleanLine.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|←)\s*(.+?)\s+to\s+(.+?)(?:\s+step\s+(.+))?$/i);
            if (forHeader) {
                const [, name, firstText, lastText, stepText] = forHeader;
                const variable = variables[name];
                if (!variable) throw new Error(`Variable '${name}' has not been declared.`);
                if (variable.type === "constant") throw new Error(`Constant '${name}' cannot be used as a loop counter.`);
                if (!["integer", "real", "float"].includes(variable.type)) throw new Error("A FOR loop counter must be a numeric variable.");
                const first = Number(evaluateExpression(firstText));
                const last = Number(evaluateExpression(lastText));
                const step = stepText ? Number(evaluateExpression(stepText)) : 1;
                if (![first, last, step].every(Number.isFinite) || step === 0) throw new Error("FOR loop start, end, and step must be valid numbers, and step cannot be zero.");
                validateValueForType(first, variable.type);
                const endIndex = findMatchingLoopEnd(currentLine, "for");
                if (endIndex < 0) throw new Error("FOR loop has no matching ENDFOR.");
                variable.value = first;
                const frame = { type: "for", startIndex: currentLine, endIndex, variable: name, last, step };
                loopFrames.push(frame);
                if (step > 0 ? first <= last : first >= last) currentLine++;
                else { loopFrames.splice(loopFrames.indexOf(frame), 1); currentLine = endIndex + 1; }
                continue;
            }

            const whileHeader = cleanLine.match(/^while\s+(.+?)(?:\s+do)?$/i);
            if (whileHeader) {
                let frame = findLoopFrame("while", currentLine);
                const endIndex = frame?.endIndex ?? findMatchingLoopEnd(currentLine, "while");
                if (endIndex < 0) throw new Error("WHILE loop has no matching ENDWHILE.");
                if (!evaluateCondition(whileHeader[1])) {
                    if (frame) loopFrames.splice(loopFrames.indexOf(frame), 1);
                    currentLine = endIndex + 1;
                } else {
                    if (!frame) { frame = { type: "while", startIndex: currentLine, endIndex }; loopFrames.push(frame); }
                    currentLine++;
                }
                continue;
            }

            if (/^repeat$/i.test(cleanLine)) {
                if (!findLoopFrame("repeat", currentLine)) {
                    const endIndex = findMatchingLoopEnd(currentLine, "repeat");
                    if (endIndex < 0) throw new Error("REPEAT loop has no matching UNTIL condition.");
                    loopFrames.push({ type: "repeat", startIndex: currentLine, endIndex });
                }
                currentLine++;
                continue;
            }

            const untilHeader = cleanLine.match(/^until\s+(.+)$/i);
            if (untilHeader) {
                const frame = findLoopFrame("repeat");
                if (!frame) throw new Error("UNTIL does not have a matching REPEAT statement.");
                if (evaluateCondition(untilHeader[1])) {
                    loopFrames.splice(loopFrames.indexOf(frame), 1);
                    currentLine++;
                } else currentLine = frame.startIndex + 1;
                continue;
            }

            if (/^endfor$/i.test(cleanLine)) {
                const frame = findLoopFrame("for");
                if (!frame) throw new Error("ENDFOR does not have a matching FOR loop.");
                const variable = variables[frame.variable];
                variable.value = Number(variable.value) + frame.step;
                validateValueForType(variable.value, variable.type);
                const active = frame.step > 0 ? variable.value <= frame.last : variable.value >= frame.last;
                currentLine = active ? frame.startIndex + 1 : frame.endIndex + 1;
                if (!active) loopFrames.splice(loopFrames.indexOf(frame), 1);
                continue;
            }

            if (/^endwhile$/i.test(cleanLine)) {
                const frame = findLoopFrame("while");
                if (!frame) throw new Error("ENDWHILE does not have a matching WHILE loop.");
                currentLine = frame.startIndex;
                continue;
            }

            if (lower.startsWith("print ") || lower.startsWith("output ")) {
                const printText = cleanLine.substring(lower.startsWith("output ") ? 6 : 5).trim();


                const result =
                    evaluatePrint(
                        printText
                    );


                printOutput(result);


                currentLine++;

                continue;
            }


            if (/^(read|input)\s+/i.test(cleanLine)) {

                const variableName =
                    cleanLine
                        .substring(cleanLine.search(/\s/) + 1)
                        .trim();


                const variableNameError =
                    validateVariableName(
                        variableName
                    );


                if (
                    variableNameError
                ) {

                    throw new Error(
                        variableNameError
                    );
                }


                if (
                    !variables[
                        variableName
                    ]
                ) {

                    throw new Error(
                        "Variable '" +
                        variableName +
                        "' has not been declared."
                    );
                }


                if (
                    variables[
                        variableName
                    ].type === "constant"
                ) {

                    throw new Error(
                        "Constant '" +
                        variableName +
                        "' cannot be changed."
                    );
                }


                inputVariable =
                    variableName;


                waitingForInput =
                    true;


                document.getElementById(
                    "inputInformation"
                ).textContent =
                    "Enter a value for " +
                    variableName +
                    " (" +
                    variables[
                        variableName
                    ].type +
                    "):";


                document.getElementById(
                    "inputArea"
                ).style.display =
                    "block";


                const input =
                    document.getElementById(
                        "userInput"
                    );


                input.value = "";

                input.focus();


                setEditorStatus(
                    "Waiting for Input"
                );


                return;
            }


            const ifHeader = parseIfHeader(cleanLine);
            if (ifHeader) {
                const { isElseIf, condition } = ifHeader;

                // Reaching another branch after a prior branch ran means that
                // branch chain is already satisfied; skip the remaining arms.
                if (isElseIf && !pendingElseIfLines.delete(currentLine)) {
                    const endIf = findEndIf(currentLine);
                    if (endIf === -1) throw new Error("ELSE IF has no matching ENDIF.");
                    currentLine = endIf + 1;
                    continue;
                }


                const result =
                    evaluateCondition(
                        condition
                    );


                if (
                    stepByStepMode
                ) {

                    showConditionStep(
                        condition,
                        result
                    );
                }


                if (
                    result
                ) {

                    currentLine++;

                } else {

                    const destination =
                        findElseOrEndIf(
                            currentLine
                        );


                    if (
                        !destination
                    ) {

                        throw new Error(
                            "IF statement has no matching ELSE or ENDIF."
                        );
                    }


                    if (destination.type === "elseif") {
                        pendingElseIfLines.add(destination.index);
                        currentLine = destination.index;
                    } else {
                        currentLine = destination.index + 1;
                    }
                }


                continue;
            }


            if (lower === "else") {

                const endIf =
                    findEndIf(
                        currentLine
                    );


                if (
                    endIf === -1
                ) {

                    throw new Error(
                        "ELSE has no matching ENDIF."
                    );
                }


                currentLine =
                    endIf + 1;


                continue;
            }


            if (isEndIfLine(lower)) {

                currentLine++;

                continue;
            }


            const assignment = cleanLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|←)\s*(.+)$/);


            if (
                assignment
            ) {

                const variableName =
                    assignment[1];


                const expression =
                    assignment[2];


                const variableNameError =
                    validateVariableName(
                        variableName
                    );


                if (
                    variableNameError
                ) {

                    throw new Error(
                        variableNameError
                    );
                }


                if (
                    !variables[
                        variableName
                    ]
                ) {

                    throw new Error(
                        "Variable '" +
                        variableName +
                        "' has not been declared."
                    );
                }


                if (
                    variables[
                        variableName
                    ].type === "constant"
                ) {

                    throw new Error(
                        "Constant '" +
                        variableName +
                        "' cannot be changed."
                    );
                }


                const value = evaluateExpression(expression);


                validateValueForType(
                    value,
                    variables[
                        variableName
                    ].type
                );


                variables[
                    variableName
                ].value =
                    value;


                if (
                    stepByStepMode
                ) {

                    showCalculation(
                        variableName,
                        expression,
                        value
                    );
                }


                currentLine++;

                continue;
            }


            throw new Error(
                "Unrecognized statement."
            );


        } catch (error) {

            showError(
                error.message,
                lineNumber
            );


            executionFinished = true;
            executionPaused = false;
            syncExecutionControls();

            return;
        }
    }


    executionFinished = true;
    executionPaused = false;
    syncExecutionControls();

    setEditorStatus(
        "Finished"
    );
}


/* =========================================================
   INPUT SUBMISSION
========================================================= */

function submitInput() {

    if (
        !waitingForInput
    ) {

        return;
    }


    const input =
        document
            .getElementById(
                "userInput"
            )
            .value
            .trim();


    const variable =
        variables[
            inputVariable
        ];


    if (
        !variable
    ) {

        showError(
            "Variable '" +
            inputVariable +
            "' has not been declared."
        );


        waitingForInput = false;

        return;
    }


    try {

        let value;


        if (
            variable.type === "integer"
        ) {

            if (
                !/^-?\d+$/.test(
                    input
                )
            ) {

                throw new Error(
                    "Invalid input. Please enter a whole number."
                );
            }


            value =
                parseInt(
                    input,
                    10
                );
        }


        else if (
            variable.type === "real"
        ) {

            if (
                input === "" ||
                isNaN(
                    Number(input)
                )
            ) {

                throw new Error(
                    "Invalid input. Please enter a number."
                );
            }


            value =
                Number(input);
        }


        else if (
            variable.type === "float"
        ) {

            if (
                input === "" ||
                isNaN(
                    Number(input)
                )
            ) {

                throw new Error(
                    "Invalid input. Please enter a number."
                );
            }


            value =
                Number(input);
        }


        else if (
            variable.type === "boolean"
        ) {

            if (
                !/^(true|false)$/i.test(
                    input
                )
            ) {

                throw new Error(
                    "Invalid input. Please enter true or false."
                );
            }


            value =
                input.toLowerCase() ===
                "true";
        }


        else if (
            variable.type === "character"
        ) {

            if (
                input.length !== 1
            ) {

                throw new Error(
                    "Invalid input. Please enter exactly one character."
                );
            }


            value =
                input;
        }


        else if (
            variable.type === "string"
        ) {

            value =
                input;
        }


        else {

            value =
                input;
        }


        validateValueForType(
            value,
            variable.type
        );


        variable.value =
            value;


        if (
            stepByStepMode
        ) {

            stepNumber++;


            printOutput(
                "Step " +
                stepNumber +
                ":\n" +

                "READ " +
                inputVariable +

                "\nInput: " +
                input +

                "\nStored as " +
                variable.type +

                "\n"
            );
        }


        waitingForInput =
            false;


        inputVariable =
            null;


        hideInput();


        currentLine++;


        executeNextLine();


    } catch (error) {

        document.getElementById(
            "inputInformation"
        ).textContent =
            error.message;
    }
}


/* =========================================================
   HIDE INPUT
========================================================= */

function hideInput() {

    document.getElementById(
        "inputArea"
    ).style.display =
        "none";


    waitingForInput =
        false;


    inputVariable =
        null;
}


/* =========================================================
   INDENTATION
========================================================= */

let INDENT = window.dpfPreferences?.indentSize ? " ".repeat(Number(window.dpfPreferences.indentSize)) : "    ";


function getLeadingSpaces(line) {

    const match =
        line.match(
            /^[ \t]*/
        );


    if (!match) {
        return 0;
    }


    return match[0]
        .replace(
            /\t/g,
            INDENT
        )
        .length;
}


function getIndentLevel(line) {

    return Math.floor(
        getLeadingSpaces(line) /
        INDENT.length
    );
}


function isDeclarationLine(line) {

    return /\bas\s+(boolean|character|float|integer|real|string|constant)\b/i.test(
        line.trim()
    );
}


/*
   Format the entire pseudocode.

   Rules:

   START
       DECLARE
           variable as real
           variable as integer

       PRINT
       READ

       IF condition THEN
           ...
       ELSE
           ...
       ENDIF

       CASE selector OF
           value:
               ...
           OTHERWISE:
               ...
       ENDCASE

   STOP
*/

function formatPseudocode() {

    const editor =
        document.getElementById(
            "pseudocode"
        );


    const rawLines =
        editor.value.split("\n");


    let formatted = [];

    let level = 0;

    let inDeclare = false;
    const caseFrames = [];
    const loopIndentFrames = [];


    for (
        let i = 0;
        i < rawLines.length;
        i++
    ) {

        const original =
            rawLines[i];


        const clean =
            removeComment(
                original
            ).trim();


        if (
            clean === ""
        ) {

            formatted.push("");

            continue;
        }


        const lower =
            normalizeQuotes(
                clean
            ).toLowerCase();

        const caseSelector = parseCaseHeader(clean);
        if (caseSelector) {
            if (inDeclare) { inDeclare = false; level = Math.max(1, level - 1); }
            formatted.push(INDENT.repeat(level) + "case of " + caseSelector);
            caseFrames.push({ base: level });
            level++;
            continue;
        }

        if (/^endcase$/i.test(clean)) {
            const frame = caseFrames.pop();
            level = frame ? frame.base : Math.max(0, level - 1);
            formatted.push(INDENT.repeat(level) + "endcase");
            continue;
        }

        const caseArm = parseCaseArm(clean);
        if (caseArm && caseFrames.length) {
            const frame = caseFrames[caseFrames.length - 1];
            level = frame.base + 1;
            const label = /^otherwise$/i.test(caseArm.label) ? "otherwise" : caseArm.label;
            formatted.push(INDENT.repeat(level) + label + " :" + (caseArm.statement ? " " + caseArm.statement : ""));
            level = frame.base + 2;
            continue;
        }

        const formattedFor = clean.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|←)\s*(.+?)\s+to\s+(.+?)(?:\s+step\s+(.+))?$/i);
        if (formattedFor) {
            if (inDeclare) { inDeclare = false; level = Math.max(1, level - 1); }
            const [, name, first, last, step] = formattedFor;
            formatted.push(INDENT.repeat(level) + `for ${name} ← ${first.trim()} to ${last.trim()}${step ? " step " + step.trim() : ""}`);
            loopIndentFrames.push({ type: "for", base: level });
            level++;
            continue;
        }
        const formattedWhile = clean.match(/^while\s+(.+?)(?:\s+do)?$/i);
        if (formattedWhile) {
            if (inDeclare) { inDeclare = false; level = Math.max(1, level - 1); }
            formatted.push(INDENT.repeat(level) + "while " + formattedWhile[1].replace(/\s+do$/i, "").trim() + " do");
            loopIndentFrames.push({ type: "while", base: level });
            level++;
            continue;
        }
        if (/^repeat$/i.test(clean)) {
            if (inDeclare) { inDeclare = false; level = Math.max(1, level - 1); }
            loopIndentFrames.push({ type: "repeat", base: level });
            formatted.push(INDENT.repeat(level) + "repeat");
            level++;
            continue;
        }
        if (/^endfor$/i.test(clean) || /^endwhile$/i.test(clean)) {
            const expected = /^endfor$/i.test(clean) ? "for" : "while";
            let frameIndex = loopIndentFrames.length - 1;
            while (frameIndex >= 0 && loopIndentFrames[frameIndex].type !== expected) frameIndex--;
            const frame = frameIndex >= 0 ? loopIndentFrames.splice(frameIndex, 1)[0] : null;
            level = frame ? frame.base : Math.max(0, level - 1);
            const token = expected === "for" ? "endfor" : "endwhile";
            formatted.push(INDENT.repeat(level) + token);
            continue;
        }
        const formattedUntil = clean.match(/^until\s+(.+)$/i);
        if (formattedUntil) {
            let frameIndex = loopIndentFrames.length - 1;
            while (frameIndex >= 0 && loopIndentFrames[frameIndex].type !== "repeat") frameIndex--;
            const frame = frameIndex >= 0 ? loopIndentFrames.splice(frameIndex, 1)[0] : null;
            level = frame ? frame.base : Math.max(0, level - 1);
            formatted.push(INDENT.repeat(level) + "until " + formattedUntil[1].trim());
            continue;
        }


        /*
           START
        */

        if (lower === "start" || /^begin(?:\s+.+)?$/i.test(clean)) {

            level = 0;

            inDeclare = false;

            formatted.push(
                "Start"
            );

            level = 1;

            continue;
        }


        /*
           STOP
        */

        if (lower === "stop" || lower === "end") {

            level = 0;

            inDeclare = false;

            formatted.push(
                "Stop"
            );

            continue;
        }


        /*
           DECLARE
        */

        if (
            lower === "declare"
        ) {

            inDeclare = true;

            formatted.push(
                INDENT.repeat(
                    level
                ) +
                "Declare"
            );

            level++;

            continue;
        }


        /*
           Declaration lines
        */

        if (
            inDeclare &&
            isDeclarationLine(
                clean
            )
        ) {

            const declaration = clean.match(/^(.+?)\s+as\s+(boolean|character|float|integer|real|string|constant)\b([\s\S]*)$/i);
            if (declaration) {
                const invalidName = declaration[1].split(",").map(name => name.trim()).find(name => validateVariableName(name));
                if (invalidName) {
                    setEditorStatus("Use camelCase or underscores for multiword variable names (for example itemPrice or item_price).");
                    return;
                }
                formatted.push(
                    INDENT.repeat(level) +
                    declaration[1].trim() + " as " +
                    declaration[2].toLowerCase() +
                    declaration[3]
                );
                continue;
            }

            formatted.push(
                INDENT.repeat(
                    level
                ) +
                clean
            );

            continue;
        }


        /*
           First executable line
           after DECLARE.
        */

        if (
            inDeclare
        ) {

            inDeclare = false;

            level =
                Math.max(
                    1,
                    level - 1
                );
        }


        /*
           ELSE
        */

        const elseIf = clean.match(/^else\s+if\s+([\s\S]+?)\s+then$/i);
        if (elseIf) {
            level = Math.max(1, level - 1);
            formatted.push(INDENT.repeat(level) + "else if " + elseIf[1].trim() + " then");
            level++;
            continue;
        }

        if (lower === "else") {

            level =
                Math.max(
                    1,
                    level - 1
                );


            formatted.push(
                INDENT.repeat(
                    level
                ) +
                "else"
            );


            level++;

            continue;
        }


        /*
           ENDIF
        */

        if (lower === "endif" || lower === "end if") {

            level =
                Math.max(
                    1,
                    level - 1
                );


            formatted.push(
                INDENT.repeat(
                    level
                ) +
                "endif"
            );


            continue;
        }


        /*
           PRINT and READ
        */

        const ioCommand = clean.match(/^(print|output|read|input)\b([\s\S]*)$/i);

        if (ioCommand) {

            formatted.push(
                INDENT.repeat(level) +
                ioCommand[1].toLowerCase() +
                ioCommand[2]
            );

            continue;
        }


        /*
           IF
        */

        if (lower.startsWith("if ") && lower.endsWith(" then")) {

            formatted.push(
                INDENT.repeat(
                    level
                ) +
                clean.replace(/^if\b/i, "if").replace(/\bthen\s*$/i, "then")
            );


            level++;

            continue;
        }


        /*
           Normal line
        */

        formatted.push(
            INDENT.repeat(level) + clean
        );
    }


    editor.value =
        formatted.join("\n");

    window.recordPseudocodeChange?.("command");


    updateEditorVisuals();

    setEditorStatus(
        "Formatted"
    );
}


/* =========================================================
   AUTO INDENT ON ENTER
========================================================= */

function autoIndentAfterEnter(
    previousLine
) {

    const trimmed =
        previousLine.trim();


    const currentIndent =
        previousLine.match(
            /^[ \t]*/
        );


    let indent =
        currentIndent
            ? currentIndent[0]
            : "";


    const lower =
        trimmed.toLowerCase();

    if (/^case\s+.+\s+of$/i.test(trimmed) || /^(otherwise|.+):$/i.test(trimmed)) {
        indent += INDENT;
    }


    /*
       IF starts a new block.
    */

    if (
        (lower.startsWith("if ") || lower.startsWith("else if ")) &&
        lower.endsWith(" then")
    ) {

        indent += INDENT;
    }


    /*
       DECLARE starts declaration block.
    */

    else if (
        lower === "declare"
    ) {

        indent += INDENT;
    }


    /*
       ELSE starts its own body.
    */

    else if (
        lower === "else"
    ) {

        indent += INDENT;
    }


    return indent;
}


/* =========================================================
   SMART OUTDENT
========================================================= */

function adjustCurrentLineIndent() {

    const editor =
        document.getElementById(
            "pseudocode"
        );


    const cursor =
        editor.selectionStart;


    const beforeCursor =
        editor.value.substring(
            0,
            cursor
        );


    const lineStart =
        beforeCursor.lastIndexOf(
            "\n"
        ) + 1;


    const lineEnd =
        editor.value.indexOf(
            "\n",
            cursor
        );


    const actualEnd =
        lineEnd === -1
            ? editor.value.length
            : lineEnd;


    const currentLine =
        editor.value.substring(
            lineStart,
            actualEnd
        );


    const trimmed =
        currentLine.trim();


    if (!["else", "endif", "end if"].includes(trimmed.toLowerCase()) && !/^else\s+if\b/i.test(trimmed)) {

        return;
    }


    const beforeLine =
        editor.value.substring(
            0,
            lineStart
        );


    const previousLines =
        beforeLine.split("\n");


    let level = 0;

    let inDeclare = false;


    for (
        let i = 0;
        i < previousLines.length;
        i++
    ) {

        const line =
            previousLines[i].trim();


        const lower =
            line.toLowerCase();


        if (
            line === ""
        ) {

            continue;
        }


        if (
            lower === "start"
        ) {

            level = 1;

            inDeclare = false;

            continue;
        }


        if (
            lower === "declare"
        ) {

            level++;

            inDeclare = true;

            continue;
        }


        if (
            inDeclare &&
            isDeclarationLine(
                line
            )
        ) {

            continue;
        }


        if (
            inDeclare
        ) {

            level =
                Math.max(
                    1,
                    level - 1
                );

            inDeclare = false;
        }


        if ((lower.startsWith("if ") || lower.startsWith("else if ")) && lower.endsWith(" then")) {

            level++;

            continue;
        }


        if (
            lower === "else"
        ) {

            continue;
        }


        if (
        lower === "endif" || lower === "end if"
        ) {

            level =
                Math.max(
                    1,
                    level - 1
                );
        }
    }


    const desiredLevel =
        trimmed.toLowerCase() === "endif"
            ? Math.max(1, level - 1)
            : Math.max(1, level - 1);


    const newIndent =
        INDENT.repeat(
            desiredLevel
        );


    const newLine =
        newIndent +
        trimmed;


    const oldLength =
        currentLine.length;


    editor.value =
        editor.value.substring(
            0,
            lineStart
        ) +
        newLine +
        editor.value.substring(
            actualEnd
        );

    const difference =
        newLine.length -
        oldLength;


    editor.selectionStart =
        Math.max(
            lineStart +
            newIndent.length,
            cursor + difference
        );


    editor.selectionEnd =
        editor.selectionStart;

    window.recordPseudocodeChange?.("command");

    updateEditorVisuals();
}


/* =========================================================
   LOAD EXAMPLE
========================================================= */

function loadExample() {

    const example = `Start
    Declare
        itemPrice as real
        tax as constant = 0.175
        taxAmount as real
        totalCost as real

    print “Please enter the cost of the fan”
    read itemPrice

    taxAmount = itemPrice * tax
    totalCost = itemPrice + taxAmount

    if totalCost > 5400 then
        print “Too expensive”
    else
        print “affordable”
    endif

    print “The total cost of the item is: ”, totalCost
Stop`;


    const editor =
        document.getElementById(
            "pseudocode"
        );


    editor.value =
        example;

    window.recordPseudocodeChange?.("command");


    updateEditorVisuals();

    clearOutput();

    hideInput();

    setEditorStatus(
        "Example Loaded"
    );
}


/* =========================================================
   EDITOR EVENTS
========================================================= */

const editor =
    document.getElementById(
        "pseudocode"
    );

const variableAutocomplete = document.getElementById("variableAutocomplete");
let variableSuggestionItems = [];
let selectedVariableSuggestion = 0;
let variableSuggestionRange = null;

function hideVariableAutocomplete() {
    variableAutocomplete.hidden = true;
    variableSuggestionItems = [];
    variableSuggestionRange = null;
}

function updateVariableAutocomplete() {
    const previousSelection = variableSuggestionItems[selectedVariableSuggestion];
    const range = getTokenRangeAtCaret(editor.value, editor.selectionStart, editor.selectionEnd);
    if (!range) { hideVariableAutocomplete(); return; }
    const prefix = editor.value.slice(range.start, editor.selectionStart);
    if (!prefix || highlightKeywords.has(prefix.toLowerCase()) || highlightTypes.has(prefix.toLowerCase())) {
        hideVariableAutocomplete();
        return;
    }
    variableSuggestionItems = getDeclaredVariableNames(editor.value).filter(name =>
        name !== range.word && name.toLowerCase().startsWith(prefix.toLowerCase())
    );
    if (!variableSuggestionItems.length) { hideVariableAutocomplete(); return; }
    variableSuggestionRange = range;
    const preservedIndex = previousSelection ? variableSuggestionItems.indexOf(previousSelection) : -1;
    selectedVariableSuggestion = preservedIndex >= 0 ? preservedIndex : 0;

    variableAutocomplete.replaceChildren();
    variableSuggestionItems.forEach((name, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === selectedVariableSuggestion));
        option.textContent = name;
        option.dataset.suggestionIndex = String(index);
        variableAutocomplete.appendChild(option);
    });

    const codeArea = editor.parentElement;
    const styles = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
    const cursor = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf("\n", cursor - 1) + 1;
    const lineNumber = editor.value.slice(0, cursor).split("\n").length - 1;
    const textBeforeCaret = editor.value.slice(lineStart, cursor);
    const measureCanvas = document.createElement("canvas");
    const context = measureCanvas.getContext("2d");
    context.font = `${styles.fontSize} ${styles.fontFamily}`;
    let left = 18 + context.measureText(textBeforeCaret).width - editor.scrollLeft;
    let top = 16 + lineNumber * lineHeight - editor.scrollTop + lineHeight + 3;

    variableAutocomplete.hidden = false;
    const maxLeft = Math.max(4, codeArea.clientWidth - variableAutocomplete.offsetWidth - 4);
    left = Math.max(4, Math.min(left, maxLeft));
    if (top + variableAutocomplete.offsetHeight > codeArea.clientHeight) {
        top = Math.max(4, top - variableAutocomplete.offsetHeight - lineHeight - 6);
    }
    variableAutocomplete.style.left = `${left}px`;
    variableAutocomplete.style.top = `${top}px`;
}

function acceptVariableSuggestion(index = selectedVariableSuggestion) {
    if (!variableSuggestionRange || !variableSuggestionItems[index]) return false;
    const name = variableSuggestionItems[index];
    const { start, end } = variableSuggestionRange;
    editor.value = editor.value.slice(0, start) + name + editor.value.slice(end);
    editor.setSelectionRange(start + name.length, start + name.length);
    window.recordPseudocodeChange?.("command");
    hideVariableAutocomplete();
    updateEditorVisuals();
    setEditorStatus("Editing");
    editor.focus();
    return true;
}

function handleVariableAutocompleteKey(event) {
    if (variableAutocomplete.hidden) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        selectedVariableSuggestion = (selectedVariableSuggestion + (event.key === "ArrowDown" ? 1 : variableSuggestionItems.length - 1)) % variableSuggestionItems.length;
        Array.from(variableAutocomplete.children).forEach((option, index) => option.setAttribute("aria-selected", String(index === selectedVariableSuggestion)));
        return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        return acceptVariableSuggestion();
    }
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hideVariableAutocomplete();
        return true;
    }
    return false;
}

variableAutocomplete.addEventListener("mousedown", event => event.preventDefault());
variableAutocomplete.addEventListener("click", event => {
    const option = event.target.closest("[data-suggestion-index]");
    if (option) acceptVariableSuggestion(Number(option.dataset.suggestionIndex));
});


editor.addEventListener(
    "input",
    function () {

        updateEditorVisuals();
        updateVariableAutocomplete();

        setEditorStatus(
            "Editing"
        );
    }
);

["click", "keyup", "mouseup", "select", "focus"].forEach(type => editor.addEventListener(type, () => {
    updateEditorVisuals();
    updateVariableAutocomplete();
}));
editor.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== variableAutocomplete) hideVariableAutocomplete(); }, 0));


editor.addEventListener(
    "scroll",
    function () {

        syncEditorScroll();
        renderIndentGuides();
    }
);


/* =========================================================
   TAB SUPPORT + ENTER INDENTATION
========================================================= */

editor.addEventListener(
    "keydown",
    function (event) {

        if (handleVariableAutocompleteKey(event)) return;

        /*
           TAB
        */

        if (
            event.key === "Tab"
        ) {

            event.preventDefault();
            INDENT = " ".repeat(Math.max(1, Math.min(8, Number(window.dpfPreferences?.indentSize) || 4)));


            const start =
                editor.selectionStart;


            const end =
                editor.selectionEnd;


            /*
               SHIFT + TAB
               Remove indentation.
            */

            if (
                event.shiftKey
            ) {

                const lineStart =
                    editor.value.lastIndexOf(
                        "\n",
                        start - 1
                    ) + 1;


                const before =
                    editor.value.substring(
                        lineStart,
                        start
                    );


                let removeCount = 0;


                if (
                    before.startsWith(
                        INDENT
                    )
                ) {

                    removeCount =
                        INDENT.length;
                }


                if (
                    removeCount > 0
                ) {

                    editor.value =
                        editor.value.substring(
                            0,
                            lineStart
                        ) +
                        editor.value.substring(
                            lineStart +
                            removeCount
                        );


                    editor.selectionStart =
                        Math.max(
                            lineStart,
                            start -
                            removeCount
                        );


                    editor.selectionEnd =
                        Math.max(
                            lineStart,
                            end -
                            removeCount
                        );

                    window.recordPseudocodeChange?.("command");
                }


                updateEditorVisuals();

                return;
            }


            /*
               Normal TAB.
            */

            editor.value =
                editor.value.substring(
                    0,
                    start
                ) +
                INDENT +
                editor.value.substring(
                    end
                );


            editor.selectionStart =
                editor.selectionEnd =
                    start +
                    INDENT.length;

            window.recordPseudocodeChange?.("command");


            updateEditorVisuals();

            return;
        }


        /*
           ENTER
        */

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();


            const start =
                editor.selectionStart;


            const end =
                editor.selectionEnd;


            const before =
                editor.value.substring(
                    0,
                    start
                );


            const currentLineStart =
                before.lastIndexOf(
                    "\n"
                ) + 1;


            const previousLine =
                before.substring(
                    currentLineStart
                );


            const indent = "";


            editor.value =
                editor.value.substring(
                    0,
                    start
                ) +
                "\n" +
                indent +
                editor.value.substring(
                    end
                );


            const newCursor =
                start +
                1 +
                indent.length;


            editor.selectionStart =
                editor.selectionEnd =
                    newCursor;

            window.recordPseudocodeChange?.("command");


            updateEditorVisuals();

            return;
        }
    }
);


/* =========================================================
   SMART OUTDENT FOR ELSE / ENDIF
========================================================= */

editor.addEventListener(
    "input",
    function () {

        /*
           Delay slightly so the user's
           typed text has been inserted.
        */

        setTimeout(
            function () {

                if (window.dpfPreferences?.autoIndent !== false) adjustCurrentLineIndent();

            },
            0
        );
    }
);


/* =========================================================
   INPUT ENTER KEY
========================================================= */

document.getElementById(
    "userInput"
).addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();

            submitInput();
        }
    }
);


/* =========================================================
   INITIAL SETUP
========================================================= */

updateEditorVisuals();

window.addEventListener("resize", renderIndentGuides);
if (window.ResizeObserver) {
    const indentGuidesResizeObserver = new ResizeObserver(renderIndentGuides);
    const codeAreaForGuides = document.querySelector(".code-area");
    if (codeAreaForGuides) indentGuidesResizeObserver.observe(codeAreaForGuides);
}

setEditorStatus(
    "Ready"
);
