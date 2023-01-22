class Filler {

  fill(text, parameters) {
    console.log("filling text...", text)
    if (text === null) {
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