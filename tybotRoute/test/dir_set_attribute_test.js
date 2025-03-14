 var assert = require('assert');
 const { DirSetAttribute } = require('../tiledeskChatbotPlugs/directives/DirSetAttribute.js');
 const { DirSetAttributeV2 } = require('../tiledeskChatbotPlugs/directives/DirSetAttributeV2.js');
 const { TiledeskChatbot } = require('../models/TiledeskChatbot');
 const { promisify } = require('util');
 const winston = require('../utils/winston.js');
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

describe('Testing dir_set_attribute_test', function() {
    let previousAllParametersStatic;
    let previousAddParameterStatic;

    before(function() {
        previousAllParametersStatic = TiledeskChatbot.allParametersStatic;
        previousAddParameterStatic = TiledeskChatbot.addParameterStatic;
    });
    
    describe('Testing dir_set_attribute_test with a single const', function() {
        it('should print Redis: counter; value: 10', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {};
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                keyTest = key;
                valueTest = value;
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
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "counter");
            assert.equal(valueTest, "10");
        });
    });

    describe('Testing dir_set_attribute_test with a single variabile', function() {
        it('should print add to: counter the value: 1', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "input": "1"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
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
                requestId: 'buh'
            };
        
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "value");
            assert.equal(valueTest, "1");
        });
    })

    describe('Testing dir_set_attribute_test with functions applied', function() {
        it('should capitalize the attribute (aka isVariable = true)', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "name": "andrea"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "value",
                operation: {
                    operands: [
                        {
                            value: "name",
                            isVariable: true,
                            function: "capitalizeAsString"
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttributeV2(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "value");
            assert.equal(valueTest, "Andrea");
        });
        it('should capitalize a constant', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {};
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "value",
                operation: {
                    operands: [
                        {
                            value: "luis",
                            isVariable: false,
                            function: "capitalizeAsString"
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttributeV2(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "value");
            assert.equal(valueTest, "Luis");
        });
        it('should convert an attribute (string) to JOSON with JSONpase', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "property": "{\"size\": 12, \"coords\": {\"x\": 2, \"y\": 4}}"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "value",
                operation: {
                    operands: [
                        {
                            value: "property",
                            isVariable: true,
                            function: "JSONparse"
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttributeV2(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "value");
            assert.equal(valueTest.size, 12);
        });

        it('should convert a constant to JOSON with JSONpase', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {};
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "value",
                operation: {
                    operands: [
                        {
                            value: "{\"size\": 12, \"coords\": {\"x\": 2, \"y\": 4}}",
                            isVariable: false,
                            function: "JSONparse"
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttributeV2(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "value");
            assert.equal(valueTest.size, 12);
        });
    });

    describe('Testing dir_set_attribute_test with a simple operation', async function() {
        it('should print add to: total the value: 4', async function() {
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "input": "-4"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "total",
                operation: {
                    operands: [
                        {
                            value: "-4",
                            isVariable: false,
                            function: "absAsNumber"
                        }
                    ]    
                }
            };            
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "total");
            assert.equal(valueTest, "4");
        });
    });
    describe('Testing dir_set_attribute_test with a complex operation', function() {
        it('should print add to: total the value: 4', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "previous": "10",
                    "temp": "15.232",
                    "real": "-15",
                    "input": "5"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
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
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "total");
            assert.equal(valueTest, "4");
        });
    });
    describe('Testing dir_set_attribute_test with a complex string operation', function() {
        it('should print add to: total the value: Francesco Latino Tiledesk', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "name": "francesco",
                    "surname": "latino",
                    "company": "tiledesk"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
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
                            isVariable: true,
                            function: "capitalizeAsString"
                        },
                        {
                            value: " ",
                            isVariable: false
                        },
                        {
                            value: "surname",
                            isVariable: true,
                            function: "capitalizeAsString"
                        },
                        {
                            value: " ",
                            isVariable: false
                        },
                        {
                            value: "company",
                            isVariable: true,
                            function: "capitalizeAsString"
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "total");
            assert.equal(valueTest, "Francesco Latino Tiledesk");
        });
        it('should print a filled (LiquindJS) attribute', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {
                    "name": "andrea",
                    "lastname": "sponziello",
                    "company": "tiledesk"
                };
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "summary",
                operation: {
                    operators: [],
                    operands: [
                        {
                            value: "{{name}} {{lastname}} {{company}}",
                            isVariable: false
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttributeV2(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "summary");
            assert.equal(valueTest, "andrea sponziello tiledesk");
        });
    });

    describe('Testing dir_set_attribute_test with wrong inputs', function() {
        it('should immidiatly call the cb', async function() {
            let failed = false;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                winston.warn("This should not be called");
                failed = true;
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.warn("This should not be called");
                failed = true;
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
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.ok(!failed);
        });
    
    
        it('should immidiatly call the cb, empty action', async function() {
            let failed = false;
        
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                winston.warn("This should not be called");
                failed = true;
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.warn("This should not be called");
                failed = true;
            }
            const action = {};  
            const context = {
                tdcache: {},
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.ok(!failed);
        });
        it('should immidiatly call the cb, wrong number of operands with no operators', async function() {
            let failed = false;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                winston.warn("This should not be called");
                failed = true;
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.warn("This should not be called");
                failed = true;
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
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.ok(!failed);
        });
        it('should immidiately call the cb, wrong number of operands', async function() {
            let failed = false;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                winston.warn("This should not be called");
                failed = true;
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.warn("This should not be called");
                failed = true;
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
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.ok(!failed);
        });
        it('should immidiatly call the cb, wrong variable name, not following the regex', async function() {
            let failed = false;
        
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                winston.warn("This should not be called");
                failed = true;
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.warn("This should not be called");
                failed = true;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "total",
                operation: {
                    operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber"],
                    operands: [
                        {
                            value: "inject(here);",
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
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.ok(!failed);
        });
        it('should immidiatly call the cb, wrong variable name, not following the regex', async function() {
            let failed = false;
        
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                winston.warn("i should not be called");
                failed = true;
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                winston.warn("i should not be called");
                failed = true;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattribute",
                destination: "total",
                operation: {
                    operators: ["addAsNumber", "subtractAsNumber", "divideAsNumber"],
                    operands: [
                        {
                            value: "temp",
                            isVariable: true
                        },
                        {
                            value: "inject(here);",
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
                requestId: 'buh'
            };
            const dirSetAttribute = new DirSetAttribute(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.ok(!failed);
        });
    });

    describe('Testing dir_set_attribute_test type settings', function() {
        it('should print json', async function() {
            let keyTest, valueTest;
            TiledeskChatbot.allParametersStatic = async function(tdcache, requestId) {
                return {};
            }
            TiledeskChatbot.addParameterStatic = async function(tdcache, requestId, key, value) {
                // winston.info("Redis: " + key + "; value: " + value);
                keyTest = key;
                valueTest = value;
            }
            const action = {
                _tdActionTitle: "Set attribute",
                _tdActionType: "setattributev2",
                destination: "obj",
                operation: {
                    operands: [
                        {
                            value: "{\"val\": \"10\"}",
                            isVariable: false,
                            type: "json"
                        }
                    ]
                }
            };
            const context = {
                tdcache: {},
                requestId: 'buh'
            }
            const dirSetAttribute = new DirSetAttributeV2(context);
            const executeAsync = promisify(dirSetAttribute.execute).bind(dirSetAttribute);
            await executeAsync({'action': action});
            assert.equal(keyTest, "obj");
            assert.equal(typeof valueTest, "object");
        });
    });

    after(function() {
        TiledeskChatbot.allParametersStatic = previousAllParametersStatic;
        TiledeskChatbot.addParameterStatic = previousAddParameterStatic;
    });
});


