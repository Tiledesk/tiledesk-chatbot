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
        "_tdActionId": {
            "type": ["string", "null"]
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
                            "properties": { "value": { "pattern": "^[a-zA-Z_]*[.]*[a-zA-Z_]+[a-zA-Z0-9_]*$" } }
                        }
                    }
                }
            },
            "required": ["operands"],
            "additionalProperties": false
        }
    },
    "required": ["_tdActionType", "destination", "operation"],
    "additionalProperties": false
};


class DirSetAttributeV2 {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.tdcache = context.tdcache;
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
        console.log("(DirSetAttribute) action before filling:", JSON.stringify(action));
        if (action && action.operation && action.operation.operands) {
            console.log("filling in setattribute...");
            await this.fillValues(action.operation.operands);
        }
        console.log("filled in setattribute:", action.operation);
        // let res = validate(action, schema);
        // if (res.errors) {
        //     console.log("(DirSetAttribute) failed validation action:", JSON.stringify(action));
        //     console.log("DirSetAttribute validation errors:", res.errors);
        // }
        // if (!res.valid) {
        //     if (this.log) {console.error("(DirSetAttribute) Invalid action:", res.errors)};
        //     callback();
        //     return;
        // }
        if (action.operation.operators === undefined && action.operation.operands.length !== 1) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action: operators === undefined && operands.length !== 1")};
            callback();
            return;
        }
        if (action.operation.operators !== undefined && action.operation.operators.length !== action.operation.operands.length - 1) {
            if (this.log) {console.error("(DirSetAttribute) Invalid action: operators.length !== operands.length - 1")};
            callback();
            return;
        }
        // if (action && action.operation && action.operation.operands) {
        //     console.log("filling in setattribute...");
        //     await this.fillValues(action.operation.operands);
        // }
        console.log("dirsetattribute, action.operation.operands:", action.operation.operands);
        const expression = TiledeskExpression.JSONOperationToExpression(action.operation.operators, action.operation.operands);
        const attributes = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        console.log("dirsetattribute, attributes:", attributes);
        attributes.TiledeskMath = TiledeskMath;
        attributes.TiledeskString = TiledeskString;
        const result = new TiledeskExpression().evaluateJavascriptExpression(expression, attributes);
        console.log("filling in setattribute, result:", result);
        // THE GOAL OF ATTRIBUTE-FILLING THE "DESTINATION" FIELD IS TO SUPPORT DYNAMIC ATTRIBUTES
        // (ATTRS WHOSE NAME IS UNKNOWN AD DESIGN-TIME)
        // STILL UNSUPPORTED IN UI
        let destination = await this.fillDestination(action.destination);
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, destination, result);
        callback();
    }

    async fillDestination(destination) {
        if (this.tdcache) {
            // console.log("tdcache in setattribute...", this.tdcache);
            const requestAttributes = 
                await TiledeskChatbot.allParametersStatic(this.tdcache, this.context.requestId);
            // console.log("requestAttributes in setattribute...", requestAttributes);
            const filler = new Filler();
            destination = filler.fill(destination, requestAttributes);
            console.log("setattribute, final destination:", destination);
        }
        return destination
    }
    async fillValues(operands) {
        // operation: {
        //     operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber", "multiplyAsNumber"],
        //     operands: [
        //         {
        //             value: "previous",
        //             isVariable: true
        //         },
        //         {
        //             value: "temp",
        //             isVariable: true,
        //             function: "floorAsNumber"
        //         },
        //         {
        //             value: "real",
        //             isVariable: true,
        //             function: "absAsNumber"
        //         },
        //         {
        //             value: "input",
        //             isVariable: true
        //         },
        //         {
        //             value: "2",
        //             isVariable: false
        //         }
        //     ]
        try {
            if (this.tdcache) {
                // console.log("tdcache in setattribute...", this.tdcache);
                const requestAttributes = 
                    await TiledeskChatbot.allParametersStatic(this.tdcache, this.context.requestId);
                // console.log("requestAttributes in setattribute...", requestAttributes);
                const filler = new Filler();
                operands.forEach(operand => {
                    // if (!operand.isVariable) {
                        console.log("setattribute, liquid operand:", operand);
                        operand.value = filler.fill(operand.value, requestAttributes);
                        console.log("setattribute, final operand:", operand);
                    // }
                });
            }
        }
        catch(error) {
            console.error("Error while filling operands:", error);
        }
    }
}

module.exports = { DirSetAttributeV2 }; 