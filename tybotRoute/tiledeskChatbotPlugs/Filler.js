var { Liquid } = require('liquidjs');
var engine = new Liquid();

class Filler {

  fill(text, parameters) {
    // create dynamic attributes
    if (parameters) {
      parameters["timestamp"] = Date.now(); // type number
      parameters["now"] = new Date(); // type Object  
    }
    
    // legacy parser first
    if (text == null || text == undefined || typeof text !== 'string') {
      // console.log("Skip filling. 'text' is null or not a string");
      return text;
    }
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        text = text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), value); //parameters[key]);
      }
    }
    
    // then post process with new LiquidJS!
    let result;
    try {
      result = engine
      .parseAndRenderSync(text, parameters, null);
    }
    catch(e) {
        console.error(e)
    }
    return result;
  }
  
}

module.exports = { Filler };