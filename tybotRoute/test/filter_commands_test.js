var assert = require('assert');
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil.js');

describe('filter commands()', function() {
  
  it('filter commands() on lang = en', async () => {
    let commands = [ 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command IT"
        }
      }
    ];

    TiledeskChatbotUtil.filterOnLanguage(commands, "en");
    console.log("commands after", commands);
    assert(commands.length == 1);
  });

  it('filter commands() on lang = it', async () => {
    let commands = [ 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command IT"
        }
      }
    ];

    TiledeskChatbotUtil.filterOnLanguage(commands, "it");
    console.log("commands after", commands);
    assert(commands.length == 2);
  });

  it('filter 10 commands on lang = it', async () => {
    let commands = [ 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 1 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 2 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 3 IT"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 4 IT"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 5 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 6 IT"
        }
      }
    ];

    TiledeskChatbotUtil.filterOnLanguage(commands, "it");
    console.log("commands after", commands);
    assert(commands.length == 6);
  });

  it('filter 10 commands on lang = en', async () => {
    let commands = [ 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 1 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 2 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 3 IT"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 4 IT"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 5 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 6 IT"
        }
      }
    ];

    TiledeskChatbotUtil.filterOnLanguage(commands, "en");
    console.log("commands after", commands);
    assert(commands.length == 5);
  });

  it('filter 10 commands on lang = en', async () => {
    let commands = [ 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 1 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 2 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 3 IT"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 4 IT"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "en",
          "text" : "command 5 EN"
        }
      }, 
      {
        "type" : "wait",
        "time" : 500
      }, 
      {
        "type" : "message",
        "message" : {
          "lang" : "it",
          "text" : "command 6 IT"
        }
      }
    ];

    TiledeskChatbotUtil.filterOnLanguage(commands, "en");
    console.log("commands after", commands);
    assert(commands.length == 6);
  });
  
});