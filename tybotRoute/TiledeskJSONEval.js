const Handlebars = require("handlebars");

class TiledeskJSONEval {

    static eval(data, expression) {
        Handlebars.registerHelper("last", function(array) {
            return array[array.length-1];
        });
        Handlebars.registerHelper("first", function(array) {
            return array[0];
        });
        let template = null;
        if (expression.startsWith("{")) {
            template = Handlebars.compile(expression);
        }
        else {
            template = Handlebars.compile("{{{" + expression + "}}}");
        }
        const value = template(data);
        return value;
    }
}

module.exports = { TiledeskJSONEval }