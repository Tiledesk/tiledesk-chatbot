const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { Filler } = require('../Filler');
const validate = require('jsonschema').validate;

const schema = {
    "type": "object",
    "properties": {
        "_tdActionType": {
            "type": "string",
            "enum": ["setattribute"]
        },

        "_tdActionTitle": {
            "type": "string"
        },

        "destination": {
            "type": "string",
        },

        "operation": {
            "type": "object",
            "properties": {
                "operators": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["addAsNumber", "addAsString", "subtractAsNumber", "multiplyAsNumber", "divideAsNumber"]
                    }
                },

                "operands": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "value": {
                                "type": "string"
                            },
                            "isVariable": {
                                "type": "boolean"
                            },
                            "function": {
                                "type": "string",
                                "enum": ["upperCaseAsString", "lowerCaseAsString", "absAsNumber", "ceilAsNumber", "floorAsNumber", "roundAsNumber"]
                            }
                        },
                        "required": ["value", "isVariable"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["operands"],
            "additionalProperties": false
        }
    },
    "required": ["_tdActionType", "_tdActionTitle", "destination", "operation"],
    "additionalProperties": false
};


class DirSetAttribute {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.log = context.log;
    }

    execute(directive, callback) {
        let action;
        if (directive.action) {
            action = directive.action
        }
        else {
            callback();
            return;
        }
        // console.log("go DirAssign with action:", action);
        this.go(action, () => {
            callback();
        });
    }

    async go(action, callback) {
        let res = validate(action, schema);
        if (!res.valid) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action:", res.errors)};
            callback();
            return;
        }

        if (!action.operation.operators && action.operation.operands.length !== 1) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action: if operators is not present, operands must have length 1")};
            callback();
            return;
        } else if (action.operation.operators.length !== action.operation.operands.length - 1) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action: operators and operands must have n - 1 length")};
            callback();
            return;
        }


        const expression = TiledeskExpression.JSONOperationToExpression(action.operation.operators, action.operation.operands);
        const attributes = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        const result = TiledeskExpression.evaluateExpression(expression, attributes);
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.destination, result);
        callback();
    }
}

module.exports = { DirSetAttribute }; 