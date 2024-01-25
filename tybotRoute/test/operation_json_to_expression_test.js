var assert = require('assert');
const { TiledeskExpression } = require('../TiledeskExpression');


const { TiledeskMath } = require('../TiledeskMath');
const { TiledeskString } = require('../TiledeskString');

describe('JSON operation to expression', function() {

    describe('JSON math operation to expression single variable', function() {
        it('should be Number("2")', function() {
            const operators = [];
            const operands = [
                {
                    value: "2",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(undefined, operands);

            assert.equal(expression, '"2"');
        });
    });    


    describe('JSON math operation to expression', function() {
        it('should be Number("2") - Number("1")', function() {
            const operators = ["subtractAsNumber"];
            const operands = [
                {
                    value: "2",
                    isVariable: false
                },
                {
                    value: "1",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);

            assert.equal(expression, 'Number("2") - Number("1")');
        });
        
        it('should be Number(Number("2") + Number("1")) - Number("5")', function() {
            const operators = ["addAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "2",
                    isVariable: false
                },
                {
                    value: "1",
                    isVariable: false
                },
                {
                    value: "5",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number("2") + Number("1")) - Number("5")');
        });
    
        it('should be Number((Number("5") - Number("3"))) / Number("4")', function() {
            const operators = ["subtractAsNumber", "divideAsNumber"];
            const operands = [
                {
                    value: "5",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "4",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number("5") - Number("3")) / Number("4")');
        });
    
        it('should be Number(Number(Number(Number("5") - Number("3")) / Number("4"))) * Number("7")) - Number("3")', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "5",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "4",
                    isVariable: false
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number("5") - Number("3")) / Number("4")) * Number("7")) - Number("3")');
        });
    })

    describe('JSON string operation to expression', function() {
        it('should be String("hello") + String("world")', function() {
            const operators = ["addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false
                },
                {
                    value: "world",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'String("hello") + String("world")');
        });

        it('should be String(String("hello") + String("world")) + String("!!!")', function() {
            const operators = ["addAsString", "addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false
                },
                {
                    value: "world",
                    isVariable: false
                },
                {
                    value: "!!!",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'String(String("hello") + String("world")) + String("!!!")');
        });
    });

    describe('JSON string operation to expression with variables', function() {
   
        it('should be String("hello") + String($data.name)', function() {
            const operators = ["addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false
                },
                {
                    value: "name",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'String("hello") + String($data.name)');
        });


        it('should be String(String("hello") + String("world")) + String($data.special)', function() {
            const operators = ["addAsString", "addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false
                },
                {
                    value: "world",
                    isVariable: false
                },
                {
                    value: "special",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'String(String("hello") + String("world")) + String($data.special)');
        });
    });

    describe('JSON string operation to expression with variables and strings function', function() {
        it("should be TiledeskString.capitalize(String(#1))", function() {
            const operators = [];
            const operands = [
                {
                    value: "hello",
                    isVariable: false,
                    function: "capitalizeAsString"
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'TiledeskString.capitalize(String("hello"))');
        });

        it("should parse a constant string containing a JSON", function() {
            const operators = [];
            const operands = [
                {
                    value: "{\"name\":\"Andrea\"}",
                    isVariable: false,
                    function: "JSONparse"
                }
            ];
            // console.log("JSONparse value:", operands[0].value);
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("JSONparse expression:", expression);
            assert.equal(expression, 'JSON.parse(String("{\\"name\\":\\"Andrea\\"}"))');
        });

        it("should parse a string variable containing a JSON", function() {
            const operators = [];
            const operands = [
                {
                    value: "json_var",
                    isVariable: true,
                    function: "JSONparse"
                }
            ];
            console.log("JSONparse value:", operands[0].value);
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            console.log("JSONparse expression:", expression);
            assert.equal(expression, 'JSON.parse(String($data.json_var))');
        });

        it("should be Hello World", function() {
            const operators = ["addAsString", "addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false,
                    function: "capitalizeAsString"
                },
                {
                    value: " ",
                    isVariable: false,
                },
                {
                    value: "world",
                    isVariable: false,
                    function: "capitalizeAsString"
                }
            ];

            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'String(String(TiledeskString.capitalize(String("hello"))) + String(" ")) + String(TiledeskString.capitalize(String("world")))');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {'TiledeskString': TiledeskString});
            // console.log("result:", result);
            assert.equal(result, 'Hello World');
        });
    });


    describe('JSON string operation to expression with variables and function', function() {
        it('String(String(String("HELLO").toLowerCase()) + String(String($data.name).toUpperCase())) + String($data.special)', function() {
            const operators = ["addAsString", "addAsString"];
            const operands = [
                {
                    value: "HELLO",
                    isVariable: false,
                    function: "lowerCaseAsString"
                },
                {
                    value: "name",
                    isVariable: true,
                    function: "upperCaseAsString"
                },
                {
                    value: "special",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'String(String(String("HELLO").toLowerCase()) + String(String($data.name).toUpperCase())) + String($data.special)');
        });
    });

    describe('JSON string operation to result with variables and function', function() {
        it('should be String(String(String("HELLO").toLowerCase()) + String(String($data.name).toUpperCase())) + String($data.special)', function() {
            const operators = ["addAsString", "addAsString"];
            const operands = [
                {
                    value: "HELLO",
                    isVariable: false,
                    function: "lowerCaseAsString"
                },
                {
                    value: "name",
                    isVariable: true,
                    function: "upperCaseAsString"
                },
                {
                    value: "special",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {name: "Francesco", special: "!!!"});
            // console.log("result:", result);
            assert.equal(result, 'helloFRANCESCO!!!');
        });

        it('should be Francesco Latino Tiledesk', function() {
            const operator = ["addAsString", "addAsString", "addAsString", "addAsString"];

            const operands = [
                {
                    value: "name",
                    isVariable: true,
                    function: ""
                },
                {
                    value: " ",
                    isVariable: false,
                    function: ""
                },
                {
                    value: "surname",
                    isVariable: true,
                    function: ""
                },
                {
                    value: " ",
                    isVariable: false,
                    function: ""
                },
                {
                    value: "company",
                    isVariable: true,
                    function: ""
                }
            ];

            const expression = TiledeskExpression.JSONOperationToExpression(operator, operands);
            // console.log("expression:", expression);
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {name: "Francesco", surname: "Latino", company: "Tiledesk"});
            // console.log("result:", result);
            assert.equal(result, 'Francesco Latino Tiledesk');
        })
    });


    describe('JSON string operation to result with variables', function() {
        it('should be String("hello") + String($data.name)', function() {
            const operators = ["addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false
                },
                {
                    value: "name",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {name: "world"});
            // console.log("result:", result);
            assert.equal(result, 'helloworld');
        });

        it('should be String(String("hello") + String("world")) + String($data.special)', function() {
            const operators = ["addAsString", "addAsString"];
            const operands = [
                {
                    value: "hello",
                    isVariable: false
                },
                {
                    value: "world",
                    isVariable: false
                },
                {
                    value: "special",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {special: "!!!"});
            // console.log("result:", result);
            assert.equal(result, 'helloworld!!!');
        });
    });

    describe('JSON math operation to expression with math function and without variables', function() {
        it('should be Number(Number(Number(Number(TiledeskMath.round(Number("5.5"))) - Number("3")) / Number(TiledeskMath.abs(Number("-4"))))) * Number("7")) - Number("3")', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "5.5",
                    isVariable: false,
                    function: "roundAsNumber"
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "-4",
                    isVariable: false,
                    function: "absAsNumber"
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number(TiledeskMath.round(Number("5.5"))) - Number("3")) / Number(TiledeskMath.abs(Number("-4")))) * Number("7")) - Number("3")');
        });

        it('should be Number(Number(TiledeskMath.floor(Number("1.123")) + Number("2")) / Number(TiledeskMath.round("2.1"))', function() {
            const operators = ["addAsNumber", "divideAsNumber"];
            const operands = [
                {
                    value: "1.123",
                    isVariable: false,
                    function: "floorAsNumber"
                },
                {
                    value: "2",
                    isVariable: false
                },
                {
                    value: "2.1",
                    isVariable: false,
                    function: "roundAsNumber"
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(TiledeskMath.floor(Number("1.123"))) + Number("2")) / Number(TiledeskMath.round(Number("2.1")))');
        });
    });

    describe('JSON math operation to expression with math function and variables', function() {
        it('should be Number($data.score) + Number("12")', function() {
            const operators = ["addAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true
                },
                {
                    value: "12",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number($data.score) + Number("12")');
        });
    
        it('should be Number(Number($data.score) + Number("12")) - Number("5")', function() {
            const operators = ["addAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true
                },
                {
                    value: "12",
                    isVariable: false
                },
                {
                    value: "5",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number($data.score) + Number("12")) - Number("5")');
        });

        it('should be Number(Number(Number(Number(TiledeskMath.round(Number($data.score))) - Number("3")) / Number(TiledeskMath.abs(Number("-4"))))) * Number("7")) - Number($data.tot)', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true,
                    function: "roundAsNumber"
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "-4",
                    isVariable: false,
                    function: "absAsNumber"
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "tot",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number(TiledeskMath.round(Number($data.score))) - Number("3")) / Number(TiledeskMath.abs(Number("-4")))) * Number("7")) - Number($data.tot)');
        });
    });

    describe('JSON math operation to result without variables', function() {
        it('should be 8', function() {
            const operators = ["addAsNumber"];
            const operands = [
                {
                    value: "5",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                }
            ];
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number("5") + Number("3")');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {});
            // console.log("result:", result);
            assert.equal(result, 8);
        });
        
        it('should be 0.5', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "5",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "4",
                    isVariable: false
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "3",
                    isVariable: false
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number("5") - Number("3")) / Number("4")) * Number("7")) - Number("3")');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {});
            // console.log("result:", result);
            assert.equal(result, 0.5);
        });

        it('should be -1.875', function() {
            const operators = ["addAsNumber", "divideAsNumber", "subtractAsNumber", "multiplyAsNumber", "addAsNumber", "divideAsNumber"];
            const operands = [
                {
                    value: "-3",
                    isVariable: false,
                    function: "absAsNumber"
                },
                {
                    value: "5",
                    isVariable: false
                },
                {
                    value: "6",
                    isVariable: false
                },
                {
                    value: "5",
                    isVariable: false
                },
                {
                    value: "6",
                    isVariable: false
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "8",
                    isVariable: false
                }
            ];

            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number(Number(Number(TiledeskMath.abs(Number("-3"))) + Number("5")) / Number("6")) - Number("5")) * Number("6")) + Number("7")) / Number("8")');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {'TiledeskMath': TiledeskMath});
            // console.log("result:", result);
            assert.equal(result, -1.875);
        });
    });

    describe('JSON math operation to result with variables', function() {
        it('should be 8', function() {
            const operators = ["addAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true
                },
                {
                    value: "3",
                    isVariable: false
                }
            ];
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number($data.score) + Number("3")');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {score: 5});
            // console.log("result:", result);
            assert.equal(result, 8);
        });
        
        it('should be 0.5', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "4",
                    isVariable: false
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "tot",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number($data.score) - Number("3")) / Number("4")) * Number("7")) - Number($data.tot)');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {score: 5, tot: 3});
            // console.log("result:", result);
            assert.equal(result, 0.5);
        });
        it('should be -11.34', function() {
            const operators = ["subtractAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true
                },
                {
                    value: "tot",
                    isVariable: true
                }
            ];
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number($data.score) - Number($data.tot)');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {score: 5, tot: 16.34});
            // console.log("result:", result);
            assert.equal(result, -11.34);
        });
    });

    describe('JSON math operation to result with variables and math functions', function() {
        it('should be 8', function() {
            const operators = ["addAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true,
                    function: "roundAsNumber"
                },
                {
                    value: "3",
                    isVariable: false
                }
            ];
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(TiledeskMath.round(Number($data.score))) + Number("3")');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {score: 5.2, 'TiledeskMath': TiledeskMath});
            // console.log("result:", result);
            assert.equal(result, 8);
        });
        it('should be 0.5', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true,
                    function: "roundAsNumber"
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "4",
                    isVariable: false
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "tot",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number(TiledeskMath.round(Number($data.score))) - Number("3")) / Number("4")) * Number("7")) - Number($data.tot)');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {score: 5.2, tot: 3, 'TiledeskMath': TiledeskMath});
            // console.log("result:", result);
            assert.equal(result, 0.5);
        });
        it('should be 0.5', function() {
            const operators = ["subtractAsNumber", "divideAsNumber", "multiplyAsNumber", "subtractAsNumber"];
            const operands = [
                {
                    value: "score",
                    isVariable: true,
                    function: "roundAsNumber"
                },
                {
                    value: "3",
                    isVariable: false
                },
                {
                    value: "-4",
                    isVariable: false,
                    function: "absAsNumber"
                },
                {
                    value: "7",
                    isVariable: false
                },
                {
                    value: "tot",
                    isVariable: true
                }
            ];
    
            const expression = TiledeskExpression.JSONOperationToExpression(operators, operands);
            // console.log("expression:", expression);
            assert.equal(expression, 'Number(Number(Number(Number(TiledeskMath.round(Number($data.score))) - Number("3")) / Number(TiledeskMath.abs(Number("-4")))) * Number("7")) - Number($data.tot)');
            const result = new TiledeskExpression().evaluateJavascriptExpression(expression, {score: 5.2, tot: 3, 'TiledeskMath': TiledeskMath});
            // console.log("result:", result);
            assert.equal(result, 0.5);
        });
    });        
});