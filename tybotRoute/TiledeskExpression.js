const {VM} = require('vm2');

class TiledeskExpression {
    // rules:
    // check valid operators (only those in operators are allowed)
    // check valid variable names /^[_0-9a-zA-Z\.]$/

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
        "startsWithIgnoreCase": {
            name: "startsWithIgnoreCase",
            applyPattern: "String(#1).toLowerCase().startsWith(String(#2).toLowerCase())"
        },
        "contains": {
            name: "contains",
            applyPattern: "#1.includes(#2)"
        },
        "containsIgnoreCase": {
            name: "containsIgnoreCase",
            applyPattern: "#1.toLowerCase().includes(#2.toLowerCase())"
        },
        "endsWith": {
            name: "endsWith",
            applyPattern: "#1.toLowerCase().endsWith(#2.toLowerCase())"
        },
        "isEmpty": {
            name: "isEmpty",
            applyPattern: "#1 === \"\""
        },
        "matches": {
            name: "matches",
            applyPattern: "#1.matches(/#2/)"
        }
    }

    // public
    evaluateExpression(_expression, variables) {
        // console.log("Original expression:", _expression);
        let expression = String(_expression).replace(/\$/g, "$data.");
        // console.log("Evaluating expression:", expression);
        // console.log("With variables:", JSON.stringify(variables));
        const result = new TiledeskExpression().evaluate(expression, variables);
        // console.log("Expression result:", result);
        return result;
    }

    // public
    evaluateStaticExpression(expression) {
        const result = new TiledeskExpression().evaluate(expression);
        return result;
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

    evaluate(expression, context) {
        console.log("evaluating:", expression)
        console.log("context:", context)
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
            console.error("TiledeskExpression.evaluate() error:", err.message, "evaluating expression: '" + expression + "'");
        }
        return res;
    }

    static JSONConditionToExpression(condition, variables) {
        console.log("condition:", condition);
        console.log("condition.operand1:", condition.operand1);
        console.log("condition.operand2:", condition.operand2);
        const operator_name = condition.operator;
        const operator = TiledeskExpression.OPERATORS[operator_name];
        console.log("operator:", operator);
        const applyPattern = operator.applyPattern;
        console.log("applyPattern:", applyPattern);
        const operand1_s = TiledeskExpression.stringValueOperand(condition.operand1, variables);
        console.log("operand1_s:", operand1_s);
        const operand2_s = TiledeskExpression.stringValueOperand(condition.operand2, variables);
        console.log("operand2_s:", operand2_s);
        const expression = 
            applyPattern
                .replace("#1", operand1_s)
                .replace("#2", operand2_s);
        return expression;
    }

    static JSONGroupToExpression(group, variables) {
        let conditions = group.conditions;
        let group_expression = "";
        console.log("conditions:", conditions)
        for(let i = 0; i < conditions.length; i++) {
            let part = conditions[i];
            if (part.type === "condition") {
                let expression = TiledeskExpression.JSONConditionToExpression(part, variables);
                group_expression += expression;
            }
            else if (part.type === "operator") {
                const operator = TiledeskExpression.OPERATORS[part.operatorName];
                group_expression += operator.applyPattern;
            }
        }
        return "(" + group_expression + ")";
    }

    static JSONGroupsToExpression(groups, variables) {
        let full_expression = "";
        console.log("groups:", groups)
        for(let i = 0; i < groups.length; i++) {
            let g = groups[i];
            if (g.type === "expression") {
                let group_expression = TiledeskExpression.JSONGroupToExpression(g, variables);
                full_expression += group_expression;
            }
            else if (g.type === "operator") {
                const operator = TiledeskExpression.OPERATORS[g.operatorName];
                full_expression += operator.applyPattern;
            }
        }
        return full_expression;
    }


    static stringValueOperand(operand, variables) {
        // return operand;
        if (!operand) {
            return "\"\"";
        }
        else if (!variables) {
            console.log("NO VARS")
            return "\"" + operand + "\"";
        }
        else {
            console.log("vars!", variables)
            let _operand = operand.trim();
            let operandAsString = "\"" + operand + "\"";
            if (_operand.startsWith("$")) {
                console.log("_operand with $", _operand);
                let varName = _operand.replace(/\$/g, "");
                console.log("varName:", varName);
                let value = variables[varName];
                if (value) {
                    operandAsString = '"' + value + '"';
                }
                return operandAsString;
            }
            else {
                return "\"" + operand + "\"";
            }
        }
        
    }

}

module.exports = { TiledeskExpression }