//Json schema for the operation directive
/*
{
    "type": "object",
    "properties": {
        "directive": {
            "type": "string",
            "enum": ["operation"]
        },

        "destination": {
            "type": "string",
        },

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
                properties: {
                    "value": {
                        "type": "string"
                    },
                    "isVariable": {
                        "type": "boolean"
                    },
                    "function": {
                        "type": "string",
                        "enum": ["upperCaseAsString", "lowerCaseAsString", "cosAsNumber", "sinAsNumber", "tanAsNumber", "absAsNumber", "ceilAsNumber", "floorAsNumber", "roundAsNumber"]
                    }
                },
                "required": ["value", "isVariable"],
                "additionalProperties": false
            }
        }
    },
    
    "required": ["directive", "destination", "operands"],
    "additionalProperties": false
}
*/