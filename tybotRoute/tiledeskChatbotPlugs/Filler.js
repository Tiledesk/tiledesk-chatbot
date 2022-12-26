class Filler {

  fill(text, parameters) {
    if (parameters) {
      for (const [key, value] of Object.entries(parameters)) {
        text = text.replace(new RegExp("(\\$\\{" + key + "\\})", 'i'), parameters[key]);
      }
    }
    return text;
  }
  
}

module.exports = { Filler };