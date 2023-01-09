var assert = require('assert');
const { TiledeskExpression } = require('../TiledeskExpression');

describe('Evaluate basic conditions', function() {
  
    // it('quick conditions 1 - true', async () => {
    //     const condition = "$userFullname === 'Andrea'"
    //     console.log("Evaluating condition:", condition);
    //     let context = {userFullname: 'Andrea'};
    //     console.log("With context:", context);
    //     const result = new TiledeskExpression().evaluateExpression(condition, context);
    //     console.log("conditionResult:", result);
    //     assert(result === true);
    // });

    // it('quick conditions 2 - empty context', async () => {
    //     const condition = "$userFullname === 'Andrea'"
    //     console.log("Evaluating condition:", condition);
    //     context = {};
    //     console.log("With context:", context);
    //     const result = new TiledeskExpression().evaluateExpression(condition, context);
    //     console.log("conditionResult:", result);
    //     assert(result === false);
    // });

    // it('quick conditions 3 - false', async () => {
    //     const condition = "$userFullname === 'Andrea'"
    //     console.log("Evaluating condition:", condition);
    //     context = {userFullname: 'Andreus'};
    //     console.log("With context:", context);
    //     const result = new TiledeskExpression().evaluateExpression(condition, context);
    //     console.log("conditionResult:", result);
    //     assert(result === false);
    // });

    // it('condition 2 - numbers and string comparison - true', async () => {
    //     const condition = "$score >= $minimumScore && $topic === $testTopic";
    //     console.log("Evaluating condition:", condition);
    //     context = {
    //         score: 10,
    //         minimumScore: 5,
    //         topic: "Angular",
    //         testTopic: "Angular"
    //     };
    //     console.log("With context:", context);
    //     const result = new TiledeskExpression().evaluateExpression(condition, context)
    //     console.log("conditionResult2:", result);
    //     assert(result === true);
    // });

    // it('condition 3 - startsWith -> false', async () => {
    //     const condition = "$site.url.startsWith($url_match)";
    //     console.log("Evaluating condition:", condition);
    //     context = {
    //         site: {
    //             url: "https://tiledesk.com/pricing"
    //         },
    //         url_match: "pricing"
    //     };
    //     const result = new TiledeskExpression().evaluateExpression(condition, context)
    //     console.log("conditionResult3:", result);
    //     assert(result === false);
    // });

    // it('condition 4 - startsWith -> true', async () => {
    //     const condition = "$site.url.startsWith($url_match)";
    //     console.log("Evaluating condition:", condition);
    //     context = {
    //         site: {
    //             url: "https://tiledesk.com/pricing"
    //         },
    //         url_match: "https:"
    //     };
    //     const result = new TiledeskExpression().evaluateExpression(condition, context);
    //     console.log("conditionResult4:", result);
    //     assert(result === true);
    // });

    it('condition 5 - compare string with a constant', async () => {
        const condition = "$_tdCountry === 'IT'";
        console.log("Evaluating condition:", condition);
        context = {
            "_tdCountry": "IT"
        };
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        console.log("conditionResult5:", result);
        assert(result === true);
    });

    // it('assignment 1', async () => {
    //     const expression = "$protocol + $site.url";
    //     console.log("Evaluating assign expression:", expression);
    //     context = {
    //         protocol: "https://",
    //         site: {
    //             url: "tiledesk.com/pricing"
    //         }
    //     };
    //     const result = new TiledeskExpression().evaluateExpression(expression, context);
    //     console.log("expression value:", result);
    //     assert(result === 'https://tiledesk.com/pricing');
    // });

    // it('assignment 2', async () => {
    //     const expression = "$age + $added";
    //     console.log("Evaluating assign expression:", expression);
    //     context = {
    //         age: 32,
    //         added: 10
    //     };
    //     const result = new TiledeskExpression().evaluateExpression(expression, context);
    //     console.log("expression value:", result);
    //     assert(result === 42);
    // });

    // it('assignment 3 - Number() on numbers', async () => {
    //     const expression = "Number($age) + Number($added)";
    //     console.log("Evaluating assign expression:", expression);
    //     context = {
    //         age: 33,
    //         added: 10
    //     };
    //     const result = new TiledeskExpression().evaluateExpression(expression, context);
    //     console.log("expression value:", result);
    //     assert(result === 43);
    // });

    // it('assignment 4 - Number() on strings', async () => {
    //     const expression = "Number($age) + Number($added)";
    //     console.log("Evaluating assign expression:", expression);
    //     context = {
    //         age: "34",
    //         added: "10"
    //     };
    //     const result = new TiledeskExpression().evaluateExpression(expression, context);
    //     console.log("expression value:", result);
    //     assert(result === 44);
    // });

    // it('assignment 5 - Constant int, no context', async () => {
    //     const expression = 45;
    //     console.log("Evaluating assign expression:", expression);
    //     const result = new TiledeskExpression().evaluateExpression(expression, context);
    //     console.log("expression value:", result);
    //     assert(result === 45);
    // });
    
});



