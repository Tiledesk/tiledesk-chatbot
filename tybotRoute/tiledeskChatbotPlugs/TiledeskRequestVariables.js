const { TiledeskChatbot } = require('../engine/TiledeskChatbot');

class TiledeskRequestVariables {
    
    constructor(requestId, tdcache, vars) {
        this.requestId = requestId;
        this.tdcache = tdcache;
        this.attributes = vars;
        this.ops = {
            set: {
            },
            del: {
            }
        }
    }

    async set(name, value, callback) {
        const parameter_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":parameters";
        await this.tdcache.hset(parameter_key, name, value);
        if (callback) {
            callback();
        }
    }

    async get(name, callback) {
        const parameter_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":parameters";
        const value = await this.tdcache.hget(parameter_key, name);
        if (callback) {
            callback(value);
        }
        else {
            return value;
        }
    }

    async delete(name) {
        const parameter_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":parameters";
        return await this.tdcache.hdel(parameter_key, name);
    }

    async all(callback) {
        const parameter_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":parameters";
        const values = await this.tdcache.hgetall(parameter_key);
        if (callback) {
            callback(values);
        }
        else {
            return values;
        }
    }

    setAttribute(key, value) {
        this.ops.set[key] = value;
    }

    deleteAttribute(key) {
        this.ops.del[key] = true;
    }

    allAttributes() {
        return this.attributes;
    }
}

module.exports = { TiledeskRequestVariables };