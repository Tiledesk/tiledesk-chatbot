class TiledeskExpression {
    // rules:
    // check valid operators (only those in operators are allowed)
    // check valid variable names /^[_0-9a-zA-Z\.]$/

    static operators = {
        ">" : {
            applyPattern: "Number(${1}) > Number(${2})"
        },
        ">=" : {
            applyPattern: "Number(${1}) >= Number(${2})"
        },
        "<" : {
            applyPattern: "Number(${1}) < Number(${2})"
        },
        "&&": {
            applyPattern: " && ${2}"
        },
        "||": {
            applyPattern: " && ${2}"
        },
        "startsWith": {
            applyPattern: "${1}.startsWith(${2})"
        },
        "contains": {
            applyPattern: "?"
        },
        "endsWith": {
            applyPattern: "?"
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
    evaluate(expression, context) {
        let fn;
        let res
        try {
            fn = Function(`let $data = this;return (${expression})`);
            res = fn.bind(context)()
        }
        catch (err) {
            console.error("Error:", err.message, "evaluating expression: '" + expression + "'");
        }
        // let fn = Function(`let $data = this;console.log('data', $data);return (${conditionExpression})`);
        return res;
    }

    JSON2condition(json) {
        return "";
    }

}

module.exports = { TiledeskExpression }