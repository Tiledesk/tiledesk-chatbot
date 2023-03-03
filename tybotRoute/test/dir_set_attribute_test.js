var assert = require('assert');
const { DirSetAttribute } = require('../tiledeskChatbotPlugs/directives/DirSetAttribute.js');
const { TiledeskChatbot } = require('../models/TiledeskChatbot');

// just a schema remainder
// const schema = {
//     "type": "object",
//     "properties": {
//         "_tdActionType": {
//             "type": "string",
//             "enum": ["setattribute"]
//         },

//         "_tdActionTitle": {
//             "type": "string"
//         },

//         "destination": {
//             "type": "string",
//         },

//         "operation": {
//             "type": "object",
//             "properties": {
//                 "operators": {
//                     "type": "array",
//                     "items": {
//                         "type": "string",
//                         "enum": ["addAsNumber", "addAsString", "subtractAsNumber", "multiplyAsNumber", "divideAsNumber"]
//                     }
//                 },

//                 "operands": {
//                     "type": "array",
//                     "minItems": 1,
//                     "items": {
//                         "type": "object",
//                         "properties": {
//                             "value": {
//                                 "type": "string"
//                             },
//                             "isVariable": {
//                                 "type": "boolean"
//                             },
//                             "function": {
//                                 "type": "string",
//                                 "enum": ["upperCaseAsString", "lowerCaseAsString", "absAsNumber", "ceilAsNumber", "floorAsNumber", "roundAsNumber"]
//                             }
//                         },
//                         "required": ["value", "isVariable"],
//                         "additionalProperties": false
//                     }
//                 }
//             },
//             "required": ["operands"],
//             "additionalProperties": false
//         }
//     },
//     "required": ["_tdActionType", "_tdActionTitle" , "destination", "operation"],
//     "additionalProperties": false
// };

describe('Testing dir_set_attribute_test with a single const', function() {
    it('should print add to: counter the value: 1', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            return {};
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("addParameterStatic: " + key + " value: " + value);
            assert.equal(key, "counter");
            assert.equal(value, "10");
        }

        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "counter",
            operation: {
                operands: [
                    {
                        value: "10",
                        isVariable: false
                    }
                ]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh'
        }

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
        }
        
        dirSetAttribute.execute({'action': action}, cb);
    });
});


describe('Testing dir_set_attribute_test with a single variabile', function() {
    it('should print add to: counter the value: 1', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            return {
                "input": "10"
            };
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("addParameterStatic: " + key + " value: " + value);
            assert.equal(key, "counter");
            assert.equal(value, "10");
        }


        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "value",
            operation: {
                operands: [
                    {
                        value: "input",
                        isVariable: true
                    }
                ]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };
        const dirSetAttribute = new DirSetAttribute(context);
        dirSetAttribute.execute({'action': action}, () => console.log("finished"));
    });
})

describe('Testing dir_set_attribute_test with a complex operation', function() {
    it('should print add to: total the value: 4', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            return {
                "previous": "10",
                "temp": "15.232",
                "real": "-15",
                "input": "5"
            };
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("addParameterStatic: " + key + " value: " + value);
            assert.equal(key, "total");
            assert.equal(value, "4");
        }


        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "total",
            operation: {
                operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber", "multiplyAsNumber"],
                operands: [
                    {
                        value: "previous",
                        isVariable: true
                    },
                    {
                        value: "temp",
                        isVariable: true,
                        function: "floorAsNumber"
                    },
                    {
                        value: "real",
                        isVariable: true,
                        function: "absAsNumber"
                    },
                    {
                        value: "input",
                        isVariable: true
                    },
                    {
                        value: "2",
                        isVariable: false
                    }
                ]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
        }

        dirSetAttribute.execute({'action': action}, cb);
    });
});

describe('Testing dir_set_attribute_test with a complex string operation', function() {
    it('should print add to: total the value: Francesco Latino Tiledesk', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            return {
                "name": "Francesco",
                "surname": "Latino",
                "company": "Tiledesk"
            };
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("addParameterStatic: " + key + " value: " + value);
            assert.equal(key, "total");
            assert.equal(value, "Francesco Latino Tiledesk");
        }

        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "total",
            operation: {
                operators: ["addAsString", "addAsString", "addAsString", "addAsString"],
                operands: [
                    {
                        value: "name",
                        isVariable: true
                    },
                    {
                        value: " ",
                        isVariable: false
                    },
                    {
                        value: "surname",
                        isVariable: true
                    },
                    {
                        value: " ",
                        isVariable: false
                    },
                    {
                        value: "company",
                        isVariable: true
                    }
                ]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
        }

        dirSetAttribute.execute({'action': action}, cb);
    });
});

describe('Testing dir_set_attribute_test with wrong inputs, function() {}', function() {
    it('should immidiatly call the cb', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            console.log("i should not be called");
            assert.fail();
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("i should not be called");
            assert.fail();
        }



        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "total",
            operation: {
                operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber", "multiplyAsNumber"]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
            assert.ok(true);
        }

        dirSetAttribute.execute({'action': action}, cb);
    });

    it('should immidiatly call the cb, empty action', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            console.log("i should not be called");
            assert.fail();
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("i should not be called");
            assert.fail();
        }

        const action = {};  
        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
            assert.ok(true);
        }

        dirSetAttribute.execute({'action': action}, cb);
    });

    it('should immidiatly call the cb, wrong number of operands', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            console.log("i should not be called");
            assert.fail();
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("i should not be called");
            assert.fail();
        }

        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "total",
            operation: {
                operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber", "multiplyAsNumber"],
                operands: [
                    {
                        value: "previous",
                        isVariable: true
                    },
                    {
                        value: "temp",
                        isVariable: true,
                        function: "floorAsNumber"
                    },
                    {
                        value: "real",
                        isVariable: true,
                        function: "absAsNumber"
                    },
                    {
                        value: "input",
                        isVariable: true
                    }
                ]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
            assert.ok(true);
        }

        dirSetAttribute.execute({'action': action}, cb);
    });

    it('should immidiatly call the cb, wrong number of operands with no operators', async function() {
        TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
            console.log("i should not be called");
            assert.fail();
        }

        TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
            console.log("i should not be called");
            assert.fail();
        }

        const action = {
            _tdActionTitle: "Set attribute",
            _tdActionType: "setattribute",
            destination: "total",
            operation: {
                operands: [
                    {
                        value: "previous",
                        isVariable: true
                    },
                    {
                        value: "temp",
                        isVariable: true,
                        function: "floorAsNumber"
                    },
                    {
                        value: "real",
                        isVariable: true,
                        function: "absAsNumber"
                    },
                    {
                        value: "input",
                        isVariable: true
                    }
                ]
            }
        };

        const context = {
            tdcache: {},
            requestId: 'buh',
            log: true
        };

        const dirSetAttribute = new DirSetAttribute(context);
        cb = function() {
            console.log("finished");
            assert.ok(true);
        }

        dirSetAttribute.execute({'action': action}, cb);
    });
});