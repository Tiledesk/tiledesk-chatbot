const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskMath } = require('../../TiledeskMath');
const { TiledeskString } = require('../../TiledeskString');
const { Filler } = require('../Filler');
const validate = require('jsonschema').validate;
const winston = require('../../utils/winston');
const httpUtils = require('../../utils/HttpUtils');
const { Logger } = require('../../Logger');

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
        this.requestId = context.requestId;

        let dev = this.context.supportRequest?.draft || false;
        let intent_id = this.context.reply?.attributes?.intent_info?.intent_id || undefined;
        this.logger = new Logger({ request_id: this.requestId, dev: dev, intent_id: intent_id });
    }

    execute(directive, callback) {
        this.logger.info("[Set Attribute] Executing action");
        winston.verbose("Execute SetAttributeV2 directive");
        let action;
        if (directive.action) {
            action = directive.action
        }
        else {
            this.logger.error("Incorrect action for ", directive.name, directive)
            winston.warn("DirSetAttributeV2 Incorrect directive: ", directive);
            callback();
            return;
        }
        this.go(action, () => {
            this.logger.info("[Set Attribute] Action completed");
            callback();
        });
    }

    async go(action, callback) {
        winston.debug("(DirSetAttributeV2) Action: ", action);
      
        if (action && !action.operation) {
            winston.error("(DirSetAttributeV2) Error operation is mandatory");
            callback();
            return;
        }
        if (action && action.operation && action.operation.operands) {
            winston.debug("(DirSetAttributeV2) filling in setattribute...");
            await this.fillValues(action.operation.operands);
        }
        
        // FUN FACT: THIS TOOK A LOT OF EFFORT BUT IT WAS NEVER USED. YOU CAN SIMPLY CREATE A JSON ATTRIBUTE APPLYING
        // JSONparse FUNCTION TO AN ATTRIBUTE.
        // DEPRECATED because type = json is not available in the UI!
        if (action.operation.operands && action.operation.operands.length === 1 && action.operation.operands[0].type === "json") {
            const json_value = JSON.parse(action.operation.operands[0].value);
            await this.saveAttribute(action.destination, json_value);
            // await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.destination, json_value);
            callback();
            return; // on json types no operations are permitted beyond assignment
        }
        winston.debug("(DirSetAttributeV2) filled in setattribute:", action.operation);
       
        if (action.operation?.operators === undefined && action.operation?.operands?.length !== 1) {
            winston.error("(DirSetAttributeV2) Invalid action: operators === undefined && operands.length !== 1")
            callback();
            return;
        }
        if (action.operation?.operators !== undefined && action.operation?.operators?.length !== action.operation?.operands?.length - 1) {
            winston.error("(DirSetAttributeV2) Invalid action: operators.length !== operands.length - 1")
            callback();
            return;
        }
        // if (action && action.operation && action.operation.operands) {
        //     await this.fillValues(action.operation.operands);
        // }
        try {
            const expression = TiledeskExpression.JSONOperationToExpression(action.operation?.operators, action.operation?.operands);
            const attributes = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
            if (attributes) {
                attributes.TiledeskMath = TiledeskMath;
                attributes.TiledeskString = TiledeskString;
                const result = new TiledeskExpression().evaluateJavascriptExpression(expression, attributes);
                // THE GOAL OF ATTRIBUTE-FILLING THE "DESTINATION" FIELD IS TO SUPPORT DYNAMIC ATTRIBUTES
                // (ATTRS WHOSE NAME IS UNKNOWN AD DESIGN-TIME)
                // STILL UNSUPPORTED IN UI
                let destination = await this.fillDestination(action.destination);
                await this.saveAttribute(destination, result);
            }
        }
        catch(err) {
            winston.error("(DirSetAttributeV2)  error:", err);
        }
        
        // await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, destination, result);
        callback();
    }

    async saveAttribute(key, value, persist) {
        winston.debug("(DirSetAttributeV2) saving attribute: " + key + " " + value + " " + persist);
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, key, value);
        // if (persist) {
        //     await this.persistOnTiledesk(destination, result);
        // }
        
        // await make persistent autenticato con "Chatbot Token" (solo il chatbot può usare questo servizio)
        // sarebbe il top che accodasse
        /**
         * ACL ?
         * Solo agents appartenenti a quella conversazione possono accedere agli attibuti. E gli Admin
         * collection flow_attributes
         * {
         *  "projectId",
         *  "flowId",
         *  "requestId",
         *  attributes: [
         *      {"key": destination, "value": {}, 2, "Andrea"} => In pratica value è un "any"
         *  ]
         * }
         */
    }

    async persistOnTiledesk(key, value) {
        if (!process.env.PERSIST_API_ENDPOINT) {
            return;
        }
        const HTTPREQUEST = {
            url: process.env.PERSIST_API_ENDPOINT,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.fixToken(this.context.token)
            },
            json: json,
            method: 'POST'
        }
        winston.debug("(DirSetAttributeV2) HttpRequest: ", HTTPREQUEST);
        httpUtils.request(
            HTTPREQUEST, async (err, resbody) => {
                if (err) {
                    winston.error("(DirSetAttributeV2) persistOnTiledesk() error: ", err);
                } else {
                    winston.debug("(DirSetAttributeV2) Attributes saved: ", resbody);
                }
            }
        );
        return;
    }

    async fillDestination(destination) {
        if (this.tdcache) {
            const requestAttributes = 
                await TiledeskChatbot.allParametersStatic(this.tdcache, this.context.requestId);
            const filler = new Filler();
            destination = filler.fill(destination, requestAttributes);
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
                const requestAttributes = 
                    await TiledeskChatbot.allParametersStatic(this.tdcache, this.context.requestId);
                const filler = new Filler();
                operands.forEach(operand => {
                    operand.value = filler.fill(operand.value, requestAttributes);
                });
            }
        }
        catch(error) {
            winston.error("(DirSetAttributeV2) Error while filling operands: ", error);
        }
    }

    convertOperandValues(operands) {
        winston.debug("(DirSetAttributeV2) Converting operands:", operands);
        // operation: {
        //     operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber", "multiplyAsNumber"],
        //     operands: [
        //         {
        //             value: "previous",
        //             isVariable: true,
        //             type: "string"
        //         }
        //     ]
        try {
            operands.forEach(operand => {
                if (operand.type) {
                    if (operand.type.toLowerCase() === "number") {
                        operand.value = Number(operand.value);
                    }
                    else if (operand.type.toLowerCase() === "json") {
                        operand.value = JSON.parse(operand.value);
                    }
                    else {
                        winston.warn("Converting operands - ??");
                    }
                }
            });
        }
        catch(error) {
            winston.error("(DirSetAttributeV2) Error while converting operands: ", error);
        }
    }

    fixToken(token) {
        if (token.startsWith('JWT ')) {
          return token
        }
        else {
          return 'JWT ' + token
        }
    }
}

module.exports = { DirSetAttributeV2 }; 