var assert = require('assert');
const { TiledeskExpression } = require('../TiledeskExpression');

describe('Evaluate basic conditions', function() {
  
    it('quick conditions 1 - true', async () => {
        const condition = "$userFullname === 'Andrea'"
        let context = {userFullname: 'Andrea'};
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        assert(result === true);
    });

    it('quick conditions 2 - empty context', async () => {
        const condition = "$userFullname === 'Andrea'"
        context = {};
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        assert(result === false);
    });

    it('quick conditions 3 - false', async () => {
        const condition = "$userFullname === 'Andrea'"
        context = {userFullname: 'Andreus'};
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        assert(result === false);
    });

    it('condition 2 - numbers and string comparison - true', async () => {
        const condition = "$score >= $minimumScore && $topic === $testTopic";
        context = {
            score: 10,
            minimumScore: 5,
            topic: "Angular",
            testTopic: "Angular"
        };
        const result = new TiledeskExpression().evaluateExpression(condition, context)
        assert(result === true);
    });

    it('condition 3 - startsWith -> false', async () => {
        const condition = "$site.url.startsWith($url_match)";
        context = {
            site: {
                url: "https://tiledesk.com/pricing"
            },
            url_match: "pricing"
        };
        const result = new TiledeskExpression().evaluateExpression(condition, context)
        assert(result === false);
    });

    it('condition 4 - startsWith -> true', async () => {
        const condition = "$site.url.startsWith($url_match)";
        context = {
            site: {
                url: "https://tiledesk.com/pricing"
            },
            url_match: "https:"
        };
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        assert(result === true);
    });

    it('condition 5 - compare string with a constant', async () => {
        const condition = "$_tdCountry === 'IT'";
        context = {
            "_tdCountry": "IT"
        };
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        assert(result === true);
    });

    it('condition 6 - invalid expression', async () => {
        const condition = "don't try this";
        context = {
            "whatever": "IT"
        };
        const result = new TiledeskExpression().evaluateExpression(condition, context);
        assert(result === undefined);
    });

    it('assignment 1', async () => {
        const expression = "$protocol + $site.url";
        context = {
            protocol: "https://",
            site: {
                url: "tiledesk.com/pricing"
            }
        };
        const result = new TiledeskExpression().evaluateExpression(expression, context);
        assert(result === 'https://tiledesk.com/pricing');
    });

    it('assignment 2', async () => {
        const expression = "$age + $added";
        context = {
            age: 32,
            added: 10
        };
        const result = new TiledeskExpression().evaluateExpression(expression, context);
        assert(result === 42);
    });

    it('assignment 3 - Number() on numbers', async () => {
        const expression = "Number($age) + Number($added)";
        context = {
            age: 33,
            added: 10
        };
        const result = new TiledeskExpression().evaluateExpression(expression, context);
        assert(result === 43);
    });

    it('assignment 4 - Number() on strings', async () => {
        const expression = "Number($age) + Number($added)";
        context = {
            age: "34",
            added: "10"
        };
        const result = new TiledeskExpression().evaluateExpression(expression, context);
        assert(result === 44);
    });

    it('assignment 5 - Constant int, no context', async () => {
        const expression = 45;
        const result = new TiledeskExpression().evaluateExpression(expression, context);
        assert(result === 45);
    });
    
});



