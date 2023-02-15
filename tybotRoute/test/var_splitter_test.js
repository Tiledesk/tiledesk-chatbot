var assert = require('assert');
const { TiledeskVarSplitter } = require("../tiledeskChatbotPlugs/TiledeskVarSplitter");

describe('split vars', function() {
  
  it('split multiple vars', async () => {
    const str = 'Nome ${nome} Citta: ${city}';
    const splits = new TiledeskVarSplitter().getSplits(str);
    console.log("splits:", splits);
    assert(splits != null)
    assert(splits.length == 5);
    assert(splits[0].type === "text");
    assert(splits[1].type === "tag");
    assert(splits[2].type === "text");
    assert(splits[3].type === "tag");
    assert(splits[4].type === "text");
  });

  it('split string with one tag', async () => {
    const str2 = '${nome}';
    const splits2 = new TiledeskVarSplitter().getSplits(str2);
    // console.log("splits2:", splits2);
    assert(splits2 != null)
    assert(splits2.length == 3);
    assert(splits2[0].type === "text");
    assert(splits2[1].type === "tag");
    assert(splits2[2].type === "text");
  });

  it('split string with one tag', async () => {
    const str3 = '${city}${ip_address}';
    const splits3 = new TiledeskVarSplitter().getSplits(str3);
    // console.log("splits3:", splits3);
    assert(splits3 != null)
    assert(splits3.length == 5);
    assert(splits3[0].type === "text");
    assert(splits3[1].type === "tag");
    assert(splits3[2].type === "text");
    assert(splits3[1].type === "tag");
    assert(splits3[2].type === "text");
  });


  it('split empty string', async () => {
    const str3 = '';
    const splits3 = new TiledeskVarSplitter().getSplits(str3);
    // console.log("splits3:", splits3);
    assert(splits3 != null)
    assert(splits3.length == 1);
    assert(splits3[0].type === "text");
  });

  it('split multiple tags with the same name', async () => {
    const str3 = '${myname}${myname}${myname}';
    const splits3 = new TiledeskVarSplitter().getSplits(str3);
    // console.log("splits3:", splits3);
    assert(splits3 != null)
    assert(splits3.length == 7);
    assert(splits3[0].type === "text");
    assert(splits3[1].type === "tag");
    assert(splits3[1].name === "myname");
    assert(splits3[2].type === "text");
    assert(splits3[3].type === "tag");
    assert(splits3[3].name === "myname");
    assert(splits3[4].type === "text");
    assert(splits3[5].type === "tag");
    assert(splits3[5].name === "myname");
  });
  
});