const {VM} = require('vm2');
const winston = require('./utils/winston');

class TiledeskExpression {
    // rules:
    // check valid operators (only those in operators are allowed)
    // check valid variable names /^[_0-9a-zA-Z\.]$/

    // static OPERATORS = {
    //     "equalAsNumbers" : {
    //         name: "equalAsNumbers",
    //         applyPattern: "Number(#1) === Number(#2)"
    //     },
    //     "equalAsStrings" : {
    //         name: "equalAsStrings",
    //         applyPattern: "String(#1) === String(#2)"
    //     },
    //     "notEqualAsNumbers" : {
    //         name: "notEqualAsNumbers",
    //         applyPattern: "Number(#1) !== Number(#2)"
    //     },
    //     "notEqualAsStrings" : {
    //         name: "notEqualAsStrings",
    //         applyPattern: "String(#1) !== String(#2)"
    //     },
    //     "greaterThan" : {
    //         name: "greaterThan",
    //         applyPattern: "Number(#1) > Number(#2)"
    //     },
    //     "greaterThanOrEqual" : {
    //         name: "greaterThanOrEqual",
    //         applyPattern: "Number(#1) >= Number(#2)"
    //     },
    //     "lessThan" : {
    //         name: "lessThan",
    //         applyPattern: "Number(#1) < Number(#2)"
    //     },
    //     "lessThanOrEqual" : {
    //         name: "lessThanOrEqual",
    //         applyPattern: "Number(#1) <= Number(#2)"
    //     },
    //     "AND": {
    //         name: "AND",
    //         applyPattern: " && "
    //     },
    //     "OR": {
    //         name: "OR",
    //         applyPattern: " || "
    //     },
    //     "startsWith": {
    //         name: "startsWith",
    //         applyPattern: "String(#1).startsWith(String(#2))"
    //     },
    //     "startsWithIgnoreCase": {
    //         name: "startsWithIgnoreCase",
    //         applyPattern: "String(#1).toLowerCase().startsWith(String(#2).toLowerCase())"
    //     },
    //     "contains": {
    //         name: "contains",
    //         applyPattern: "#1.includes(#2)"
    //     },
    //     "containsIgnoreCase": {
    //         name: "containsIgnoreCase",
    //         applyPattern: "#1.toLowerCase().includes(#2.toLowerCase())"
    //     },
    //     "endsWith": {
    //         name: "endsWith",
    //         applyPattern: "#1.toLowerCase().endsWith(#2.toLowerCase())"
    //     },
    //     "isEmpty": {
    //         name: "isEmpty",
    //         applyPattern: "#1 === \"\""
    //     },
    //     "matches": {
    //         name: "matches",
    //         applyPattern: "#1.matches(/#2/)"
    //     }
    // }

    static OPERATORS = {
        "equalAsNumbers" : {
            name: "equalAsNumbers",
            applyPattern: "Number(#1) === Number(#2)"
        },
        "equalAsStrings" : {
            name: "equalAsStrings",
            applyPattern: "String(#1) === String(#2)"
        },
        "notEqualAsNumbers" : {
            name: "notEqualAsNumbers",
            applyPattern: "Number(#1) !== Number(#2)"
        },
        "notEqualAsStrings" : {
            name: "notEqualAsStrings",
            applyPattern: "String(#1) !== String(#2)"
        },
        "greaterThan" : {
            name: "greaterThan",
            applyPattern: "Number(#1) > Number(#2)"
        },
        "greaterThanOrEqual" : {
            name: "greaterThanOrEqual",
            applyPattern: "Number(#1) >= Number(#2)"
        },
        "lessThan" : {
            name: "lessThan",
            applyPattern: "Number(#1) < Number(#2)"
        },
        "lessThanOrEqual" : {
            name: "lessThanOrEqual",
            applyPattern: "Number(#1) <= Number(#2)"
        },
        "AND": {
            name: "AND",
            applyPattern: " && "
        },
        "OR": {
            name: "OR",
            applyPattern: " || "
        },
        "startsWith": {
            name: "startsWith",
            applyPattern: "String(#1).startsWith(String(#2))"
        },
        "notStartsWith": {
            name: "notStartsWith",
            applyPattern: "!String(#1).startsWith(String(#2))"
        },
        "startsWithIgnoreCase": {
            name: "startsWithIgnoreCase",
            applyPattern: "String(#1).toLowerCase().startsWith(String(#2).toLowerCase())"
        },
        "contains": {
            name: "contains",
            applyPattern: "#1?.includes(#2)"
        },
        "containsIgnoreCase": {
            name: "containsIgnoreCase",
            applyPattern: "#1?.toLowerCase().includes(#2.toLowerCase())"
        },
        "endsWith": {
            name: "endsWith",
            applyPattern: "#1?.toLowerCase().endsWith(#2.toLowerCase())"
        },
        "isEmpty": {
            name: "isEmpty",
            applyPattern: "#1 === \"\""
        },
        "isNull": {
            name: "isNull",
            applyPattern: "#1 === null"
        },
        "isUndefined": {
            name: "isUndefined",
            applyPattern: "#1 === undefined"
        },
        "matches": {
            name: "matches",
            applyPattern: "#1?.match(String(#2)) ? true : false"
        },
        // Francesco
        "addAsNumber": {
            name: "addAsNumber",
            applyPattern: "Number(#1) + Number(#2)"
        },
        "addAsString": {
            name: "addAsString",
            applyPattern: "String(#1) + String(#2)"
        },
        "subtractAsNumber": {
            name: "subtractAsNumber",
            applyPattern: "Number(#1) - Number(#2)"
        },
        "multiplyAsNumber": {
            name: "multiplyAsNumber",
            applyPattern: "Number(#1) * Number(#2)"
        },
        "divideAsNumber": {
            name: "divideAsNumber",
            applyPattern: "Number(#1) / Number(#2)"
        },
        "upperCaseAsString": {
            name: "upperCaseAsString",
            applyPattern: "String(#1).toUpperCase()"
        },
        "lowerCaseAsString": {
            name: "lowerCaseAsString",
            applyPattern: "String(#1).toLowerCase()"
        },
        "capitalizeAsString": {
            name: "capitalizeAsString",
            applyPattern: "TiledeskString.capitalize(String(#1))"
        },
        "cosAsNumber": {
            name: "cosAsNumber",
            applyPattern: "TiledeskMath.cos(Number(#1))"
        },
        "sinAsNumber": {
            name: "sinAsNumber",
            applyPattern: "TiledeskMath.sin(Number(#1))"
        },
        "tanAsNumber": {
            name: "tanAsNumber",
            applyPattern: "TiledeskMath.tan(Number(#1))"
        },
        "absAsNumber": {
            name: "absAsNumber",
            applyPattern: "TiledeskMath.abs(Number(#1))"
        },
        "ceilAsNumber": {
            name: "ceilAsNumber",
            applyPattern: "TiledeskMath.ceil(Number(#1))"
        },
        "floorAsNumber": {
            name: "floorAsNumber",
            applyPattern: "TiledeskMath.floor(Number(#1))"
        },
        "roundAsNumber": {
            name: "roundAsNumber",
            applyPattern: "TiledeskMath.round(Number(#1))"
        },
        "convertToNumber": {
            name: "convertToNumber",
            applyPattern: "Number(#1)"
        },
        "JSONparse": {
            name: "JSONparse",
            applyPattern: "JSON.parse(String(#1))"
        },
        "JSONstringify": {
            name: "JSONstringify",
            applyPattern: "JSON.stringify(#1)"
        }
    }

    // public
    evaluateExpression(_expression, variables) {
        let expression = String(_expression).replace(/\$/g, "$data.");
        const result = new TiledeskExpression().evaluate(expression, variables);
        return result;
    }

    // public
    evaluateStaticExpression(expression, variables) {
        const result = new TiledeskExpression().evaluateJavascriptExpression(expression, variables);
        return result;
    }

    evaluateJavascriptExpression(expression, context) {
        let res = null;
        try {
            const vm = new VM({
                timeout: 200,
                allowAsync: false,
                sandbox: context
            });
            res = vm.run(`let $data = this;${expression}`);
        }
        catch (err) {
            winston.error("(TiledeskExpression) evaluateJavascriptExpression error: " + err.message + " - while evaluating the following expression: '" + expression + "'");
        }
        return res;
    }

    // Francesco
    static JSONOperationToExpression(operators, operands) {
        if(!operands) {
            return null;
        }
        let expression = operands[0].isVariable ? TiledeskExpression.variableOperand(operands[0].value) : TiledeskExpression.quotedString(operands[0].value);
            expression = operands[0].function ? TiledeskExpression.applyFunctionToOperand(expression, operands[0].function) : expression;

        if (operands.length === 1) {        
            return expression;
        } else {
            for (let i = 0; i < operators.length; i++) {
                const operator = TiledeskExpression.OPERATORS[operators[i]];
                const applyPattern = operator.applyPattern;
                let operand = operands[i + 1].isVariable ? TiledeskExpression.variableOperand(operands[i + 1].value) : TiledeskExpression.quotedString(operands[i + 1].value);
                operand = operands[i + 1].function ? TiledeskExpression.applyFunctionToOperand(operand, operands[i + 1].function) : operand;
                expression = applyPattern.replace("#1", expression).replace("#2", operand);
            }
            return expression;
        }
    }

    //This function converts the math function rappresented as a json object into a string
    static applyFunctionToOperand(operand, function_name) {
        let expression = "";
        const operator = TiledeskExpression.OPERATORS[function_name];
        const applyPattern = operator.applyPattern;
        expression += applyPattern.replace("#1", operand);
        return expression;
    }

    // private
    // evaluate(expression, context) {
    //     let fn;
    //     let res
    //     try {
    //         fn = Function(`let $data = this;return (${expression})`);
    //         res = fn.bind(context)()
    //     }
    //     catch (err) {
    //         console.error("TiledeskExpression.evaluate() error:", err.message, "evaluating expression: '" + expression + "'");
    //     }
    //     // let fn = Function(`let $data = this;console.log('data', $data);return (${conditionExpression})`);
    //     return res;
    // }

    // DEPRECATED
    evaluate(expression, context) {
        let res;
        try {
            const vm = new VM({
                timeout: 200,
                allowAsync: false,
                sandbox: context
            });
            res = vm.run(`let $data = this;${expression}`);
        }
        catch (err) {
            // console.error("TiledeskExpression.evaluate() error:", err.message, "evaluating expression: '" + expression + "'");
        }
        return res;
    }

    static JSONConditionToExpression(condition, variables) {
        const operator_name = condition.operator;
        const operator = TiledeskExpression.OPERATORS[operator_name];
        const applyPattern = operator.applyPattern;
        let operand1_s;
        let is_valid_operand1 = TiledeskExpression.validateVariableName(condition.operand1);
        if (is_valid_operand1) {
            operand1_s = TiledeskExpression.variableOperand(condition.operand1);
        }
        else {
            winston.error("(TiledeskExpression) Condition evaluation stopped because of invalid operand1 " + condition.operand1);
            return null;
        }
        
        let operand2_s;
        if (condition.operand2 && condition.operand2.type && condition.operand2.type === "const") {
            operand2_s = TiledeskExpression.stringValueOperand(condition.operand2.value, variables);
        }
        else if (condition.operand2 && condition.operand2.type && condition.operand2.name && condition.operand2.type === "var") {
            let is_valid_operand2 = TiledeskExpression.validateVariableName(condition.operand2.name);
            if (is_valid_operand2) {
                operand2_s = TiledeskExpression.variableOperand(condition.operand2.name);
            }
            else {
                winston.error("(TiledeskExpression)Condition evaluation stopped because of invalid operand2 " + condition.operand2);
                return null;
            }
        }
        else {
            winston.error("(TiledeskExpression) Condition evaluation stopped because of: No operand2 on condition ", condition);
            return null;
        }
        
        const expression = applyPattern.replace("#1", operand1_s).replace("#2", operand2_s);
        return expression;
    }

    static JSONGroupToExpression(group, variables) {
        let conditions = group.conditions;
        let group_expression = "";
        for(let i = 0; i < conditions.length; i++) {
            let part = conditions[i];
            if (part.type === "condition") {
                let expression = TiledeskExpression.JSONConditionToExpression(part, variables);
                if (expression === null) {
                    return null;
                }
                group_expression += expression;
            }
            else if (part.type === "operator") {
                const operator = TiledeskExpression.OPERATORS[part.operator];
                group_expression += operator.applyPattern;
            }
        }
        return "(" + group_expression + ")";
    }

    static JSONGroupsToExpression(groups, variables) {
        let full_expression = "";
        for(let i = 0; i < groups.length; i++) {
            let g = groups[i];
            if (g.type === "expression") {
                let group_expression = TiledeskExpression.JSONGroupToExpression(g, variables);
                if (group_expression === null) {
                    winston.error("(TiledeskExpression) Invalid JSON Group expression ", g);
                    return null;
                }
                full_expression += group_expression;
            }
            else if (g.type === "operator") {
                const operator = TiledeskExpression.OPERATORS[g.operator];
                full_expression += operator.applyPattern;
            }
        }
        return full_expression;
    }


    static variableOperand(operand) {
        return "$data." + operand;
    }

    static validateVariableName(variableName) {
        // let matches = variableName.match(/^[a-zA-Z_]*[a-zA-Z_]+[a-zA-Z0-9_]*$/gm);
        let matches = variableName.match(/^[a-zA-Z_]+.*$/gm);
        if (matches !== null) {
            return true;
        }
        else {
            return false;
        }
    }

    static stringValueOperand(operand, variables) {
        // return operand;
        if (!operand) {
            return TiledeskExpression.quotedString(""); //"\"\"";
        }
        else if (!variables) {
            // return "\"" + JSON.stringify(operand) + "\"";
            return TiledeskExpression.quotedString(operand);
        }
        else {
            let _operand = operand.trim();
            let operandAsString = TiledeskExpression.quotedString(operand); //"\"" + JSON.stringify(operand) + "\"";
            if (_operand.startsWith("$")) {
                let varName = _operand.replace(/\$/g, "");
                let value = variables[varName];
                if (value) {
                    operandAsString = TiledeskExpression.quotedString(value); //'"' + JSON.stringify(value) + '"';
                }
                return operandAsString;
            }
            else {
                // return "\"" + JSON.stringify(operand) + "\"";
                return TiledeskExpression.quotedString(operand);
            }
        }
        
    }

    static quotedString(s) {
        return JSON.stringify(s);
    }

}

module.exports = { TiledeskExpression }