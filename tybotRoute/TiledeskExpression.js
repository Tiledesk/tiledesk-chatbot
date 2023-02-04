const {VM} = require('vm2');

class TiledeskExpression {
    // rules:
    // check valid operators (only those in operators are allowed)
    // check valid variable names /^[_0-9a-zA-Z\.]$/

    static operators = {
        "equalAsNumbers" : {
            applyPattern: "Number($1) === Number($2)"
        },
        "equalAsStrings" : {
            applyPattern: "String($1) === String($2)"
        },
        "notEqualAsNumbers" : {
            applyPattern: "Number($1) !== Number($2)"
        },
        "notEqualAsStrings" : {
            applyPattern: "String($1) !== String($2)"
        },
        ">" : {
            applyPattern: "Number($1) > Number($2)"
        },
        ">=" : {
            applyPattern: "Number($1) >= Number($2)"
        },
        "<" : {
            applyPattern: "Number($1) < Number($2)"
        },
        "&&": {
            applyPattern: " && "
        },
        "||": {
            applyPattern: " || "
        },
        "startsWith": {
            applyPattern: "$1.startsWith($2)"
        },
        "contains": {
            applyPattern: "?"
        },
        "endsWith": {
            applyPattern: "$1.endsWith($2)"
        },
        "isEmpty": {
            applyPattern: "$1 === \"\""
        },
        "matches": {
            applyPattern: "?"
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

    JSON2condition(json) {
        return "";
    }

}

module.exports = { TiledeskExpression }