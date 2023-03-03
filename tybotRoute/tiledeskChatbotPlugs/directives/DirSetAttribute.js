const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskMath } = require('../../TiledeskMath');
const { TiledeskString } = require('../../TiledeskString');
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
            "type": ["string", "null"]
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
                                "enum": ["capitalizeAsString", "upperCaseAsString", "lowerCaseAsString", "absAsNumber", "ceilAsNumber", "floorAsNumber", "roundAsNumber"]
                            }
                        },
                        "required": ["value", "isVariable"],
                        "additionalProperties": false,
                        "if": {
                            "properties": { "isVariable": { "const": true } },
                        },
                        "then": {
                            "properties": { "value": { "pattern": "^[a-zA-Z_]*[a-zA-Z_]+[a-zA-Z0-9_]*$" } }
                        }
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

        if(action.operation.operators === undefined && action.operation.operands.length !== 1) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action: operators === undefined && operands.length !== 1")};
            callback();
            return;
        }

        
        if (action.operation.operators !== undefined && action.operation.operators.length !== action.operation.operands.length - 1) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action: operators.length !== operands.length - 1")};
            callback();
            return;
        }
        

        const expression = TiledeskExpression.JSONOperationToExpression(action.operation.operators, action.operation.operands);
        const attributes = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        attributes.TiledeskMath = TiledeskMath;
        attributes.TiledeskString = TiledeskString;

        const result = new TiledeskExpression().evaluateJavascriptExpression(expression, attributes);
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.destination, result);

        callback();
    }
}

module.exports = { DirSetAttribute }; 