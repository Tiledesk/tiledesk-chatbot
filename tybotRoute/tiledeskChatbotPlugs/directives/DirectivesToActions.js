const { Directives } = require("./Directives");
const { DirMoveToAgent } = require('./DirMoveToAgent');
const { DirMessage } = require('./DirMessage');

class DirectivesToActions {

    static parse(directives) {
        let actions = [];
        if (directives && directives.length > 0) {
            directives.forEach(_d => {
                let action;
                switch (_d.name) {
                    case Directives.AGENT:
                        action = DirMoveToAgent.toAction(_d);
                    break;
                    case Directives.MESSAGE:
                        action = DirMessage.toAction(_d);
                    break;
                    default:
                        console.log("Unknown directive:", _d.name);
                }
                if (action) {
                    actions.push(action);
                }
            });
        }
        return actions;
    }
}

module.exports = { DirectivesToActions };