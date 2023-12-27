const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskMath } = require('../../TiledeskMath');
const { TiledeskString } = require('../../TiledeskString');

class DirMoveInAttributes {

    constructor(context) {
        if (!context) {
            throw new Error('context object is mandatory.');
        }
        this.context = context;
        this.log = context.log;
    }

    execute(directive, callback) {
        let action;
        if (directive.action) {
            action = directive.action
        }
        else {
            callback();
            return;
        }
        this.go(action, () => {
            callback();
        });
    }

    async go(action, callback) {
        if (!action.attribute) {
            if (this.log) {console.error("(DirMoveInAttributes) Invalid action: attribute name is mandatory")};
            callback();
            return;
        }

        let transferFromAttribute = action.attribute;

        if (
            typeof transferFromAttribute === 'object' &&
            !Array.isArray(transferFromAttribute) &&
            a !== null
        ) {
            // console.log("transferFromAttribute is valid JSON")
        }
        else {
            if (this.log) {console.log("transferFromAttribute not an object. Cancel action");}
            callback();
            return;
        }
        let JSONAttribute = await TiledeskChatbot.addParameterStatic(this.context.tdcache, transferFromAttribute);
        for (const [key, value] of Object.entries(JSONAttribute)) {
            console.log(key, value);
            if (typeof key === 'string') {
                await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, key, value);
            }
            else {
                if (this.log) {console.log("(DirMoveInAttributes) JSONAttribute.key not a string. Skipping");}
            }
        }
        callback();
    }
}

module.exports = { DirMoveInAttributes };