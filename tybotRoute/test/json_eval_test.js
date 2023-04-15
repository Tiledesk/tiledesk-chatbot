var assert = require('assert');
const { TiledeskJSONEval } = require('../TiledeskJSONEval');

const data = { 
    "name": "Alan",
    "hometown": "Somewhere, TX",
    "time": 123,
    "owner": {
        "name": "Andrea",
        "CF": "SPN"
    },
    "html": "<div>HTML Content!</div>",
    "kids": [
        {
            "name": "Jimmy",
            "age": "12"
        }, 
        {
            "name": "Sally",
            "age": "4"
        }
    ],
    "names": [
        "Andrea",
        "Marco",
        "Mery",
        "Nico",
        "Antonio",
        "Stefania",
        "Luca"
    ]
};

describe('Evaluate all paths', function() {
  
    it('name', async () => {
        let value = TiledeskJSONEval.eval(data, "name")
        assert(value === "Alan");
    });

    it('time', async () => {
        let value = TiledeskJSONEval.eval(data, "time")
        assert(value === "123");
        assert(typeof value === "string")
    });

    it('owner.name', async () => {
        let value = TiledeskJSONEval.eval(data, "owner.name")
        assert(value === "Andrea");
        assert(typeof value === "string")
    });

    it('html', async () => {
        let value = TiledeskJSONEval.eval(data, "html")
        assert(value === "<div>HTML Content!</div>");
    });

    it('kids.[0].name', async () => {
        let value = TiledeskJSONEval.eval(data, "kids.[0].name")
        assert(value === "Jimmy");
    });

    it('kids.[1].name', async () => {
        let value = TiledeskJSONEval.eval(data, "kids.[1].name")
        assert(value === "Sally");
    });

    it('not existing kids.[3].name', async () => {
        let value = TiledeskJSONEval.eval(data, "kids.[3].name")
        assert(value === "");
        assert(typeof value === "string")
    });

    it('last kids', async () => {
        let value = TiledeskJSONEval.eval(data, "last kids");
        assert(value === "[object Object]");
        assert(typeof value === "string")
    });

    it('first names', async () => {
        let value = TiledeskJSONEval.eval(data, "first names");
        assert(value === "Andrea");
    });

    it('last names', async () => {
        let value = TiledeskJSONEval.eval(data, "last names");
        assert(value === "Luca");
    });

    it('{{handlebars}}} syntax array last element', async () => {
        let value = TiledeskJSONEval.eval(data, "{{#each kids}}{{#if @last}}{{this.name}}{{/if}}{{/each}}");
        assert(value === "Sally");
    });
});




