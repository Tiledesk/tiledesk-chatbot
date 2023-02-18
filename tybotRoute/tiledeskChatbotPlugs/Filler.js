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
    return text;
  }
  
}

module.exports = { Filler };