class TiledeskVarSplitter {
    contructor() {

    }

    getSplits(str) {
        // console.log("STR:", str)
        const regexp = new RegExp("\\$\\{([0-9a-zA-Z_]+)\\}", "gm");
        let splits = [];
        let match;
        let head_index = 0;
        while ((match = regexp.exec(str)) !== null) {
            // console.log("match",match);
            // console.log("match[0]",match[0]);
            // console.log("match[1]",match[1]);
            // console.log("****")
            // console.log("match.index",match.index);
            // console.log("match[0].length",match[0].length);
            const last_index = match.index + match[0].length;
            // console.log("last_index:", last_index);
            const head_text = str.substring(head_index, match.index)
            // console.log("head_text: '" + head_text + "'");
            splits.push(
                {
                    type:"text",
                    text: head_text
                });
            const tag_text = str.substring(match.index, last_index)
            // console.log("tag_text: '" + tag_text + "'");
            splits.push({
                type: "tag",
                name: match[1]
            });
            head_index = last_index;
            // str = str.substring(last_index);
            // console.log("rest str:", str)
        }
        splits.push({
            type:"text",
            text: str.substring(head_index)
        });
        return splits;
    }
}

module.exports = { TiledeskVarSplitter }