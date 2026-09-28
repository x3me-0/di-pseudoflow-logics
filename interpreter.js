let programLines = [];
let currentLine = 0;

let variables = {};
let waitingForInput = false;
let inputVariable = null;

let executionFinished = false;
let stepByStepMode = false;
let stepNumber = 0;


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

    const editor =
        document.getElementById(
            "pseudocode"
        );

    editor.value = "";

    variables = {};
    programLines = [];
    currentLine = 0;
    stepNumber = 0;

    executionFinished = false;
    stepByStepMode = false;

    updateEditorVisuals();

    clearOutput();

    hideInput();

    setEditorStatus("Ready");
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

    let numbers = "";

    for (
        let i = 1;
        i <= lines.length;
        i++
    ) {

        numbers +=
            i +
            "\n";
    }

    lineNumbers.textContent =
        numbers;

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
    "read",
    "if",
    "then",
    "else",
    "endif"
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


function highlightCodeLine(line) {

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


            if (
                highlightKeywords.has(
                    lowerWord
                )
            ) {

                result +=
                    '<span class="hl-keyword">' +
                    escapeHtml(word) +
                    "</span>";

            } else if (
                highlightTypes.has(
                    lowerWord
                )
            ) {

                result +=
                    '<span class="hl-type">' +
                    escapeHtml(word) +
                    "</span>";

            } else {

                result +=
                    '<span class="hl-identifier">' +
                    escapeHtml(word) +
                    "</span>";
            }


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


    highlight.innerHTML =
        lines
            .map(
                line =>
                    highlightCodeLine(
                        line
                    )
            )
            .join("\n");


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
}


/* =========================================================
   QUOTES
========================================================= */

function normalizeQuotes(text) {

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


        if (
            line.startsWith("if ") &&
            line.endsWith(" then")
        ) {

            depth++;
        }


        if (
            line === "endif"
        ) {

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


        if (
            line === "else" &&
            depth === 0
        ) {

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


        if (
            line.startsWith("if ") &&
            line.endsWith(" then")
        ) {

            depth++;
        }


        if (
            line === "endif"
        ) {

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


    const unknown =
        expression.match(
            /\b[A-Za-z_][A-Za-z0-9_]*\b/
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


    try {

        return Function(
            '"use strict"; return (' +
            expression +
            ')'
        )();

    } catch (error) {

        throw new Error(
            "Invalid expression."
        );
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


    condition =
        condition.replace(
            /\bmod\b/gi,
            "%"
        );


    const operators = [
        ">=",
        "<=",
        "!=",
        "<>",
        "==",
        ">",
        "<",
        "="
    ];


    for (
        const operator of operators
    ) {

        const position =
            condition.indexOf(
                operator
            );


        if (
            position !== -1
        ) {

            const left =
                condition.substring(
                    0,
                    position
                ).trim();


            const right =
                condition.substring(
                    position +
                    operator.length
                ).trim();


            if (
                left === "" ||
                right === ""
            ) {

                throw new Error(
                    "Invalid condition."
                );
            }


            const leftValue =
                evaluateExpression(
                    left
                );


            const rightValue =
                evaluateExpression(
                    right
                );


            switch (operator) {

                case ">":
                    return leftValue > rightValue;

                case "<":
                    return leftValue < rightValue;

                case ">=":
                    return leftValue >= rightValue;

                case "<=":
                    return leftValue <= rightValue;

                case "=":
                case "==":
                    return leftValue == rightValue;

                case "!=":
                case "<>":
                    return leftValue != rightValue;
            }
        }
    }


    throw new Error(
        "Invalid condition. Expected a comparison such as age >= 18."
    );
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


        if (
            lower === "start"
        ) {

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


        if (
            lower === "stop"
        ) {

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


        if (
            lower.startsWith("print")
        ) {

            const afterPrint =
                line.substring(5);


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


            const printError =
                checkPrintSyntax(
                    line
                );


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


        if (
            lower.startsWith("read ")
        ) {

            const variableName =
                line.substring(5)
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


        if (
            lower.startsWith("if ") &&
            lower.endsWith(" then")
        ) {

            const condition =
                line.substring(
                    3,
                    line.length - 5
                ).trim();


            if (
                condition === ""
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "IF statement requires a condition."
                });

            } else {

                ifStack.push(
                    i + 1
                );
            }


            continue;
        }


        if (
            lower === "else"
        ) {

            if (
                ifStack.length === 0
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "ELSE does not have a matching IF statement."
                });
            }


            continue;
        }


        if (
            lower === "endif"
        ) {

            if (
                ifStack.length === 0
            ) {

                errors.push({
                    line: i + 1,
                    message:
                        "ENDIF does not have a matching IF statement."
                });

            } else {

                ifStack.pop();
            }


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


        if (
            line.includes("=")
        ) {

            const assignmentMatch =
                line.match(
                    /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/
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

        const lineNumber =
            ifStack.pop();


        errors.push({
            line: lineNumber,
            message:
                "IF statement is missing ENDIF."
        });
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

function checkSyntax() {

    clearOutput();


    const errors =
        performSyntaxCheck();


    if (
        errors.length === 0
    ) {

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

    clearOutput();

    hideInput();


    variables = {};
    programLines = [];
    currentLine = 0;


    stepByStepMode = false;
    stepNumber = 0;


    setEditorStatus(
        "Checking..."
    );


    const syntaxValid =
        checkSyntax();


    if (
        !syntaxValid
    ) {

        return;
    }


    clearOutput();


    programLines =
        document
            .getElementById(
                "pseudocode"
            )
            .value
            .split("\n");


    currentLine = 0;

    executionFinished = false;


    setEditorStatus(
        "Running"
    );


    executeNextLine();
}


/* =========================================================
   RUN STEP-BY-STEP
========================================================= */

function runStepByStep() {

    clearOutput();

    hideInput();


    variables = {};
    programLines = [];
    currentLine = 0;


    stepByStepMode = true;
    stepNumber = 0;


    const syntaxValid =
        checkSyntax();


    if (
        !syntaxValid
    ) {

        return;
    }


    clearOutput();


    programLines =
        document
            .getElementById(
                "pseudocode"
            )
            .value
            .split("\n");


    currentLine = 0;

    executionFinished = false;


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

function executeNextLine() {

    if (
        waitingForInput
    ) {

        return;
    }


    while (
        currentLine <
        programLines.length
    ) {

        const lineNumber =
            currentLine + 1;


        const originalLine =
            programLines[
                currentLine
            ];


        const cleanLine =
            normalizeQuotes(
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


        const lower =
            cleanLine.toLowerCase();


        try {

            if (
                lower === "start"
            ) {

                currentLine++;

                continue;
            }


            if (
                lower === "stop"
            ) {

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


            if (
                lower.startsWith("print ")
            ) {

                const printText =
                    cleanLine
                        .substring(5)
                        .trim();


                const result =
                    evaluatePrint(
                        printText
                    );


                printOutput(result);


                currentLine++;

                continue;
            }


            if (
                lower.startsWith("read ")
            ) {

                const variableName =
                    cleanLine
                        .substring(5)
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


            if (
                lower.startsWith("if ") &&
                lower.endsWith(" then")
            ) {

                const condition =
                    cleanLine.substring(
                        3,
                        cleanLine.length - 5
                    ).trim();


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


                    currentLine =
                        destination.index + 1;
                }


                continue;
            }


            if (
                lower === "else"
            ) {

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


            if (
                lower === "endif"
            ) {

                currentLine++;

                continue;
            }


            const assignment =
                cleanLine.match(
                    /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/
                );


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


                const value =
                    evaluateExpression(
                        expression,
                        variableName
                    );


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

            return;
        }
    }


    executionFinished = true;

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

const INDENT =
    "    ";


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


        /*
           START
        */

        if (
            lower === "start"
        ) {

            level = 0;

            inDeclare = false;

            formatted.push(
                "START"
            );

            level = 1;

            continue;
        }


        /*
           STOP
        */

        if (
            lower === "stop"
        ) {

            level = 0;

            inDeclare = false;

            formatted.push(
                "STOP"
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
                "DECLARE"
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

        if (
            lower === "else"
        ) {

            level =
                Math.max(
                    1,
                    level - 1
                );


            formatted.push(
                INDENT.repeat(
                    level
                ) +
                "ELSE"
            );


            level++;

            continue;
        }


        /*
           ENDIF
        */

        if (
            lower === "endif"
        ) {

            level =
                Math.max(
                    1,
                    level - 1
                );


            formatted.push(
                INDENT.repeat(
                    level
                ) +
                "ENDIF"
            );


            continue;
        }


        /*
           IF
        */

        if (
            lower.startsWith("if ") &&
            lower.endsWith(" then")
        ) {

            formatted.push(
                INDENT.repeat(
                    level
                ) +
                clean
            );


            level++;

            continue;
        }


        /*
           Normal line
        */

        formatted.push(
            INDENT.repeat(
                level
            ) +
            clean
        );
    }


    editor.value =
        formatted.join("\n");


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


    /*
       IF starts a new block.
    */

    if (
        lower.startsWith("if ") &&
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


    if (
        trimmed.toLowerCase() !== "else" &&
        trimmed.toLowerCase() !== "endif"
    ) {

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


        if (
            lower.startsWith("if ") &&
            lower.endsWith(" then")
        ) {

            level++;

            continue;
        }


        if (
            lower === "else"
        ) {

            continue;
        }


        if (
            lower === "endif"
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


editor.addEventListener(
    "input",
    function () {

        updateEditorVisuals();

        setEditorStatus(
            "Editing"
        );
    }
);


editor.addEventListener(
    "scroll",
    function () {

        syncEditorScroll();
    }
);


/* =========================================================
   TAB SUPPORT + ENTER INDENTATION
========================================================= */

editor.addEventListener(
    "keydown",
    function (event) {

        /*
           TAB
        */

        if (
            event.key === "Tab"
        ) {

            event.preventDefault();


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


            const indent =
                autoIndentAfterEnter(
                    previousLine
                );


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

                adjustCurrentLineIndent();

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

setEditorStatus(
    "Ready"
);