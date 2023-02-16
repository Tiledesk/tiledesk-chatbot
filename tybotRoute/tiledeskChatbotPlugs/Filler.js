class Filler {

  fill(text, parameters) {
    console.log("Tex;", text)
    if (text == null || text == undefined) {
      console.log("Skip filling. 'text' is null");
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