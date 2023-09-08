var { Liquid } = require('liquidjs');
var engine = new Liquid();

class Filler {

  fill(text, parameters) {
    // console.log("TexT:", text)
    if (text == null || text == undefined || typeof text !== 'string') {
      console.log("Skip filling. 'text' is null or not a string");
      return text;
    }
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        text = text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), value); //parameters[key]);
      }
    }

    console.log("temp text:", text);
    console.log("parameters:", parameters);
    
    // post process with new LiquidJS!
    let result;
    try {
      result = engine
      .parseAndRenderSync(text, parameters, null);
      console.log("result:", result);
    }
    catch(e) {
        console.error(e)
    }
    return result;
  }
  
}

module.exports = { Filler };